-- Secure payment RPCs to prevent direct frontend calls bypassing payment
-- 1. Update process_confirmed_crypto_payment to set is_webhook claim
-- 2. Update payment RPCs to require is_webhook claim (except for free bypasses)

-- Update process_confirmed_crypto_payment
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

  RETURN jsonb_build_object('success', true, 'payment_type', cp.payment_type);

EXCEPTION WHEN OTHERS THEN
  -- Log the error on the record
  UPDATE crypto_payments SET
    payment_status = 'failed',
    provider_data = cp.provider_data || jsonb_build_object('processing_error', SQLERRM),
    updated_at = NOW()
  WHERE id = p_crypto_payment_id;

  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Update purchase_ppv_post
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
  -- SECURITY CHECK: Ensure this is called by the webhook
  IF current_setting('request.jwt.claims', true)::jsonb->>'is_webhook' != 'true' THEN
    RAISE EXCEPTION 'Payment required. Please use the crypto payment flow.';
  END IF;

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

-- Update process_subscription
CREATE OR REPLACE FUNCTION process_subscription(
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
  v_fee_rate NUMERIC(5,4);
  v_fee NUMERIC(12,2);
  v_net NUMERIC(12,2);
  v_tx_id UUID;
  v_wallet_result JSONB;
BEGIN
  -- SECURITY CHECK: Ensure this is called by the webhook or is a free subscription
  IF p_price > 0 AND current_setting('request.jwt.claims', true)::jsonb->>'is_webhook' != 'true' THEN
    RAISE EXCEPTION 'Payment required. Please use the crypto payment flow.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_creator_id AND is_creator = true) THEN
    RAISE EXCEPTION 'Creator not found';
  END IF;

  IF p_subscriber_id = p_creator_id THEN
    RAISE EXCEPTION 'Cannot subscribe to yourself';
  END IF;

  v_expires_at := NOW() + INTERVAL '30 days';

  -- Check for promotion
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

  -- Create/update subscription
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

  -- Record referral
  IF p_referrer_id IS NOT NULL AND p_referrer_id != p_subscriber_id THEN
    INSERT INTO referrals (referrer_id, referred_user_id, subscription_id, creator_id, subscription_amount)
    VALUES (p_referrer_id, p_subscriber_id, v_sub_id, p_creator_id, v_actual_price)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Compute fee using per-creator rate
  v_fee_rate := get_creator_fee_rate(p_creator_id);
  v_fee := ROUND(v_actual_price * v_fee_rate, 2);
  v_net := v_actual_price - v_fee;

  -- Record transaction server-side
  INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, reference_id, status)
  VALUES (p_subscriber_id, p_creator_id, 'subscription', v_actual_price, v_fee, v_net, v_sub_id, 'completed')
  RETURNING id INTO v_tx_id;

  -- Credit wallet
  v_wallet_result := credit_wallet(p_creator_id, v_tx_id, 'subscription', v_actual_price, p_subscriber_id);

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_sub_id,
    'expires_at', v_expires_at,
    'price_paid', v_actual_price,
    'promotion_applied', v_promo IS NOT NULL,
    'fee', v_fee,
    'net', v_net
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update send_tip
CREATE OR REPLACE FUNCTION send_tip(
  p_from_user_id UUID,
  p_to_user_id UUID,
  p_amount DECIMAL,
  p_post_id UUID DEFAULT NULL,
  p_message TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_fee_rate NUMERIC(5,4);
  v_fee DECIMAL(10,2);
  v_net DECIMAL(10,2);
  v_tx_id UUID;
BEGIN
  -- SECURITY CHECK: Ensure this is called by the webhook
  IF current_setting('request.jwt.claims', true)::jsonb->>'is_webhook' != 'true' THEN
    RAISE EXCEPTION 'Payment required. Please use the crypto payment flow.';
  END IF;

  IF p_from_user_id = p_to_user_id THEN
    RAISE EXCEPTION 'Cannot tip yourself';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Tip amount must be greater than 0';
  END IF;

  v_fee_rate := get_creator_fee_rate(p_to_user_id);
  v_fee := ROUND(p_amount * v_fee_rate, 2);
  v_net := p_amount - v_fee;

  INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, reference_id, status)
  VALUES (p_from_user_id, p_to_user_id, 'tip', p_amount, v_fee, v_net, p_post_id, 'completed')
  RETURNING id INTO v_tx_id;

  IF p_message IS NOT NULL THEN
    INSERT INTO tip_messages (transaction_id, from_user_id, to_user_id, message, amount)
    VALUES (v_tx_id, p_from_user_id, p_to_user_id, p_message, p_amount);
  END IF;

  PERFORM credit_wallet(p_to_user_id, v_tx_id, 'tip', p_amount, p_from_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'amount', p_amount,
    'fee', v_fee,
    'net', v_net,
    'transaction_id', v_tx_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update pay_message_unlock
CREATE OR REPLACE FUNCTION pay_message_unlock(
  p_sender_id UUID,
  p_receiver_id UUID,
  p_conversation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_price DECIMAL(10,2);
  v_fee_rate NUMERIC(5,4);
  v_fee DECIMAL(10,2);
  v_net DECIMAL(10,2);
  v_tx_id UUID;
  v_sender_is_plus BOOLEAN;
BEGIN
  SELECT COALESCE(message_price, 0) INTO v_price
  FROM profiles WHERE id = p_receiver_id;

  IF v_price <= 0 THEN
    RETURN jsonb_build_object('success', TRUE, 'amount', 0);
  END IF;

  -- VyxHub+ users get free DM unlock
  SELECT (is_plus = TRUE AND plus_expires_at > NOW()) INTO v_sender_is_plus
  FROM profiles WHERE id = p_sender_id;

  IF v_sender_is_plus THEN
    RETURN jsonb_build_object('success', TRUE, 'amount', 0, 'plus_bypass', TRUE);
  END IF;

  -- SECURITY CHECK: Ensure this is called by the webhook (since it's not a free bypass)
  IF current_setting('request.jwt.claims', true)::jsonb->>'is_webhook' != 'true' THEN
    RAISE EXCEPTION 'Payment required. Please use the crypto payment flow.';
  END IF;

  -- Use per-creator fee rate
  v_fee_rate := get_creator_fee_rate(p_receiver_id);
  v_fee := ROUND(v_price * v_fee_rate, 2);
  v_net := v_price - v_fee;

  INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, reference_id, status)
  VALUES (p_sender_id, p_receiver_id, 'message_unlock', v_price, v_fee, v_net, p_conversation_id, 'completed')
  RETURNING id INTO v_tx_id;

  -- Credit wallet
  PERFORM credit_wallet(p_receiver_id, v_tx_id, 'message_unlock', v_price, p_sender_id);

  RETURN jsonb_build_object('success', TRUE, 'amount', v_price);
END;
$$;

-- Update pay_message_request
CREATE OR REPLACE FUNCTION pay_message_request(
  p_payer_id UUID,
  p_message_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_msg RECORD;
  v_fee_rate NUMERIC(5,4);
  v_fee DECIMAL(10,2);
  v_net DECIMAL(10,2);
  v_tx_id UUID;
BEGIN
  -- SECURITY CHECK: Ensure this is called by the webhook
  IF current_setting('request.jwt.claims', true)::jsonb->>'is_webhook' != 'true' THEN
    RAISE EXCEPTION 'Payment required. Please use the crypto payment flow.';
  END IF;

  SELECT * INTO v_msg FROM messages WHERE id = p_message_id;
  
  IF v_msg IS NULL THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  IF v_msg.payment_amount IS NULL OR v_msg.payment_amount <= 0 THEN
    RAISE EXCEPTION 'Message does not require payment';
  END IF;

  IF v_msg.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Message already paid';
  END IF;

  v_fee_rate := get_creator_fee_rate(v_msg.sender_id);
  v_fee := ROUND(v_msg.payment_amount * v_fee_rate, 2);
  v_net := v_msg.payment_amount - v_fee;

  INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, reference_id, status)
  VALUES (p_payer_id, v_msg.sender_id, 'payment_request', v_msg.payment_amount, v_fee, v_net, p_message_id, 'completed')
  RETURNING id INTO v_tx_id;

  UPDATE messages SET payment_status = 'paid' WHERE id = p_message_id;

  PERFORM credit_wallet(v_msg.sender_id, v_tx_id, 'payment_request', v_msg.payment_amount, p_payer_id);

  RETURN jsonb_build_object(
    'success', true,
    'amount', v_msg.payment_amount,
    'fee', v_fee,
    'net', v_net
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
