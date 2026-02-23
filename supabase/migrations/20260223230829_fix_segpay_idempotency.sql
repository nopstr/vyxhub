-- ═══════════════════════════════════════════════════════════════════════════
-- FIX SEGPAY IDEMPOTENCY & DUPLICATE PAYMENTS
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Add unique constraint to payment_sessions to prevent duplicate Segpay transactions
-- We only enforce uniqueness where segpay_transaction_id is not null.
ALTER TABLE payment_sessions 
  ADD CONSTRAINT payment_sessions_segpay_transaction_id_key 
  UNIQUE (segpay_transaction_id);

-- 2. Update process_segpay_rebill to be idempotent
CREATE OR REPLACE FUNCTION process_segpay_rebill(
  p_segpay_subscription_id TEXT,
  p_segpay_transaction_id TEXT,
  p_amount NUMERIC(10,2)
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub RECORD;
  v_fee_rate NUMERIC(5,4);
  v_fee NUMERIC(12,2);
  v_net NUMERIC(12,2);
  v_tx_id UUID;
  v_existing_session UUID;
BEGIN
  -- Service role only
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' != 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  -- Check if this transaction was already processed
  SELECT id INTO v_existing_session FROM payment_sessions 
  WHERE segpay_transaction_id = p_segpay_transaction_id;
  
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already processed', 'session_id', v_existing_session);
  END IF;

  -- Find the subscription by Segpay subscription ID
  SELECT * INTO v_sub FROM subscriptions
  WHERE segpay_subscription_id = p_segpay_subscription_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription not found');
  END IF;

  -- Record in payment_sessions for audit trail FIRST to claim the unique constraint
  -- If two concurrent requests hit this, the second will fail on the unique constraint
  INSERT INTO payment_sessions (
    user_id, payment_method, payment_type, usd_amount, 
    metadata, segpay_transaction_id, segpay_subscription_id, 
    status, is_processed, completed_at
  )
  VALUES (
    v_sub.subscriber_id, 'segpay', 'subscription', p_amount,
    jsonb_build_object('creator_id', v_sub.creator_id, 'rebill', true),
    p_segpay_transaction_id, p_segpay_subscription_id, 
    'completed', true, NOW()
  )
  RETURNING id INTO v_existing_session;

  -- Extend subscription by 30 days
  UPDATE subscriptions
  SET expires_at = GREATEST(expires_at, NOW()) + INTERVAL '30 days',
      price_paid = p_amount,
      updated_at = NOW()
  WHERE id = v_sub.id;

  -- Calculate fees and credit wallet
  v_fee_rate := get_creator_fee_rate(v_sub.creator_id);
  v_fee := ROUND(p_amount * v_fee_rate, 2);
  v_net := p_amount - v_fee;

  -- Record transaction
  INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, status)
  VALUES (v_sub.subscriber_id, v_sub.creator_id, 'subscription', p_amount, v_fee, v_net, 'completed')
  RETURNING id INTO v_tx_id;

  -- Credit creator wallet
  PERFORM credit_wallet(v_sub.creator_id, v_tx_id, 'subscription', p_amount, v_sub.subscriber_id);

  RETURN jsonb_build_object('success', true, 'subscription_id', v_sub.id, 'new_expires_at', (v_sub.expires_at + INTERVAL '30 days'));
END;
$$;
