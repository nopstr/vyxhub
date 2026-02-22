-- 1. Update create_content_promotion to deduct from wallet balance
CREATE OR REPLACE FUNCTION create_content_promotion(
  p_type TEXT,
  p_post_id UUID DEFAULT NULL,
  p_duration_hours INTEGER DEFAULT 24
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pricing JSONB;
  v_cost DECIMAL;
  v_promo content_promotions%ROWTYPE;
  v_wallet RECORD;
  v_withdrawable NUMERIC(12,2);
BEGIN
  -- Validate creator
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_creator = true) THEN
    RAISE EXCEPTION 'Only creators can create promotions';
  END IF;

  -- Validate type
  IF p_type NOT IN ('post', 'profile') THEN
    RAISE EXCEPTION 'Invalid promotion type. Must be post or profile';
  END IF;

  -- Post promotions require a post_id that belongs to the creator
  IF p_type = 'post' THEN
    IF p_post_id IS NULL THEN
      RAISE EXCEPTION 'Post ID required for post promotions';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM posts WHERE id = p_post_id AND author_id = auth.uid()) THEN
      RAISE EXCEPTION 'Post not found or not owned by you';
    END IF;
  END IF;

  -- Get pricing
  v_pricing := get_ad_pricing();
  v_cost := ROUND(p_duration_hours * (v_pricing->>'effective_rate_per_hour')::DECIMAL, 2);

  IF v_cost < 5 THEN
    v_cost := 5;  -- Minimum $5
  END IF;

  -- Get wallet and lock it
  SELECT * INTO v_wallet FROM wallets WHERE creator_id = auth.uid() FOR UPDATE;
  
  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'Wallet not found. You must earn funds before you can purchase promotions.';
  END IF;

  -- Check if they have enough withdrawable balance
  SELECT COALESCE(SUM(net_amount), 0) INTO v_withdrawable
  FROM wallet_transactions
  WHERE creator_id = auth.uid()
    AND status = 'available';

  IF v_withdrawable < v_cost THEN
    RAISE EXCEPTION 'Insufficient wallet balance. Cost is $%, but you only have $% available.', v_cost, v_withdrawable;
  END IF;

  -- Deduct from wallet balance
  UPDATE wallets
  SET balance = balance - v_cost,
      updated_at = NOW()
  WHERE id = v_wallet.id;

  -- Insert a negative wallet transaction to offset the available balance
  INSERT INTO wallet_transactions (
    wallet_id, creator_id, transaction_type, gross_amount, platform_fee, net_amount, fee_rate,
    is_withdrawable, withdrawable_at, status
  ) VALUES (
    v_wallet.id, auth.uid(), 'ad_spend', -v_cost, 0, -v_cost, 0,
    TRUE, NOW(), 'available'
  );

  -- Create the promotion
  INSERT INTO content_promotions (
    creator_id, promotion_type, post_id, budget, duration_hours,
    starts_at, ends_at, status
  ) VALUES (
    auth.uid(), p_type, p_post_id, v_cost, p_duration_hours,
    NOW(), NOW() + (p_duration_hours || ' hours')::INTERVAL, 'active'
  ) RETURNING * INTO v_promo;

  -- Record transaction
  INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, reference_id, status)
  VALUES (auth.uid(), NULL, 'ad', v_cost, v_cost, 0, v_promo.id, 'completed');

  RETURN jsonb_build_object(
    'success', true,
    'promotion_id', v_promo.id,
    'cost', v_cost,
    'starts_at', v_promo.starts_at,
    'ends_at', v_promo.ends_at
  );
END;
$$;
