-- 1. Update custom_requests status constraint
ALTER TABLE custom_requests DROP CONSTRAINT IF EXISTS custom_requests_status_check;
ALTER TABLE custom_requests ADD CONSTRAINT custom_requests_status_check CHECK (status IN ('pending', 'accepted', 'paid', 'declined', 'completed', 'cancelled'));

-- 2. Update respond_to_custom_request to add notifications
CREATE OR REPLACE FUNCTION respond_to_custom_request(
  p_request_id UUID,
  p_action TEXT,
  p_note TEXT DEFAULT NULL,
  p_price NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request custom_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request FROM custom_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF auth.uid() != v_request.creator_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_request.status != 'pending' THEN
    RAISE EXCEPTION 'Request is no longer pending';
  END IF;

  IF p_action = 'accept' THEN
    UPDATE custom_requests
    SET status = 'accepted',
        creator_note = p_note,
        price = COALESCE(p_price, v_request.price),
        updated_at = NOW()
    WHERE id = p_request_id;

    -- Notify requester
    INSERT INTO notifications (
      user_id,
      actor_id,
      type,
      entity_type,
      entity_id,
      message
    ) VALUES (
      v_request.requester_id,
      v_request.creator_id,
      'custom_request_accepted',
      'custom_request',
      p_request_id,
      'Your custom request has been accepted! Please complete the payment.'
    );
  ELSIF p_action = 'decline' THEN
    UPDATE custom_requests
    SET status = 'declined',
        creator_note = p_note,
        updated_at = NOW()
    WHERE id = p_request_id;

    -- Notify requester
    INSERT INTO notifications (
      user_id,
      actor_id,
      type,
      entity_type,
      entity_id,
      message
    ) VALUES (
      v_request.requester_id,
      v_request.creator_id,
      'custom_request_declined',
      'custom_request',
      p_request_id,
      'Your custom request was declined.'
    );
  ELSE
    RAISE EXCEPTION 'Invalid action. Use accept or decline.';
  END IF;

  RETURN jsonb_build_object('success', true, 'action', p_action);
END;
$$;

-- 3. Create pay_custom_request RPC
CREATE OR REPLACE FUNCTION pay_custom_request(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request custom_requests%ROWTYPE;
  v_is_webhook BOOLEAN;
BEGIN
  -- Verify webhook claim
  v_is_webhook := COALESCE((current_setting('request.jwt.claims', true)::jsonb->>'is_webhook')::boolean, false);
  
  IF NOT v_is_webhook THEN
    RAISE EXCEPTION 'Unauthorized: Only webhooks can process payments';
  END IF;

  SELECT * INTO v_request FROM custom_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.status != 'accepted' THEN
    RAISE EXCEPTION 'Request must be accepted before payment';
  END IF;

  -- Update status to paid
  UPDATE custom_requests
  SET status = 'paid',
      updated_at = NOW()
  WHERE id = p_request_id;

  -- Create notification for creator
  INSERT INTO notifications (
    user_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    message
  ) VALUES (
    v_request.creator_id,
    v_request.requester_id,
    'custom_request_paid',
    'custom_request',
    p_request_id,
    'A custom request has been paid and is ready for delivery'
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', 'paid'
  );
END;
$$;

-- 4. Update complete_custom_request to require 'paid' status
CREATE OR REPLACE FUNCTION complete_custom_request(
  p_request_id UUID,
  p_delivery_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_request custom_requests%ROWTYPE;
  v_fee_rate NUMERIC(5,4);
  v_fee NUMERIC;
  v_net NUMERIC;
  v_tx_id UUID;
BEGIN
  SELECT * INTO v_request FROM custom_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF auth.uid() != v_request.creator_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_request.status != 'paid' THEN
    RAISE EXCEPTION 'Request must be paid before completing';
  END IF;

  -- Use per-creator fee rate
  v_fee_rate := get_creator_fee_rate(v_request.creator_id);
  v_fee := ROUND(v_request.price * v_fee_rate, 2);
  v_net := v_request.price - v_fee;

  -- Update request status
  UPDATE custom_requests
  SET status = 'completed',
      delivery_url = p_delivery_url,
      updated_at = NOW()
  WHERE id = p_request_id;

  -- Credit creator wallet
  INSERT INTO wallet_transactions (
    wallet_id,
    type,
    amount,
    fee,
    net_amount,
    status,
    reference_type,
    reference_id,
    description
  )
  SELECT 
    id,
    'credit',
    v_request.price,
    v_fee,
    v_net,
    'completed',
    'custom_request',
    p_request_id,
    'Custom request completion'
  FROM wallets
  WHERE user_id = v_request.creator_id
  RETURNING id INTO v_tx_id;

  -- Update wallet balance
  UPDATE wallets
  SET balance = balance + v_net,
      total_earned = total_earned + v_net,
      updated_at = NOW()
  WHERE user_id = v_request.creator_id;

  -- Notify requester
  INSERT INTO notifications (
    user_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    message
  ) VALUES (
    v_request.requester_id,
    v_request.creator_id,
    'custom_request_completed',
    'custom_request',
    p_request_id,
    'Your custom request has been completed!'
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'transaction_id', v_tx_id,
    'net_earned', v_net
  );
END;
$$;

-- 5. Update process_confirmed_crypto_payment to handle custom_request
CREATE OR REPLACE FUNCTION process_confirmed_crypto_payment(
  p_crypto_payment_id UUID,
  p_provider_payment_id TEXT DEFAULT NULL,
  p_provider_data JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cp crypto_payments%ROWTYPE;
  v_creator_id UUID;
  v_post_id UUID;
  v_conversation_id UUID;
  v_message_id UUID;
  v_request_id UUID;
BEGIN
  -- Lock the record to prevent double-processing
  SELECT * INTO cp FROM crypto_payments
  WHERE id = p_crypto_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  IF cp.is_processed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already processed');
  END IF;

  -- Set auth context to the paying user so existing RPCs see correct auth.uid()
  -- ADDED: is_webhook = true to allow inner RPCs to verify they were called by the webhook
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', cp.user_id::text,
    'role', 'authenticated',
    'is_webhook', 'true'
  )::text, true);

  -- Extract common metadata
  v_creator_id := (cp.payment_metadata->>'creator_id')::UUID;
  v_post_id := NULLIF(cp.payment_metadata->>'post_id', '')::UUID;

  -- Execute business logic based on payment type
  CASE cp.payment_type
    WHEN 'subscription' THEN
      PERFORM process_subscription(
        p_subscriber_id := cp.user_id,
        p_creator_id := v_creator_id,
        p_price := cp.usd_amount,
        p_referrer_id := NULLIF(cp.payment_metadata->>'referrer_id', '')::UUID
      );

    WHEN 'tip' THEN
      PERFORM send_tip(
        p_from_user_id := cp.user_id,
        p_to_user_id := v_creator_id,
        p_amount := cp.usd_amount,
        p_post_id := v_post_id,
        p_message := cp.payment_metadata->>'message'
      );

    WHEN 'ppv_post' THEN
      PERFORM purchase_ppv_post(
        p_buyer_id := cp.user_id,
        p_post_id := v_post_id
      );

    WHEN 'message_unlock' THEN
      v_conversation_id := (cp.payment_metadata->>'conversation_id')::UUID;
      PERFORM pay_message_unlock(
        p_sender_id := cp.user_id,
        p_receiver_id := v_creator_id,
        p_conversation_id := v_conversation_id
      );

    WHEN 'payment_request' THEN
      v_message_id := (cp.payment_metadata->>'message_id')::UUID;
      PERFORM pay_message_request(
        p_payer_id := cp.user_id,
        p_message_id := v_message_id
      );

    WHEN 'plus_subscription' THEN
      PERFORM subscribe_to_plus(
        p_user_id := cp.user_id,
        p_tier := cp.payment_metadata->>'tier'
      );

    WHEN 'custom_request' THEN
      v_request_id := (cp.payment_metadata->>'request_id')::UUID;
      PERFORM pay_custom_request(
        p_request_id := v_request_id
      );

    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Unknown payment type: ' || cp.payment_type);
  END CASE;

  -- Mark as processed
  UPDATE crypto_payments SET
    payment_status = 'finished',
    is_processed = TRUE,
    confirmed_at = COALESCE(cp.confirmed_at, NOW()),
    processed_at = NOW(),
    provider_payment_id = COALESCE(p_provider_payment_id, cp.provider_payment_id),
    provider_data = cp.provider_data || p_provider_data,
    updated_at = NOW()
  WHERE id = p_crypto_payment_id;

  RETURN jsonb_build_object('success', true, 'payment_id', p_crypto_payment_id);
END;
$$;
