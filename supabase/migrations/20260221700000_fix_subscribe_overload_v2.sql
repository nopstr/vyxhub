-- Fix: Nuclear approach - drop ALL overloads of subscribe_to_creator and recreate only the correct one.
-- The previous DROP may not have matched because DECIMAL vs NUMERIC type aliasing.

-- Drop every possible overload
DROP FUNCTION IF EXISTS subscribe_to_creator(UUID, UUID, DECIMAL);
DROP FUNCTION IF EXISTS subscribe_to_creator(UUID, UUID, NUMERIC);
DROP FUNCTION IF EXISTS subscribe_to_creator(UUID, UUID, DECIMAL, UUID);
DROP FUNCTION IF EXISTS subscribe_to_creator(UUID, UUID, NUMERIC, UUID);

-- Recreate the single correct version
CREATE OR REPLACE FUNCTION subscribe_to_creator(
  p_subscriber_id UUID,
  p_creator_id UUID,
  p_price NUMERIC,
  p_referrer_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_existing RECORD;
  v_expires_at TIMESTAMPTZ;
  v_promo RECORD;
  v_actual_price NUMERIC(10,2);
  v_sub_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_creator_id AND is_creator = true) THEN
    RAISE EXCEPTION 'Creator not found';
  END IF;

  IF p_subscriber_id = p_creator_id THEN
    RAISE EXCEPTION 'Cannot subscribe to yourself';
  END IF;

  v_expires_at := NOW() + INTERVAL '30 days';

  SELECT * INTO v_promo
  FROM creator_promotions
  WHERE creator_id = p_creator_id
    AND active = true
    AND starts_at <= NOW()
    AND expires_at > NOW()
    AND (max_uses IS NULL OR used_count < max_uses)
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_promo IS NOT NULL THEN
    v_actual_price := v_promo.promo_price;
    UPDATE creator_promotions SET used_count = used_count + 1 WHERE id = v_promo.id;
  ELSE
    v_actual_price := p_price;
  END IF;

  SELECT * INTO v_existing FROM subscriptions
  WHERE subscriber_id = p_subscriber_id AND creator_id = p_creator_id;

  IF v_existing IS NOT NULL THEN
    UPDATE subscriptions
    SET status = 'active',
        price_paid = v_actual_price,
        starts_at = NOW(),
        expires_at = CASE
          WHEN status = 'active' AND expires_at > NOW() THEN expires_at + INTERVAL '30 days'
          ELSE v_expires_at
        END
    WHERE id = v_existing.id
    RETURNING id INTO v_sub_id;
  ELSE
    INSERT INTO subscriptions (subscriber_id, creator_id, price_paid, status, starts_at, expires_at)
    VALUES (p_subscriber_id, p_creator_id, v_actual_price, 'active', NOW(), v_expires_at)
    RETURNING id INTO v_sub_id;
  END IF;

  IF p_referrer_id IS NOT NULL AND p_referrer_id != p_subscriber_id THEN
    INSERT INTO referrals (referrer_id, referred_user_id, subscription_id, creator_id, subscription_amount)
    VALUES (p_referrer_id, p_subscriber_id, v_sub_id, p_creator_id, v_actual_price)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'expires_at', v_expires_at,
    'price_paid', v_actual_price,
    'promotion_applied', v_promo IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
