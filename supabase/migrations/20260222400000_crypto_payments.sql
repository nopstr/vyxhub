-- ============================================================================
-- CRYPTO PAYMENT SYSTEM
-- Accepts cryptocurrency payments via NOWPayments integration
-- Supports BTC, ETH, USDT, USDC, SOL, LTC, DOGE, BNB, XRP, TRX
-- Users pay network fees; USD prices shown on site, converted at checkout
-- ============================================================================

-- Crypto payments tracking table
CREATE TABLE crypto_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,

  -- What this payment is for
  payment_type TEXT NOT NULL CHECK (payment_type IN (
    'subscription', 'tip', 'ppv_post', 'message_unlock', 'payment_request'
  )),
  payment_metadata JSONB NOT NULL DEFAULT '{}',
  -- e.g. { creator_id, post_id, message, conversation_id, message_id, referrer_id }

  -- Pricing
  usd_amount DECIMAL(12,2) NOT NULL,
  crypto_currency TEXT NOT NULL,
  crypto_amount DECIMAL(24,12),
  pay_address TEXT,

  -- Provider info
  provider TEXT NOT NULL DEFAULT 'nowpayments',
  provider_payment_id TEXT UNIQUE,
  provider_data JSONB DEFAULT '{}',

  -- Status tracking
  payment_status TEXT NOT NULL DEFAULT 'created' CHECK (payment_status IN (
    'created',         -- record created, payment not yet initiated with provider
    'waiting',         -- payment address generated, waiting for user to send
    'confirming',      -- transaction detected, waiting for confirmations
    'confirmed',       -- enough confirmations received
    'sending',         -- provider is sending converted funds
    'partially_paid',  -- user sent less than required
    'finished',        -- payment fully completed
    'failed',          -- payment failed
    'refunded',        -- payment was refunded
    'expired'          -- payment expired (user didn't send in time)
  )),
  is_processed BOOLEAN DEFAULT FALSE,  -- business logic executed (subscription created, tip sent, etc.)

  -- Timestamps
  expires_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_crypto_payments_user ON crypto_payments(user_id);
CREATE INDEX idx_crypto_payments_active ON crypto_payments(payment_status)
  WHERE payment_status NOT IN ('finished', 'expired', 'failed', 'refunded');
CREATE INDEX idx_crypto_payments_provider ON crypto_payments(provider_payment_id);
CREATE INDEX idx_crypto_payments_user_pending ON crypto_payments(user_id, payment_status)
  WHERE payment_status IN ('created', 'waiting', 'confirming');

-- RLS
ALTER TABLE crypto_payments ENABLE ROW LEVEL SECURITY;

-- Users can view their own payments
CREATE POLICY "Users can view own crypto payments"
  ON crypto_payments FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create payments for themselves
CREATE POLICY "Users can create crypto payments"
  ON crypto_payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Staff can view all crypto payments (for support)
CREATE POLICY "Staff can view all crypto payments"
  ON crypto_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND system_role IN ('admin', 'support')
    )
  );


-- ============================================================================
-- Process a confirmed crypto payment
-- Called by webhook when NOWPayments confirms the payment
-- Executes the appropriate business logic (subscription, tip, PPV, etc.)
-- ============================================================================
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
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', cp.user_id::text,
    'role', 'authenticated'
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


-- ============================================================================
-- Update crypto payment status from webhook
-- This is the entry point called by the webhook handler
-- ============================================================================
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


-- ============================================================================
-- Expire stale crypto payments
-- Run periodically to clean up abandoned payments
-- ============================================================================
CREATE OR REPLACE FUNCTION expire_stale_crypto_payments()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE crypto_payments
  SET payment_status = 'expired', updated_at = NOW()
  WHERE payment_status IN ('created', 'waiting')
    AND expires_at IS NOT NULL
    AND expires_at < NOW()
    AND is_processed = FALSE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ============================================================================
-- Get user's pending crypto payments (for checking status)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_pending_crypto_payments(p_user_id UUID)
RETURNS SETOF crypto_payments
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT * FROM crypto_payments
  WHERE user_id = p_user_id
    AND payment_status IN ('created', 'waiting', 'confirming', 'confirmed', 'sending')
    AND is_processed = FALSE
  ORDER BY created_at DESC;
$$;


-- ============================================================================
-- Enable realtime for crypto_payments (so frontend can subscribe to changes)
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE crypto_payments;
