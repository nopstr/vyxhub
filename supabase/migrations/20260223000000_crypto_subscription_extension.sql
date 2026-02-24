-- ============================================================================
-- CRYPTO SUBSCRIPTION EXTENSION
-- Allows users to manually extend their crypto subscriptions
-- ============================================================================

CREATE OR REPLACE FUNCTION extend_crypto_subscription(
  p_subscription_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub RECORD;
  v_now TIMESTAMPTZ := NOW();
  v_days_until_expiry INT;
BEGIN
  -- Get the subscription
  SELECT * INTO v_sub
  FROM subscriptions
  WHERE id = p_subscription_id
    AND subscriber_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  -- Verify it's a crypto subscription
  IF v_sub.payment_method != 'crypto' THEN
    RAISE EXCEPTION 'Only crypto subscriptions can be manually extended';
  END IF;

  -- Verify it's active
  IF v_sub.status != 'active' THEN
    RAISE EXCEPTION 'Cannot extend an inactive subscription';
  END IF;

  -- Calculate days until expiry
  v_days_until_expiry := EXTRACT(DAY FROM (v_sub.current_period_end - v_now));

  -- Verify we are within the current month (<= 30 days until expiry)
  IF v_days_until_expiry > 30 THEN
    RAISE EXCEPTION 'Can only extend if the last month has already started';
  END IF;

  -- Extend the subscription by 1 month
  UPDATE subscriptions
  SET current_period_end = current_period_end + INTERVAL '1 month',
      updated_at = NOW()
  WHERE id = p_subscription_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_period_end', v_sub.current_period_end + INTERVAL '1 month'
  );
END;
$$;
