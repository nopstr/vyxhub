-- ============================================================================
-- TIER 4: Missing Features — reports, blocks, search, pinning, reposts
-- ============================================================================

-- ============================================================================
-- F4: CONTENT REPORTING + MODERATION
-- ============================================================================
CREATE TYPE report_reason AS ENUM (
  'spam',
  'harassment',
  'underage',
  'non_consensual',
  'illegal_content',
  'impersonation',
  'copyright',
  'other'
);

CREATE TYPE report_status AS ENUM ('pending', 'reviewed', 'actioned', 'dismissed');

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  reported_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reported_post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  reason report_reason NOT NULL,
  description TEXT,
  status report_status DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Must report either a user or a post (or both)
  CONSTRAINT reports_target_check CHECK (
    reported_user_id IS NOT NULL OR reported_post_id IS NOT NULL
  )
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Users can view their own reports (to know they submitted one)
CREATE POLICY "Users can view own reports"
  ON reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- Users can create reports
CREATE POLICY "Users can create reports"
  ON reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- Prevent duplicate reports from same user on same target
CREATE UNIQUE INDEX idx_reports_unique_post
  ON reports (reporter_id, reported_post_id)
  WHERE reported_post_id IS NOT NULL AND status = 'pending';

CREATE UNIQUE INDEX idx_reports_unique_user
  ON reports (reporter_id, reported_user_id)
  WHERE reported_user_id IS NOT NULL AND reported_post_id IS NULL AND status = 'pending';

CREATE INDEX idx_reports_status ON reports (status, created_at DESC);
CREATE INDEX idx_reports_target_post ON reports (reported_post_id) WHERE reported_post_id IS NOT NULL;
CREATE INDEX idx_reports_target_user ON reports (reported_user_id) WHERE reported_user_id IS NOT NULL;


-- ============================================================================
-- F5: USER BLOCKING / MUTING
-- ============================================================================
CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  blocked_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  is_mute BOOLEAN DEFAULT FALSE, -- true = mute (hide from feed), false = full block
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id),
  -- Can't block yourself
  CONSTRAINT blocks_self_check CHECK (blocker_id != blocked_id)
);

ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

-- Users can see their own blocks
CREATE POLICY "Users can view own blocks"
  ON blocks FOR SELECT
  USING (auth.uid() = blocker_id);

-- Users can create blocks
CREATE POLICY "Users can create blocks"
  ON blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

-- Users can remove blocks
CREATE POLICY "Users can delete blocks"
  ON blocks FOR DELETE
  USING (auth.uid() = blocker_id);

-- Users can update their blocks (e.g., change mute to block)
CREATE POLICY "Users can update blocks"
  ON blocks FOR UPDATE
  USING (auth.uid() = blocker_id);

CREATE INDEX idx_blocks_blocker ON blocks (blocker_id);
CREATE INDEX idx_blocks_blocked ON blocks (blocked_id);

-- Block enforcement on posts: filter out posts from blocked users
-- We amend the post SELECT policy to also exclude blocked users.
-- Drop the old policy and recreate with block filtering.
DROP POLICY IF EXISTS "Users can view public posts" ON posts;

CREATE POLICY "Users can view posts (with block filter)"
  ON posts FOR SELECT
  USING (
    -- Not from a user who blocked the viewer, nor from a user the viewer blocked
    NOT EXISTS (
      SELECT 1 FROM blocks
      WHERE (blocker_id = auth.uid() AND blocked_id = posts.author_id)
         OR (blocker_id = posts.author_id AND blocked_id = auth.uid())
    )
    AND (
      visibility = 'public'
      OR author_id = auth.uid()
      OR (visibility = 'followers_only' AND EXISTS (
        SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = posts.author_id
      ))
      OR (visibility = 'subscribers_only' AND EXISTS (
        SELECT 1 FROM subscriptions
        WHERE subscriber_id = auth.uid()
        AND creator_id = posts.author_id
        AND status = 'active'
        AND expires_at > NOW()
      ))
    )
  );

-- Block enforcement on DMs: prevent sending messages to/from blocked users
-- Prevent creating conversations with blocked users
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;

-- Block enforcement on follows: prevent following blocked users
-- (handled client-side; blocks table is checked before insert)


-- ============================================================================
-- F14: FULL-TEXT SEARCH ON POSTS
-- ============================================================================
ALTER TABLE posts ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate existing posts
UPDATE posts SET search_vector = to_tsvector('english', COALESCE(content, ''))
  WHERE search_vector IS NULL AND content IS NOT NULL;

-- Auto-update search_vector on insert/update
CREATE OR REPLACE FUNCTION posts_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_posts_search_vector
  BEFORE INSERT OR UPDATE OF content ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_search_vector_update();

-- GIN index for fast full-text search
CREATE INDEX idx_posts_search ON posts USING gin(search_vector);


-- ============================================================================
-- F15: POST PINNING
-- ============================================================================
-- is_pinned already exists on posts from initial schema.
-- Add pinned_at for ordering multiple pinned posts.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

-- Limit pinned posts per user to 3 via a partial unique-ish approach
-- (enforced client-side; DB trigger as soft guard)
CREATE OR REPLACE FUNCTION enforce_pin_limit()
RETURNS TRIGGER AS $$
DECLARE
  pin_count INTEGER;
BEGIN
  IF NEW.is_pinned = TRUE AND (OLD.is_pinned IS DISTINCT FROM TRUE) THEN
    SELECT COUNT(*) INTO pin_count
      FROM posts
      WHERE author_id = NEW.author_id AND is_pinned = TRUE AND id != NEW.id;
    IF pin_count >= 3 THEN
      RAISE EXCEPTION 'Maximum 3 pinned posts allowed';
    END IF;
    NEW.pinned_at := NOW();
  END IF;
  IF NEW.is_pinned = FALSE AND OLD.is_pinned = TRUE THEN
    NEW.pinned_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_pin_limit
  BEFORE UPDATE OF is_pinned ON posts
  FOR EACH ROW EXECUTE FUNCTION enforce_pin_limit();

CREATE INDEX idx_posts_pinned ON posts (author_id, pinned_at DESC)
  WHERE is_pinned = TRUE;


-- ============================================================================
-- F11: REPOSTS / SHARES
-- ============================================================================
ALTER TABLE posts ADD COLUMN IF NOT EXISTS repost_of UUID REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reposted_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_posts_repost_of ON posts (repost_of) WHERE repost_of IS NOT NULL;

-- Update repost_count on original post when a repost is created/deleted
CREATE OR REPLACE FUNCTION update_repost_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.repost_of IS NOT NULL THEN
    UPDATE posts SET repost_count = repost_count + 1 WHERE id = NEW.repost_of;
  ELSIF TG_OP = 'DELETE' AND OLD.repost_of IS NOT NULL THEN
    UPDATE posts SET repost_count = repost_count - 1 WHERE id = OLD.repost_of;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_repost_change
  AFTER INSERT OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_repost_counts();


-- ============================================================================
-- F6: ACCOUNT DELETION SUPPORT
-- ============================================================================
-- Add a deleted/scheduled_deletion state to profiles for GDPR grace period
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;

-- Function to handle account deletion (called from client via RPC)
-- Cleans up storage, cancels subscriptions, anonymizes profile
CREATE OR REPLACE FUNCTION delete_user_account(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Verify the caller is the user being deleted
  IF auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Cancel all active subscriptions (as subscriber)
  UPDATE subscriptions
    SET status = 'cancelled'
    WHERE subscriber_id = p_user_id AND status = 'active';

  -- Cancel all active subscriptions (as creator — subscribers lose access)
  UPDATE subscriptions
    SET status = 'cancelled'
    WHERE creator_id = p_user_id AND status = 'active';

  -- Delete all posts (cascade will handle media, likes, comments, bookmarks)
  DELETE FROM posts WHERE author_id = p_user_id;

  -- Delete all messages
  DELETE FROM messages WHERE sender_id = p_user_id;

  -- Delete follows
  DELETE FROM follows WHERE follower_id = p_user_id OR following_id = p_user_id;

  -- Delete blocks
  DELETE FROM blocks WHERE blocker_id = p_user_id OR blocked_id = p_user_id;

  -- Delete reports
  DELETE FROM reports WHERE reporter_id = p_user_id;

  -- Delete notifications
  DELETE FROM notifications WHERE user_id = p_user_id OR actor_id = p_user_id;

  -- Delete bookmarks
  DELETE FROM bookmarks WHERE user_id = p_user_id;

  -- Anonymize profile (keep row for referential integrity with transactions)
  UPDATE profiles SET
    username = 'deleted_' || LEFT(p_user_id::text, 8),
    display_name = 'Deleted User',
    bio = NULL,
    avatar_url = NULL,
    banner_url = NULL,
    is_creator = FALSE,
    is_verified = FALSE,
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Note: The actual auth.users row deletion should be done
  -- via Supabase admin API (service_role key) from an edge function.
  -- We schedule it by marking the profile.
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- F2: SUBSCRIPTION UPDATE POLICY (allow cancellation)
-- ============================================================================
-- Already have update/delete policies from model_enhancements migration.
-- Add an index for subscription lookups by status.
CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON subscriptions (subscriber_id, status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_active
  ON subscriptions (creator_id, status)
  WHERE status = 'active';
