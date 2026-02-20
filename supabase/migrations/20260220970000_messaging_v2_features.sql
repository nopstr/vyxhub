-- ============================================================================
-- MESSAGING V2: Pagination, Media, Typing, Read Receipts, Search, Reactions,
--               Voice/Video messages, Creator voice/video approval
-- ============================================================================

-- 1. Expand message_type CHECK to allow new types
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'payment_request', 'media', 'voice', 'video'));

-- 2. Add media_urls JSONB for multiple media per message
-- Format: [{"path": "userId/convId/file.webp", "type": "image/webp", "name": "photo.webp"}]
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_urls JSONB DEFAULT NULL;

-- 3. Add duration (seconds) for voice/video messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_duration REAL DEFAULT NULL;

-- 4. Create message_reactions table
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  emoji TEXT NOT NULL CHECK (char_length(emoji) <= 8),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reactions in their conversations"
  ON message_reactions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM messages m
    JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.id = message_reactions.message_id AND cp.user_id = auth.uid()
  ));

CREATE POLICY "Users can add reactions to messages in their conversations"
  ON message_reactions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM messages m
      JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
      WHERE m.id = message_reactions.message_id AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove their own reactions"
  ON message_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Add read_receipts_enabled to profiles (default TRUE, like WhatsApp)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS read_receipts_enabled BOOLEAN DEFAULT TRUE;

-- 6. Add voice_video_approved to conversation_participants
-- FALSE by default: creator must approve before non-creator can send voice/video
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS voice_video_approved BOOLEAN DEFAULT FALSE;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON message_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_media_type ON messages(message_type) WHERE message_type IN ('media', 'voice', 'video');
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_content_search ON messages USING gin(to_tsvector('english', coalesce(content, '')));

-- 8. RPC: mark_messages_read — respects read_receipts_enabled
CREATE OR REPLACE FUNCTION mark_messages_read(p_conversation_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receipts_enabled BOOLEAN;
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Check if this user has read receipts enabled
  SELECT COALESCE(read_receipts_enabled, TRUE) INTO v_receipts_enabled
  FROM profiles WHERE id = p_user_id;

  -- Always update last_read_at for participant (used for unread count)
  UPDATE conversation_participants
  SET last_read_at = NOW()
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

  -- Only mark individual messages as read if user has receipts enabled
  -- (When receipts are off, sender won't see blue checks)
  IF v_receipts_enabled THEN
    UPDATE messages
    SET is_read = TRUE
    WHERE conversation_id = p_conversation_id
      AND sender_id != p_user_id
      AND is_read = FALSE;
  END IF;
END;
$$;

-- 9. RPC: search_messages — full-text search across user's conversations
CREATE OR REPLACE FUNCTION search_messages(
  p_user_id UUID,
  p_query TEXT,
  p_conversation_id UUID DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  conversation_id UUID,
  sender_id UUID,
  content TEXT,
  message_type TEXT,
  created_at TIMESTAMPTZ,
  sender_username TEXT,
  sender_display_name TEXT,
  sender_avatar_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT m.id, m.conversation_id, m.sender_id, m.content, m.message_type::TEXT, m.created_at,
         p.username, p.display_name, p.avatar_url
  FROM messages m
  JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.user_id = p_user_id
  JOIN profiles p ON p.id = m.sender_id
  WHERE m.content ILIKE '%' || p_query || '%'
    AND (p_conversation_id IS NULL OR m.conversation_id = p_conversation_id)
  ORDER BY m.created_at DESC
  LIMIT 50;
END;
$$;

-- 10. RPC: approve_voice_video — creator approves a user to send voice/video
CREATE OR REPLACE FUNCTION approve_voice_video(
  p_conversation_id UUID,
  p_target_user_id UUID,
  p_approved BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_creator BOOLEAN;
  v_is_participant BOOLEAN;
BEGIN
  -- Caller must be a creator
  SELECT is_creator INTO v_is_creator FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_creator, FALSE) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Only creators can manage voice/video permissions');
  END IF;

  -- Caller must be participant of this conversation
  SELECT EXISTS(
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Not a participant');
  END IF;

  UPDATE conversation_participants
  SET voice_video_approved = p_approved
  WHERE conversation_id = p_conversation_id AND user_id = p_target_user_id;

  RETURN jsonb_build_object('success', TRUE, 'approved', p_approved);
END;
$$;

-- 11. RPC: toggle_message_reaction — add or remove a reaction
CREATE OR REPLACE FUNCTION toggle_message_reaction(
  p_message_id UUID,
  p_user_id UUID,
  p_emoji TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing UUID;
  v_conversation_id UUID;
  v_is_participant BOOLEAN;
BEGIN
  IF auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Unauthorized');
  END IF;

  -- Get conversation_id and verify participation
  SELECT m.conversation_id INTO v_conversation_id
  FROM messages m WHERE m.id = p_message_id;

  IF v_conversation_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Message not found');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = v_conversation_id AND user_id = p_user_id
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Not a participant');
  END IF;

  -- Check if reaction exists
  SELECT id INTO v_existing
  FROM message_reactions
  WHERE message_id = p_message_id AND user_id = p_user_id AND emoji = p_emoji;

  IF v_existing IS NOT NULL THEN
    -- Remove reaction
    DELETE FROM message_reactions WHERE id = v_existing;
    RETURN jsonb_build_object('success', TRUE, 'action', 'removed', 'emoji', p_emoji);
  ELSE
    -- Add reaction
    INSERT INTO message_reactions (message_id, user_id, emoji)
    VALUES (p_message_id, p_user_id, p_emoji);
    RETURN jsonb_build_object('success', TRUE, 'action', 'added', 'emoji', p_emoji);
  END IF;
END;
$$;

-- 12. Enable realtime for message_reactions
ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
