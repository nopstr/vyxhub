-- Enforce maximum 50% discount on all promotions and promo codes

-- Drop and recreate create_promotion with 50% cap (returns JSONB, matches original signature)
DROP FUNCTION IF EXISTS create_promotion(UUID, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION create_promotion(
  p_creator_id UUID,
  p_discount_percent INTEGER,
  p_duration_days INTEGER DEFAULT 7
) RETURNS JSONB AS $$
DECLARE
  v_price DECIMAL(10,2);
  v_promo_price DECIMAL(10,2);
  v_promo_id UUID;
BEGIN
  SELECT subscription_price INTO v_price
  FROM profiles
  WHERE id = p_creator_id AND is_creator = true;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'Creator not found or no subscription price set';
  END IF;

  IF p_discount_percent < 5 OR p_discount_percent > 50 THEN
    RAISE EXCEPTION 'Discount must be between 5%% and 50%%';
  END IF;

  IF p_duration_days < 1 OR p_duration_days > 90 THEN
    RAISE EXCEPTION 'Duration must be between 1 and 90 days';
  END IF;

  -- Deactivate any existing active promos
  UPDATE creator_promotions
  SET active = false
  WHERE creator_id = p_creator_id AND active = true;

  v_promo_price := ROUND(v_price * (100 - p_discount_percent) / 100, 2);

  INSERT INTO creator_promotions (creator_id, discount_percent, promo_price, original_price, starts_at, expires_at)
  VALUES (p_creator_id, p_discount_percent, v_promo_price, v_price, NOW(), NOW() + (p_duration_days || ' days')::INTERVAL)
  RETURNING id INTO v_promo_id;

  RETURN jsonb_build_object(
    'success', true,
    'promo_id', v_promo_id,
    'original_price', v_price,
    'promo_price', v_promo_price,
    'discount_percent', p_discount_percent,
    'expires_at', NOW() + (p_duration_days || ' days')::INTERVAL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update create_promo_code to cap discount at 50% (matches original signature: p_code, p_discount_percent, p_duration_days, p_max_uses)
CREATE OR REPLACE FUNCTION create_promo_code(
  p_code TEXT,
  p_discount_percent INTEGER,
  p_duration_days INTEGER DEFAULT 30,
  p_max_uses INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_promo promo_codes%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_creator = true) THEN
    RAISE EXCEPTION 'Only creators can create promo codes';
  END IF;
  
  IF LENGTH(TRIM(p_code)) < 3 OR LENGTH(TRIM(p_code)) > 20 THEN
    RAISE EXCEPTION 'Code must be 3-20 characters';
  END IF;
  
  IF p_discount_percent < 5 OR p_discount_percent > 50 THEN
    RAISE EXCEPTION 'Discount must be between 5%% and 50%%';
  END IF;
  
  INSERT INTO promo_codes (code, creator_id, discount_percent, max_uses, valid_until)
  VALUES (UPPER(TRIM(p_code)), auth.uid(), p_discount_percent, p_max_uses, NOW() + (p_duration_days || ' days')::INTERVAL)
  RETURNING * INTO v_promo;
  
  RETURN jsonb_build_object(
    'success', true,
    'id', v_promo.id,
    'code', v_promo.code,
    'discount_percent', v_promo.discount_percent,
    'valid_until', v_promo.valid_until
  );
END;
$$;
