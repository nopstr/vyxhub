-- Update check_message_access to check if user already paid the unlock fee
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
  v_has_paid BOOLEAN;
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

  -- Check if user already paid the unlock fee
  SELECT EXISTS (
    SELECT 1 FROM transactions
    WHERE from_user_id = p_sender_id
      AND to_user_id = p_receiver_id
      AND transaction_type = 'message_unlock'
      AND status = 'completed'
  ) INTO v_has_paid;

  IF v_has_paid THEN
    RETURN jsonb_build_object('allowed', TRUE, 'reason', 'paid_unlock', 'price', 0);
  END IF;

  -- Need to pay to message
  RETURN jsonb_build_object(
    'allowed', FALSE,
    'reason', 'paywall',
    'price', v_receiver.message_price
  );
END;
$$;
