-- Fix critical vulnerabilities in crypto payment processing RPCs

-- 1. Secure update_crypto_payment_status to only allow service_role
CREATE OR REPLACE FUNCTION update_crypto_payment_status(
  p_provider_payment_id TEXT,
  p_status TEXT,
  p_provider_data JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_payment_id UUID;
  v_current_status TEXT;
  v_is_processed BOOLEAN;
BEGIN
  -- SECURITY FIX: Only allow service_role (webhook) to call this function
  IF current_setting('role') != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: Only service_role can update payment status';
  END IF;

  SELECT id, payment_status, is_processed
  INTO v_payment_id, v_current_status, v_is_processed
  FROM crypto_payments
  WHERE provider_payment_id = p_provider_payment_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Don't modify already-terminal or processed payments
  IF v_is_processed OR v_current_status IN ('finished', 'failed', 'refunded') THEN
    RETURN v_payment_id;
  END IF;

  -- Update status and provider data
  UPDATE crypto_payments SET
    payment_status = p_status,
    provider_data = provider_data || p_provider_data,
    confirmed_at = CASE
      WHEN p_status IN ('confirmed', 'sending', 'finished') AND confirmed_at IS NULL
      THEN NOW()
      ELSE confirmed_at
    END,
    updated_at = NOW()
  WHERE id = v_payment_id;

  -- If the payment is in a confirmed/finished state, process business logic
  IF p_status IN ('confirmed', 'sending', 'finished') THEN
    PERFORM process_confirmed_crypto_payment(v_payment_id, p_provider_payment_id, p_provider_data);
  END IF;

  RETURN v_payment_id;
END;
$$;

-- 2. Secure process_confirmed_crypto_payment to only allow service_role and check status
CREATE OR REPLACE FUNCTION process_confirmed_crypto_payment(
  p_crypto_payment_id UUID,
  p_provider_payment_id TEXT DEFAULT NULL,
  p_provider_data JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cp crypto_payments%ROWTYPE;
  v_creator_id UUID;
  v_post_id UUID;
  v_conversation_id UUID;
  v_message_id UUID;
BEGIN
  -- SECURITY FIX: Only allow service_role (webhook) to call this function
  IF current_setting('role') != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: Only service_role can process payments';
  END IF;

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

  -- SECURITY FIX: Ensure payment is actually confirmed before processing
  IF cp.payment_status NOT IN ('confirmed', 'sending', 'finished') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment is not confirmed');
  END IF;

  -- Set auth context to the paying user so existing RPCs see correct auth.uid()
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', cp.user_id::text,
    'role', 'authenticated',
    'is_webhook', 'true' -- Add is_webhook claim to bypass frontend checks
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
        p_post_id := v_post_id
      );

    WHEN 'unlock' THEN
      PERFORM unlock_post(
        p_post_id := v_post_id,
        p_user_id := cp.user_id,
        p_price := cp.usd_amount
      );

    WHEN 'wallet_deposit' THEN
      UPDATE wallets
      SET balance = balance + cp.usd_amount,
          updated_at = NOW()
      WHERE user_id = cp.user_id;

      INSERT INTO transactions (
        user_id, type, amount, status, description, metadata
      ) VALUES (
        cp.user_id, 'deposit', cp.usd_amount, 'completed',
        'Crypto deposit via NOWPayments',
        jsonb_build_object('crypto_payment_id', cp.id, 'provider_payment_id', p_provider_payment_id)
      );

    WHEN 'message_unlock' THEN
      v_message_id := (cp.payment_metadata->>'message_id')::UUID;
      v_conversation_id := (cp.payment_metadata->>'conversation_id')::UUID;
      
      PERFORM unlock_message(
        p_message_id := v_message_id,
        p_user_id := cp.user_id,
        p_price := cp.usd_amount
      );

    WHEN 'custom_request' THEN
      PERFORM pay_custom_request(
        p_request_id := (cp.payment_metadata->>'request_id')::UUID,
        p_user_id := cp.user_id,
        p_price := cp.usd_amount
      );

    ELSE
      RAISE EXCEPTION 'Unknown payment type: %', cp.payment_type;
  END CASE;

  -- Mark as processed
  UPDATE crypto_payments
  SET is_processed = TRUE,
      updated_at = NOW()
  WHERE id = cp.id;

  -- Reset auth context
  PERFORM set_config('request.jwt.claims', '', true);

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  -- Reset auth context on error
  PERFORM set_config('request.jwt.claims', '', true);
  
  -- Log error to provider_data
  UPDATE crypto_payments
  SET provider_data = provider_data || jsonb_build_object('processing_error', SQLERRM),
      updated_at = NOW()
  WHERE id = cp.id;
  
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
