-- ============================================================================
-- TIER 1 FIXES: Notification triggers + missing RLS policies
-- C2: Create notification triggers (follows, likes, comments, subscriptions,
--     purchases, messages)
-- C6: Add UPDATE/DELETE policies on messages
-- C7: Add UPDATE policy on conversation_participants
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  C6: Messages — UPDATE / DELETE policies                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Senders can edit their own messages (e.g. mark as read, edit content)
CREATE POLICY "Users can update own messages"
  ON messages FOR UPDATE
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- Senders can delete (unsend) their own messages
CREATE POLICY "Users can delete own messages"
  ON messages FOR DELETE
  USING (sender_id = auth.uid());

-- Recipients should also be able to mark messages as read (is_read column)
-- This requires a separate policy since they are NOT the sender
CREATE POLICY "Recipients can mark messages as read"
  ON messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = messages.conversation_id
        AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = messages.conversation_id
        AND user_id = auth.uid()
    )
  );


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  C7: conversation_participants — UPDATE policy                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Users can update their own participation (e.g. set last_read_at)
CREATE POLICY "Users can update own participation"
  ON conversation_participants FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  C2: Notification trigger functions                                     ║
-- ║  Each trigger inserts a row into the notifications table.               ║
-- ║  SECURITY DEFINER so triggers can insert notifications for any user.    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ─── Follow notification ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_on_follow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Don't notify yourself
  IF NEW.follower_id = NEW.following_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, actor_id, notification_type, reference_id, message)
  VALUES (
    NEW.following_id,          -- recipient: the person being followed
    NEW.follower_id,           -- actor: the person who followed
    'follow',
    NEW.id,                    -- reference: the follow row
    'started following you'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_follow
  AFTER INSERT ON follows
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_follow();


-- ─── Like/Reaction notification ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_on_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_author UUID;
BEGIN
  SELECT author_id INTO v_post_author FROM posts WHERE id = NEW.post_id;

  -- Don't notify yourself
  IF NEW.user_id = v_post_author THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, actor_id, notification_type, reference_id, message)
  VALUES (
    v_post_author,             -- recipient: the post author
    NEW.user_id,               -- actor: the person who liked
    'like',
    NEW.post_id,               -- reference: the post
    'reacted to your post'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_like
  AFTER INSERT ON likes
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_like();


-- ─── Comment notification ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_on_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_author UUID;
  v_parent_author UUID;
BEGIN
  SELECT author_id INTO v_post_author FROM posts WHERE id = NEW.post_id;

  -- Notify post author (unless it's a self-comment)
  IF NEW.author_id <> v_post_author THEN
    INSERT INTO notifications (user_id, actor_id, notification_type, reference_id, message)
    VALUES (
      v_post_author,
      NEW.author_id,
      'comment',
      NEW.post_id,
      'commented on your post'
    );
  END IF;

  -- If this is a reply, also notify the parent comment's author
  IF NEW.parent_id IS NOT NULL THEN
    SELECT author_id INTO v_parent_author FROM comments WHERE id = NEW.parent_id;
    IF v_parent_author IS NOT NULL AND v_parent_author <> NEW.author_id AND v_parent_author <> v_post_author THEN
      INSERT INTO notifications (user_id, actor_id, notification_type, reference_id, message)
      VALUES (
        v_parent_author,
        NEW.author_id,
        'comment',
        NEW.post_id,
        'replied to your comment'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_comment
  AFTER INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_comment();


-- ─── Subscription notification ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_on_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Don't notify yourself
  IF NEW.subscriber_id = NEW.creator_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, actor_id, notification_type, reference_id, message)
  VALUES (
    NEW.creator_id,            -- recipient: the creator
    NEW.subscriber_id,         -- actor: the subscriber
    'subscription',
    NEW.id,
    'subscribed to you'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_subscription
  AFTER INSERT ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_subscription();


-- ─── Purchase notification ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_on_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_author UUID;
BEGIN
  SELECT author_id INTO v_post_author FROM posts WHERE id = NEW.post_id;

  -- Don't notify yourself
  IF NEW.buyer_id = v_post_author THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, actor_id, notification_type, reference_id, message)
  VALUES (
    v_post_author,             -- recipient: the post author
    NEW.buyer_id,              -- actor: the buyer
    'subscription',            -- reuse 'subscription' type (purchase is a variant)
    NEW.post_id,
    'purchased your content'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_purchase
  AFTER INSERT ON purchases
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_purchase();


-- ─── Message notification ──────────────────────────────────────────────────
-- Notifies all other participants in the conversation when a message is sent
CREATE OR REPLACE FUNCTION notify_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT user_id FROM conversation_participants
    WHERE conversation_id = NEW.conversation_id
      AND user_id <> NEW.sender_id
  LOOP
    INSERT INTO notifications (user_id, actor_id, notification_type, reference_id, message)
    VALUES (
      r.user_id,               -- recipient: other participant
      NEW.sender_id,           -- actor: the sender
      'message',
      NEW.conversation_id,     -- reference: the conversation
      'sent you a message'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_message();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Additional: conversations INSERT policy                                ║
-- ║  Users need to create conversations (missing from original schema)      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Only create if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'conversations' AND policyname = 'Authenticated users can create conversations'
  ) THEN
    CREATE POLICY "Authenticated users can create conversations"
      ON conversations FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Users can also add participants to conversations they're in
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'conversation_participants' AND policyname = 'Users can add participants to their conversations'
  ) THEN
    CREATE POLICY "Users can add participants to their conversations"
      ON conversation_participants FOR INSERT
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
          user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM conversation_participants cp
            WHERE cp.conversation_id = conversation_participants.conversation_id
              AND cp.user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;
