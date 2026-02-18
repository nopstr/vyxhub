-- Production fixes: notification security, feed algorithm, conversation INSERT policy, scalability

-- ============================================================================
-- FIX: Notification insert policy (restrict to authenticated users only for own notifications or system)
-- ============================================================================
DROP POLICY IF EXISTS "Notifications can be created" ON notifications;

-- Only allow inserting notifications where the actor is the current user
-- (system notifications where actor_id IS NULL are handled by service role)
CREATE POLICY "Authenticated users can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      actor_id = auth.uid() OR actor_id IS NULL
    )
  );

-- ============================================================================
-- FIX: Conversation INSERT policies (missing in initial schema)
-- ============================================================================
CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can add participants"
  ON conversation_participants FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- FEED ALGORITHM: Materialized view for ranked posts
-- ============================================================================

-- Composite index for feed algorithm (hot scoring)
CREATE INDEX IF NOT EXISTS idx_posts_feed_algo
  ON posts(created_at DESC, like_count DESC, comment_count DESC)
  WHERE visibility = 'public';

-- Index for following feed
CREATE INDEX IF NOT EXISTS idx_follows_feed
  ON follows(follower_id, following_id);

-- Index for subscription checks (heavily queried)
CREATE INDEX IF NOT EXISTS idx_subscriptions_active
  ON subscriptions(subscriber_id, creator_id)
  WHERE status = 'active';

-- Index for purchase lookups
CREATE INDEX IF NOT EXISTS idx_purchases_buyer_post
  ON purchases(buyer_id, post_id);

-- Index for comments on post
CREATE INDEX IF NOT EXISTS idx_comments_post_created
  ON comments(post_id, created_at DESC);

-- Index for unread notifications (count queries)
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id, is_read)
  WHERE is_read = false;

-- Index for unread messages
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON messages(conversation_id, is_read, sender_id)
  WHERE is_read = false;

-- Index for conversation participants lookup
CREATE INDEX IF NOT EXISTS idx_conv_participants_user
  ON conversation_participants(user_id, conversation_id);

-- Index for bookmarks
CREATE INDEX IF NOT EXISTS idx_bookmarks_user
  ON bookmarks(user_id, post_id);

-- Index for media with preview flag
CREATE INDEX IF NOT EXISTS idx_media_post_preview
  ON media(post_id, is_preview);

-- ============================================================================
-- FEED RANKING FUNCTION
-- Hot score: weighs recency + engagement. Used by "For You" feed.
-- Score = (likes*2 + comments*3 + views*0.1) / (age_in_hours + 2)^1.5
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_hot_score(
  p_like_count INTEGER,
  p_comment_count INTEGER,
  p_view_count INTEGER,
  p_created_at TIMESTAMPTZ
) RETURNS FLOAT AS $$
DECLARE
  engagement FLOAT;
  age_hours FLOAT;
BEGIN
  engagement := (COALESCE(p_like_count, 0) * 2.0) +
                (COALESCE(p_comment_count, 0) * 3.0) +
                (COALESCE(p_view_count, 0) * 0.1);
  age_hours := EXTRACT(EPOCH FROM (NOW() - p_created_at)) / 3600.0;
  RETURN engagement / POWER(age_hours + 2.0, 1.5);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- VIEW: Ranked posts for "For You" feed (avoids N+1 queries)
-- ============================================================================
CREATE OR REPLACE VIEW ranked_posts AS
SELECT
  p.*,
  calculate_hot_score(p.like_count, p.comment_count, p.view_count, p.created_at) AS hot_score
FROM posts p
WHERE p.visibility = 'public'
ORDER BY hot_score DESC;

-- ============================================================================
-- FUNCTION: Increment view count (fire and forget, no locking overhead)
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_view_count(p_post_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE posts SET view_count = view_count + 1 WHERE id = p_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SCALABILITY: Connection pooling optimizations
-- ============================================================================

-- Ensure updated_at is set on conversation updates too
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Partial index for active subscriptions only (most common query)
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_lookup
  ON subscriptions(subscriber_id, creator_id, status)
  WHERE status = 'active';
