-- ═══════════════════════════════════════════════════════════════════════════
-- FIAT PAYMENT INTEGRATION (Segpay)
-- 
-- Adds payment_sessions table for tracking card payments via Segpay,
-- and fixes subscription renewal to not auto-extend without payment.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Payment sessions table for tracking fiat (Segpay) payments
CREATE TABLE IF NOT EXISTS payment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'segpay',  -- segpay | crypto
  payment_type TEXT NOT NULL,  -- subscription, tip, ppv_post, message_unlock, payment_request, plus_subscription, custom_request
  usd_amount NUMERIC(10,2) NOT NULL,
  metadata JSONB DEFAULT '{}',  -- { creator_id, post_id, message_id, tier, etc. }
  
  -- Segpay specific
  segpay_transaction_id TEXT,
  segpay_subscription_id TEXT,  -- For recurring subscriptions
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | completed | failed | cancelled | refunded
  is_processed BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_user ON payment_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_status ON payment_sessions(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_payment_sessions_segpay ON payment_sessions(segpay_transaction_id) WHERE segpay_transaction_id IS NOT NULL;

ALTER TABLE payment_sessions ENABLE ROW LEVEL SECURITY;

-- Users can see their own payment sessions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payment_sessions' AND policyname = 'Users view own payment sessions') THEN
    CREATE POLICY "Users view own payment sessions" ON payment_sessions FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- 2. Add segpay_subscription_id to subscriptions for recurring billing tracking
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS segpay_subscription_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_subscriptions_segpay 
  ON subscriptions(segpay_subscription_id) 
  WHERE segpay_subscription_id IS NOT NULL;

-- 3. Process confirmed fiat payment (service_role only, called from webhook)
CREATE OR REPLACE FUNCTION process_confirmed_fiat_payment(
  p_session_id UUID,
  p_segpay_transaction_id TEXT DEFAULT NULL,
  p_segpay_subscription_id TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  sess payment_sessions%ROWTYPE;
  v_creator_id UUID;
  v_post_id UUID;
  v_message_id UUID;
  v_sub_id UUID;
BEGIN
  -- Service role only
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' != 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  -- Lock the session to prevent double-processing
  SELECT * INTO sess FROM payment_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;

  IF sess.is_processed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already processed');
  END IF;

  -- Update session with Segpay info
  UPDATE payment_sessions
  SET segpay_transaction_id = COALESCE(p_segpay_transaction_id, segpay_transaction_id),
      segpay_subscription_id = COALESCE(p_segpay_subscription_id, segpay_subscription_id),
      status = 'completed',
      is_processed = TRUE,
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_session_id;

  -- Set auth context to the paying user so existing RPCs see correct auth.uid()
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', sess.user_id::text,
    'role', 'authenticated'
  )::text, true);

  -- Extract common metadata
  v_creator_id := (sess.metadata->>'creator_id')::UUID;
  v_post_id := NULLIF(sess.metadata->>'post_id', '')::UUID;

  -- Execute business logic based on payment type
  CASE sess.payment_type
    WHEN 'subscription' THEN
      PERFORM process_subscription(
        p_subscriber_id := sess.user_id,
        p_creator_id := v_creator_id,
        p_price := sess.usd_amount,
        p_referrer_id := NULLIF(sess.metadata->>'referrer_id', '')::UUID
      );

      -- If Segpay subscription, mark as auto-renew
      IF p_segpay_subscription_id IS NOT NULL THEN
        UPDATE subscriptions
        SET segpay_subscription_id = p_segpay_subscription_id,
            auto_renew = TRUE
        WHERE subscriber_id = sess.user_id
          AND creator_id = v_creator_id
          AND status = 'active';
      END IF;

    WHEN 'tip' THEN
      PERFORM send_tip(
        p_from_user_id := sess.user_id,
        p_to_user_id := v_creator_id,
        p_amount := sess.usd_amount,
        p_post_id := v_post_id,
        p_message := sess.metadata->>'message'
      );

    WHEN 'ppv_post' THEN
      PERFORM purchase_ppv_post(
        p_buyer_id := sess.user_id,
        p_post_id := v_post_id
      );

    WHEN 'message_unlock' THEN
      PERFORM pay_message_unlock(
        p_sender_id := sess.user_id,
        p_receiver_id := v_creator_id,
        p_conversation_id := (sess.metadata->>'conversation_id')::UUID
      );

    WHEN 'payment_request' THEN
      v_message_id := (sess.metadata->>'message_id')::UUID;
      PERFORM pay_message_request(
        p_payer_id := sess.user_id,
        p_message_id := v_message_id
      );

    WHEN 'plus_subscription' THEN
      PERFORM activate_plus(
        p_user_id := sess.user_id,
        p_tier := COALESCE(sess.metadata->>'tier', 'monthly'),
        p_price_paid := sess.usd_amount,
        p_payment_method := 'segpay'
      );

    WHEN 'custom_request' THEN
      v_message_id := (sess.metadata->>'message_id')::UUID;
      PERFORM pay_message_request(
        p_payer_id := sess.user_id,
        p_message_id := v_message_id
      );

    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Unknown payment type: ' || sess.payment_type);
  END CASE;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'payment_type', sess.payment_type,
    'amount', sess.usd_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Handle Segpay rebill (subscription renewal with payment)
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
BEGIN
  -- Service role only
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' != 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  -- Find the subscription by Segpay subscription ID
  SELECT * INTO v_sub FROM subscriptions
  WHERE segpay_subscription_id = p_segpay_subscription_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription not found');
  END IF;

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

  -- Record in payment_sessions for audit trail
  INSERT INTO payment_sessions (user_id, payment_method, payment_type, usd_amount, metadata, segpay_transaction_id, segpay_subscription_id, status, is_processed, completed_at)
  VALUES (v_sub.subscriber_id, 'segpay', 'subscription', p_amount,
    jsonb_build_object('creator_id', v_sub.creator_id, 'rebill', true),
    p_segpay_transaction_id, p_segpay_subscription_id, 'completed', true, NOW());

  RETURN jsonb_build_object('success', true, 'subscription_id', v_sub.id, 'new_expires_at', (v_sub.expires_at + INTERVAL '30 days'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Handle Segpay cancellation
CREATE OR REPLACE FUNCTION process_segpay_cancel(
  p_segpay_subscription_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub RECORD;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb ->> 'role' != 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  SELECT * INTO v_sub FROM subscriptions
  WHERE segpay_subscription_id = p_segpay_subscription_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription not found');
  END IF;

  -- Don't expire immediately — let it run until expires_at
  UPDATE subscriptions
  SET auto_renew = FALSE,
      updated_at = NOW()
  WHERE id = v_sub.id;

  RETURN jsonb_build_object('success', true, 'subscription_id', v_sub.id, 'expires_at', v_sub.expires_at);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Fix subscription renewal: only auto-extend Segpay subscriptions, expire the rest
CREATE OR REPLACE FUNCTION process_subscription_renewals()
RETURNS TABLE(renewed INTEGER, expired INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_renewed INTEGER := 0;
  v_expired INTEGER := 0;
BEGIN
  -- Expire subscriptions that have passed their expiry date and are NOT auto-renewing via Segpay
  -- (Segpay handles rebilling itself and sends a webhook — we don't need to extend them here)
  UPDATE subscriptions
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'active'
    AND expires_at < NOW()
    AND (auto_renew IS NOT TRUE);  -- Don't expire Segpay-managed subscriptions (Segpay handles rebilling)

  GET DIAGNOSTICS v_expired = ROW_COUNT;

  -- For Segpay auto-renew subscriptions that are overdue by more than 3 days,
  -- Segpay has likely failed to rebill — expire them as safety net
  UPDATE subscriptions
  SET status = 'expired',
      auto_renew = FALSE,
      updated_at = NOW()
  WHERE status = 'active'
    AND expires_at < NOW() - INTERVAL '3 days'
    AND auto_renew = TRUE;

  GET DIAGNOSTICS v_renewed = ROW_COUNT;
  v_expired := v_expired + v_renewed;
  v_renewed := 0;  -- We don't auto-renew anymore, Segpay sends rebill webhooks

  RETURN QUERY SELECT v_renewed, v_expired;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Get payment session status (for polling from success page)
CREATE OR REPLACE FUNCTION get_payment_session(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  sess RECORD;
BEGIN
  SELECT * INTO sess FROM payment_sessions
  WHERE id = p_session_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'status', sess.status,
    'is_processed', sess.is_processed,
    'payment_type', sess.payment_type,
    'amount', sess.usd_amount,
    'metadata', sess.metadata
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
