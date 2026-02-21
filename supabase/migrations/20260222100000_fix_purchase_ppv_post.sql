-- Fix: purchase_ppv_post references p.user_id but the posts table uses author_id
-- This caused "column p.user_id does not exist" when trying to unlock PPV posts/sets

CREATE OR REPLACE FUNCTION purchase_ppv_post(
  p_buyer_id UUID,
  p_post_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_post RECORD;
  v_fee_rate NUMERIC(5,4);
  v_fee NUMERIC(12,2);
  v_net NUMERIC(12,2);
  v_tx_id UUID;
  v_already_purchased BOOLEAN;
BEGIN
  -- Get post with creator info (author_id, not user_id)
  SELECT p.id, p.author_id AS creator_id, p.price, p.visibility
  INTO v_post
  FROM posts p
  WHERE p.id = p_post_id;

  IF v_post IS NULL THEN
    RAISE EXCEPTION 'Post not found';
  END IF;

  IF v_post.creator_id = p_buyer_id THEN
    RAISE EXCEPTION 'Cannot purchase your own post';
  END IF;

  IF v_post.price IS NULL OR v_post.price <= 0 THEN
    RAISE EXCEPTION 'This post is not a paid post';
  END IF;

  -- Check if already purchased
  SELECT EXISTS(
    SELECT 1 FROM purchases WHERE buyer_id = p_buyer_id AND post_id = p_post_id
  ) INTO v_already_purchased;

  IF v_already_purchased THEN
    RAISE EXCEPTION 'Already purchased';
  END IF;

  -- Record purchase
  INSERT INTO purchases (buyer_id, post_id, amount)
  VALUES (p_buyer_id, p_post_id, v_post.price);

  -- Compute fee
  v_fee_rate := get_creator_fee_rate(v_post.creator_id);
  v_fee := ROUND(v_post.price * v_fee_rate, 2);
  v_net := v_post.price - v_fee;

  -- Record transaction
  INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, reference_id, status)
  VALUES (p_buyer_id, v_post.creator_id, 'ppv_post', v_post.price, v_fee, v_net, p_post_id, 'completed')
  RETURNING id INTO v_tx_id;

  -- Credit wallet
  PERFORM credit_wallet(v_post.creator_id, v_tx_id, 'ppv_post', v_post.price, p_buyer_id);

  RETURN jsonb_build_object(
    'success', true,
    'amount', v_post.price,
    'fee', v_fee,
    'net', v_net
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
