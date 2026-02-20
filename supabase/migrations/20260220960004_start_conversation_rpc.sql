-- RPC to start or find an existing conversation between two users.
-- Needed because the SELECT RLS policy on conversations prevents reading
-- a newly-inserted row before the user is added as a participant.
-- This function runs as SECURITY DEFINER so it can bypass RLS.

CREATE OR REPLACE FUNCTION start_or_get_conversation(
  p_user_id UUID,
  p_other_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  -- Validate inputs
  IF p_user_id IS NULL OR p_other_user_id IS NULL THEN
    RAISE EXCEPTION 'Both user IDs are required';
  END IF;
  IF p_user_id = p_other_user_id THEN
    RAISE EXCEPTION 'Cannot start a conversation with yourself';
  END IF;

  -- Check for existing conversation between these two users
  SELECT cp1.conversation_id INTO v_conv_id
  FROM conversation_participants cp1
  JOIN conversation_participants cp2 
    ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = p_user_id
    AND cp2.user_id = p_other_user_id
  LIMIT 1;

  -- If exists, return it
  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- Check neither user has blocked the other
  IF EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocker_id = p_user_id AND blocked_id = p_other_user_id AND NOT is_mute)
       OR (blocker_id = p_other_user_id AND blocked_id = p_user_id AND NOT is_mute)
  ) THEN
    RAISE EXCEPTION 'Cannot start conversation with this user';
  END IF;

  -- Create new conversation
  INSERT INTO conversations DEFAULT VALUES
  RETURNING id INTO v_conv_id;

  -- Add both participants
  INSERT INTO conversation_participants (conversation_id, user_id)
  VALUES 
    (v_conv_id, p_user_id),
    (v_conv_id, p_other_user_id);

  RETURN v_conv_id;
END;
$$;
