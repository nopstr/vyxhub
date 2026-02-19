-- ============================================================================
-- MESSAGING PAYMENTS: Message paywall + custom payment requests
-- ============================================================================

-- 1. Add message_type and payment columns to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text'
  CHECK (message_type IN ('text', 'payment_request'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT NULL
  CHECK (payment_status IN ('pending', 'paid', NULL));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS payment_note TEXT DEFAULT NULL;

-- 2. Add payment_request to transaction_type enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'payment_request'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_type')
  ) THEN
    ALTER TYPE transaction_type ADD VALUE 'payment_request';
  END IF;
END$$;

-- Also add 'message_unlock' if not exists (for paywall message fees)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'message_unlock'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'transaction_type')
  ) THEN
    ALTER TYPE transaction_type ADD VALUE 'message_unlock';
  END IF;
END$$;

-- 3. RPC: Check if user can message a creator (subscription or free messages or paid)
CREATE OR REPLACE FUNCTION check_message_access(
  p_sender_id UUID,
  p_receiver_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receiver RECORD;
  v_is_subscribed BOOLEAN;
  v_is_creator BOOLEAN;
BEGIN
  -- Get receiver profile
  SELECT is_creator, allow_free_messages, message_price
  INTO v_receiver
  FROM profiles
  WHERE id = p_receiver_id;

  -- If receiver is not a creator, anyone can message
  IF NOT v_receiver.is_creator THEN
    RETURN jsonb_build_object('allowed', TRUE, 'reason', 'not_creator', 'price', 0);
  END IF;

  -- Check if sender is also a creator (creators can message each other freely)
  SELECT is_creator INTO v_is_creator FROM profiles WHERE id = p_sender_id;
  IF v_is_creator THEN
    RETURN jsonb_build_object('allowed', TRUE, 'reason', 'both_creators', 'price', 0);
  END IF;

  -- Check active subscription
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE subscriber_id = p_sender_id
      AND creator_id = p_receiver_id
      AND status = 'active'
      AND expires_at > NOW()
  ) INTO v_is_subscribed;

  IF v_is_subscribed THEN
    RETURN jsonb_build_object('allowed', TRUE, 'reason', 'subscribed', 'price', 0);
  END IF;

  -- Creator allows free messages
  IF v_receiver.allow_free_messages THEN
    RETURN jsonb_build_object('allowed', TRUE, 'reason', 'free_messages', 'price', 0);
  END IF;

  -- Message price is 0 (creator set it to free)
  IF COALESCE(v_receiver.message_price, 0) = 0 THEN
    RETURN jsonb_build_object('allowed', TRUE, 'reason', 'zero_price', 'price', 0);
  END IF;

  -- Need to pay to message
  RETURN jsonb_build_object(
    'allowed', FALSE,
    'reason', 'paywall',
    'price', v_receiver.message_price
  );
END;
$$;

-- 4. RPC: Pay message unlock fee (for paywall)
CREATE OR REPLACE FUNCTION pay_message_unlock(
  p_sender_id UUID,
  p_receiver_id UUID,
  p_conversation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_price DECIMAL(10,2);
  v_fee DECIMAL(10,2);
  v_net DECIMAL(10,2);
BEGIN
  -- Get message price
  SELECT COALESCE(message_price, 0) INTO v_price
  FROM profiles WHERE id = p_receiver_id;

  IF v_price <= 0 THEN
    RETURN jsonb_build_object('success', TRUE, 'amount', 0);
  END IF;

  -- Calculate platform fee (30%)
  v_fee := ROUND(v_price * 0.30, 2);
  v_net := v_price - v_fee;

  -- Record transaction
  INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, reference_id, status)
  VALUES (p_sender_id, p_receiver_id, 'message_unlock', v_price, v_fee, v_net, p_conversation_id, 'completed');

  RETURN jsonb_build_object('success', TRUE, 'amount', v_price);
END;
$$;

-- 5. RPC: Pay a payment request message
CREATE OR REPLACE FUNCTION pay_message_request(
  p_payer_id UUID,
  p_message_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_msg RECORD;
  v_fee DECIMAL(10,2);
  v_net DECIMAL(10,2);
BEGIN
  -- Get the payment request message
  SELECT id, sender_id, conversation_id, payment_amount, payment_status, message_type
  INTO v_msg
  FROM messages
  WHERE id = p_message_id;

  IF v_msg IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Message not found');
  END IF;

  IF v_msg.message_type != 'payment_request' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Not a payment request');
  END IF;

  IF v_msg.payment_status = 'paid' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Already paid');
  END IF;

  -- Ensure payer is not the sender (creator can't pay their own request)
  IF v_msg.sender_id = p_payer_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Cannot pay your own request');
  END IF;

  -- Calculate fee
  v_fee := ROUND(v_msg.payment_amount * 0.30, 2);
  v_net := v_msg.payment_amount - v_fee;

  -- Update message to paid
  UPDATE messages
  SET payment_status = 'paid'
  WHERE id = p_message_id;

  -- Record transaction
  INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, reference_id, status)
  VALUES (p_payer_id, v_msg.sender_id, 'payment_request', v_msg.payment_amount, v_fee, v_net, p_message_id, 'completed');

  RETURN jsonb_build_object('success', TRUE, 'amount', v_msg.payment_amount);
END;
$$;

-- 6. Index for payment request lookups
CREATE INDEX IF NOT EXISTS idx_messages_payment_status ON messages(payment_status) WHERE payment_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_message_type ON messages(message_type) WHERE message_type = 'payment_request';
