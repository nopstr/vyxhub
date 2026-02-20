-- Restrict payment request creation to creators only
-- Creates a SECURITY DEFINER RPC so server validates is_creator before inserting

CREATE OR REPLACE FUNCTION send_payment_request(
  p_conversation_id UUID,
  p_sender_id UUID,
  p_amount DECIMAL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_creator BOOLEAN;
  v_is_participant BOOLEAN;
  v_msg RECORD;
BEGIN
  -- Ensure the caller matches p_sender_id
  IF auth.uid() != p_sender_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Unauthorized');
  END IF;

  -- Validate sender is a creator
  SELECT is_creator INTO v_is_creator
  FROM profiles
  WHERE id = p_sender_id;

  IF NOT COALESCE(v_is_creator, FALSE) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Only creators can send payment requests');
  END IF;

  -- Validate sender is a participant of this conversation
  SELECT EXISTS(
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_sender_id
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Not a participant of this conversation');
  END IF;

  -- Validate amount
  IF p_amount < 1 THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Minimum amount is $1');
  END IF;

  -- Insert the payment request message
  INSERT INTO messages (conversation_id, sender_id, content, message_type, payment_status, payment_amount, payment_note)
  VALUES (p_conversation_id, p_sender_id, COALESCE(p_note, 'Payment request'), 'payment_request', 'pending', p_amount, p_note)
  RETURNING * INTO v_msg;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message_id', v_msg.id,
    'conversation_id', v_msg.conversation_id,
    'sender_id', v_msg.sender_id,
    'content', v_msg.content,
    'message_type', v_msg.message_type,
    'payment_status', v_msg.payment_status,
    'payment_amount', v_msg.payment_amount,
    'payment_note', v_msg.payment_note,
    'created_at', v_msg.created_at
  );
END;
$$;
