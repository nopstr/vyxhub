-- ============================================================================
-- TIER 5: ALGORITHM DEVELOPMENT — February 20, 2026
-- A1: Feed Personalization Engine (user_affinities + personalized_feed RPC)
-- A2: Content Discovery (hashtags + categories + explore_posts RPC)
-- A3: Trending Detection (materialized views + refresh_trending)
-- A4: Collaborative Filtering (suggest_creators RPC)
-- A6: Blocked User Feed Filtering (via personalized_feed RPC)
-- A7: Engagement-Weighted Notifications (priority column)
-- A8: Reel Autoplay Algorithm (reel_views + personalized_reels RPC)
-- ============================================================================

-- ============================================================================
-- A1: FEED PERSONALIZATION ENGINE
-- ============================================================================

-- User affinity scores track how much a user engages with each creator
CREATE TABLE IF NOT EXISTS user_affinities (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  affinity_score FLOAT DEFAULT 0.0,
  interaction_count INT DEFAULT 0,
  last_interaction TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, creator_id)
);

ALTER TABLE user_affinities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own affinities"
  ON user_affinities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can manage affinities"
  ON user_affinities FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_user_affinities_score
  ON user_affinities(user_id, affinity_score DESC);

-- Function to update affinity score (called by triggers)
CREATE OR REPLACE FUNCTION update_user_affinity(
  p_user_id UUID,
  p_creator_id UUID,
  p_delta FLOAT
) RETURNS VOID AS $$
BEGIN
  -- Don't track self-affinity
  IF p_user_id = p_creator_id OR p_user_id IS NULL OR p_creator_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO user_affinities (user_id, creator_id, affinity_score, interaction_count, last_interaction)
  VALUES (p_user_id, p_creator_id, GREATEST(p_delta, 0), 1, NOW())
  ON CONFLICT (user_id, creator_id) DO UPDATE SET
    affinity_score = GREATEST(user_affinities.affinity_score + p_delta, -100),
    interaction_count = user_affinities.interaction_count + 1,
    last_interaction = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: update affinity on like/unlike
CREATE OR REPLACE FUNCTION affinity_on_like() RETURNS TRIGGER AS $$
DECLARE
  v_author_id UUID;
BEGIN
  SELECT author_id INTO v_author_id FROM posts WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  IF v_author_id IS NULL THEN RETURN NULL; END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM update_user_affinity(NEW.user_id, v_author_id, 1.0);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM update_user_affinity(OLD.user_id, v_author_id, -0.5);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_affinity_on_like ON likes;
CREATE TRIGGER trg_affinity_on_like
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION affinity_on_like();

-- Trigger: update affinity on comment
CREATE OR REPLACE FUNCTION affinity_on_comment() RETURNS TRIGGER AS $$
DECLARE
  v_author_id UUID;
BEGIN
  SELECT author_id INTO v_author_id FROM posts WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  IF v_author_id IS NULL THEN RETURN NULL; END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM update_user_affinity(NEW.author_id, v_author_id, 2.0);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM update_user_affinity(OLD.author_id, v_author_id, -1.0);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_affinity_on_comment ON comments;
CREATE TRIGGER trg_affinity_on_comment
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION affinity_on_comment();

-- Trigger: update affinity on bookmark
CREATE OR REPLACE FUNCTION affinity_on_bookmark() RETURNS TRIGGER AS $$
DECLARE
  v_author_id UUID;
BEGIN
  SELECT author_id INTO v_author_id FROM posts WHERE id = COALESCE(NEW.post_id, OLD.post_id);
  IF v_author_id IS NULL THEN RETURN NULL; END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM update_user_affinity(NEW.user_id, v_author_id, 1.5);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM update_user_affinity(OLD.user_id, v_author_id, -0.5);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_affinity_on_bookmark ON bookmarks;
CREATE TRIGGER trg_affinity_on_bookmark
  AFTER INSERT OR DELETE ON bookmarks
  FOR EACH ROW EXECUTE FUNCTION affinity_on_bookmark();

-- Trigger: update affinity on subscription (big boost)
CREATE OR REPLACE FUNCTION affinity_on_subscription() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM update_user_affinity(NEW.subscriber_id, NEW.creator_id, 10.0);
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status = 'active' THEN
    PERFORM update_user_affinity(NEW.subscriber_id, NEW.creator_id, -5.0);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_affinity_on_subscription ON subscriptions;
CREATE TRIGGER trg_affinity_on_subscription
  AFTER INSERT OR UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION affinity_on_subscription();

-- Trigger: block/mute sets affinity to -100
CREATE OR REPLACE FUNCTION affinity_on_block() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM update_user_affinity(NEW.blocker_id, NEW.blocked_id, -100.0);
  ELSIF TG_OP = 'DELETE' THEN
    -- Reset affinity back to 0 when unblocking
    UPDATE user_affinities SET affinity_score = 0.0
    WHERE user_id = OLD.blocker_id AND creator_id = OLD.blocked_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_affinity_on_block ON blocks;
CREATE TRIGGER trg_affinity_on_block
  AFTER INSERT OR DELETE ON blocks
  FOR EACH ROW EXECUTE FUNCTION affinity_on_block();

-- Trigger: purchase PPV content (strong signal)
CREATE OR REPLACE FUNCTION affinity_on_purchase() RETURNS TRIGGER AS $$
DECLARE
  v_author_id UUID;
BEGIN
  SELECT author_id INTO v_author_id FROM posts WHERE id = NEW.post_id;
  IF v_author_id IS NOT NULL THEN
    PERFORM update_user_affinity(NEW.buyer_id, v_author_id, 5.0);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_affinity_on_purchase ON purchases;
CREATE TRIGGER trg_affinity_on_purchase
  AFTER INSERT ON purchases
  FOR EACH ROW EXECUTE FUNCTION affinity_on_purchase();

-- Daily affinity decay: reduce stale affinities by 5%
CREATE OR REPLACE FUNCTION decay_user_affinities()
RETURNS INT AS $$
DECLARE
  affected INT;
BEGIN
  UPDATE user_affinities
  SET affinity_score = affinity_score * 0.95
  WHERE last_interaction < NOW() - INTERVAL '7 days'
    AND affinity_score > 0.1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- A1 + A6: PERSONALIZED FEED RPC (replaces ranked_posts view)
-- Inherits RLS on posts table for block filtering
-- ============================================================================
CREATE OR REPLACE FUNCTION personalized_feed(
  p_user_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
) RETURNS TABLE (
  id UUID,
  author_id UUID,
  content TEXT,
  post_type post_type,
  visibility visibility_type,
  is_pinned BOOLEAN,
  like_count INTEGER,
  comment_count INTEGER,
  repost_count INTEGER,
  view_count INTEGER,
  tip_amount DECIMAL,
  price DECIMAL,
  cover_image_url TEXT,
  media_count INTEGER,
  repost_of UUID,
  reposted_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  hot_score FLOAT,
  personal_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.author_id,
    p.content,
    p.post_type,
    p.visibility,
    p.is_pinned,
    p.like_count,
    p.comment_count,
    p.repost_count,
    p.view_count,
    p.tip_amount,
    p.price,
    p.cover_image_url,
    p.media_count,
    p.repost_of,
    p.reposted_by,
    p.created_at,
    p.updated_at,
    calculate_hot_score(p.like_count, p.comment_count, p.view_count, p.created_at) AS hot_score,
    (
      calculate_hot_score(p.like_count, p.comment_count, p.view_count, p.created_at)
      * GREATEST(COALESCE(ua.affinity_score, 1.0), 0.1)
      * CASE
          WHEN p_user_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM follows WHERE follower_id = p_user_id AND following_id = p.author_id
          ) THEN 1.5
          ELSE 1.0
        END
    ) AS personal_score
  FROM posts p
  LEFT JOIN user_affinities ua
    ON ua.user_id = p_user_id AND ua.creator_id = p.author_id
  WHERE p.visibility = 'public'
    -- Block filtering (A6): exclude blocked/muted users bidirectionally
    AND (p_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM blocks
      WHERE (blocker_id = p_user_id AND blocked_id = p.author_id)
         OR (blocker_id = p.author_id AND blocked_id = p_user_id)
    ))
    -- Exclude negative affinity (blocked via affinity system)
    AND (ua.affinity_score IS NULL OR ua.affinity_score > -50)
  ORDER BY personal_score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ============================================================================
-- A2: CONTENT DISCOVERY — HASHTAGS + CATEGORIES
-- ============================================================================

-- Hashtag registry
CREATE TABLE IF NOT EXISTS hashtags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  post_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hashtags_name ON hashtags(name);
CREATE INDEX IF NOT EXISTS idx_hashtags_count ON hashtags(post_count DESC);

ALTER TABLE hashtags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view hashtags"
  ON hashtags FOR SELECT USING (true);

CREATE POLICY "System can manage hashtags"
  ON hashtags FOR ALL USING (true) WITH CHECK (true);

-- Post-hashtag join table
CREATE TABLE IF NOT EXISTS post_hashtags (
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  hashtag_id UUID REFERENCES hashtags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, hashtag_id)
);

ALTER TABLE post_hashtags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view post_hashtags"
  ON post_hashtags FOR SELECT USING (true);

CREATE POLICY "System can manage post_hashtags"
  ON post_hashtags FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_post_hashtags_hashtag ON post_hashtags(hashtag_id);

-- Category column on posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS category TEXT;

-- Auto-extract hashtags from post content on insert/update
CREATE OR REPLACE FUNCTION extract_hashtags() RETURNS TRIGGER AS $$
DECLARE
  tag TEXT;
  tag_id UUID;
BEGIN
  -- Only process if content changed or is new
  IF TG_OP = 'UPDATE' AND NEW.content = OLD.content THEN
    RETURN NEW;
  END IF;

  -- Remove old hashtag links for this post on update
  IF TG_OP = 'UPDATE' THEN
    -- Decrement counts for old hashtags
    UPDATE hashtags SET post_count = GREATEST(post_count - 1, 0)
    WHERE id IN (SELECT hashtag_id FROM post_hashtags WHERE post_id = NEW.id);
    DELETE FROM post_hashtags WHERE post_id = NEW.id;
  END IF;

  -- Extract and link new hashtags
  IF NEW.content IS NOT NULL THEN
    FOR tag IN
      SELECT DISTINCT lower(m[1])
      FROM regexp_matches(NEW.content, '#([a-zA-Z0-9_]{1,50})', 'g') AS m
    LOOP
      -- Upsert hashtag
      INSERT INTO hashtags (name, post_count)
      VALUES (tag, 1)
      ON CONFLICT (name) DO UPDATE SET post_count = hashtags.post_count + 1
      RETURNING hashtags.id INTO tag_id;

      -- Link post to hashtag
      INSERT INTO post_hashtags (post_id, hashtag_id)
      VALUES (NEW.id, tag_id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_extract_hashtags ON posts;
CREATE TRIGGER trg_extract_hashtags
  AFTER INSERT OR UPDATE OF content ON posts
  FOR EACH ROW EXECUTE FUNCTION extract_hashtags();

-- Decrement hashtag counts when post is deleted
CREATE OR REPLACE FUNCTION cleanup_hashtags() RETURNS TRIGGER AS $$
BEGIN
  UPDATE hashtags SET post_count = GREATEST(post_count - 1, 0)
  WHERE id IN (SELECT hashtag_id FROM post_hashtags WHERE post_id = OLD.id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cleanup_hashtags ON posts;
CREATE TRIGGER trg_cleanup_hashtags
  BEFORE DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION cleanup_hashtags();

-- Explore posts RPC with category/hashtag/sort filtering
CREATE OR REPLACE FUNCTION explore_posts(
  p_user_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_hashtag TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT 'trending',
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
) RETURNS TABLE (
  post_id UUID,
  score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT p.id AS post_id,
    CASE p_sort
      WHEN 'trending' THEN
        (p.like_count * 3.0 + p.comment_count * 5.0 + p.view_count * 0.05)
        / POWER(GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0, 1.0), 1.2)
      WHEN 'latest' THEN EXTRACT(EPOCH FROM p.created_at)
      WHEN 'top' THEN (p.like_count * 2.0 + p.comment_count * 3.0)::FLOAT
      ELSE 0
    END AS score
  FROM posts p
  LEFT JOIN post_hashtags ph ON ph.post_id = p.id
  LEFT JOIN hashtags h ON h.id = ph.hashtag_id
  WHERE p.visibility = 'public'
    AND (p_category IS NULL OR p.category = p_category)
    AND (p_hashtag IS NULL OR h.name = lower(p_hashtag))
    -- Block filtering
    AND (p_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM blocks
      WHERE (blocker_id = p_user_id AND blocked_id = p.author_id)
         OR (blocker_id = p.author_id AND blocked_id = p_user_id)
    ))
  ORDER BY score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Trending hashtags RPC
CREATE OR REPLACE FUNCTION trending_hashtags(p_limit INT DEFAULT 10)
RETURNS TABLE (
  hashtag_name TEXT,
  hashtag_post_count INT,
  recent_posts BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    h.name,
    h.post_count,
    COUNT(ph.post_id) AS recent_posts
  FROM hashtags h
  JOIN post_hashtags ph ON ph.hashtag_id = h.id
  JOIN posts p ON p.id = ph.post_id AND p.created_at > NOW() - INTERVAL '24 hours'
  WHERE h.post_count > 0
  GROUP BY h.id, h.name, h.post_count
  ORDER BY recent_posts DESC, h.post_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ============================================================================
-- A3: TRENDING DETECTION (TIME-WINDOWED)
-- ============================================================================

-- Materialized view for trending creators (refreshed periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS trending_creators AS
SELECT
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.is_verified,
  p.follower_count,
  (SELECT COUNT(*) FROM follows WHERE following_id = p.id
   AND created_at > NOW() - INTERVAL '24 hours') AS new_followers_24h,
  (SELECT COALESCE(SUM(like_count + comment_count), 0) FROM posts
   WHERE author_id = p.id AND created_at > NOW() - INTERVAL '24 hours') AS engagement_24h,
  (
    (SELECT COUNT(*) FROM follows WHERE following_id = p.id
     AND created_at > NOW() - INTERVAL '24 hours')::FLOAT * 5.0
    + (SELECT COALESCE(SUM(like_count), 0) FROM posts
       WHERE author_id = p.id AND created_at > NOW() - INTERVAL '24 hours')::FLOAT * 2.0
    + (SELECT COALESCE(SUM(comment_count), 0) FROM posts
       WHERE author_id = p.id AND created_at > NOW() - INTERVAL '24 hours')::FLOAT * 3.0
  ) AS trending_score
FROM profiles p
WHERE p.is_creator = TRUE
ORDER BY trending_score DESC
LIMIT 50;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trending_creators_id ON trending_creators(id);

-- Materialized view for trending posts
CREATE MATERIALIZED VIEW IF NOT EXISTS trending_posts AS
SELECT
  p.id,
  p.author_id,
  p.content,
  p.post_type,
  p.like_count,
  p.comment_count,
  p.view_count,
  p.created_at,
  (
    (SELECT COUNT(*) FROM likes WHERE post_id = p.id
     AND created_at > NOW() - INTERVAL '4 hours')::FLOAT * 3.0
    + (SELECT COUNT(*) FROM comments WHERE post_id = p.id
       AND created_at > NOW() - INTERVAL '4 hours')::FLOAT * 5.0
  ) / GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0, 1.0) AS velocity_score
FROM posts p
WHERE p.visibility = 'public'
  AND p.created_at > NOW() - INTERVAL '7 days'
ORDER BY velocity_score DESC
LIMIT 100;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trending_posts_id ON trending_posts(id);

-- Function to refresh both trending views
CREATE OR REPLACE FUNCTION refresh_trending()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY trending_creators;
  REFRESH MATERIALIZED VIEW CONCURRENTLY trending_posts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Initial refresh
SELECT refresh_trending();


-- ============================================================================
-- A4: COLLABORATIVE FILTERING (SUGGESTED CREATORS)
-- ============================================================================
CREATE OR REPLACE FUNCTION suggest_creators(
  p_user_id UUID,
  p_limit INT DEFAULT 5
) RETURNS TABLE (
  creator_id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  is_verified BOOLEAN,
  follower_count INTEGER,
  overlap_score BIGINT
) AS $$
BEGIN
  -- Try collaborative filtering first
  RETURN QUERY
  WITH my_follows AS (
    SELECT following_id FROM follows WHERE follower_id = p_user_id
  ),
  similar_users AS (
    SELECT f.follower_id, COUNT(*) AS overlap
    FROM follows f
    INNER JOIN my_follows mf ON f.following_id = mf.following_id
    WHERE f.follower_id != p_user_id
    GROUP BY f.follower_id
    HAVING COUNT(*) >= 2
    ORDER BY overlap DESC
    LIMIT 100
  ),
  candidates AS (
    SELECT f.following_id, SUM(su.overlap) AS score
    FROM follows f
    INNER JOIN similar_users su ON f.follower_id = su.follower_id
    WHERE f.following_id NOT IN (SELECT following_id FROM my_follows)
      AND f.following_id != p_user_id
      AND f.following_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = p_user_id)
      AND EXISTS (SELECT 1 FROM profiles WHERE id = f.following_id AND is_creator = TRUE)
    GROUP BY f.following_id
  )
  SELECT
    pr.id AS creator_id,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    pr.is_verified,
    pr.follower_count,
    c.score AS overlap_score
  FROM candidates c
  JOIN profiles pr ON pr.id = c.following_id
  ORDER BY c.score DESC
  LIMIT p_limit;

  -- Cold start fallback: if no collaborative results, use popularity
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      pr.id AS creator_id,
      pr.username,
      pr.display_name,
      pr.avatar_url,
      pr.is_verified,
      pr.follower_count,
      pr.follower_count::BIGINT AS overlap_score
    FROM profiles pr
    WHERE pr.is_creator = TRUE
      AND pr.id != p_user_id
      AND pr.id NOT IN (SELECT following_id FROM follows WHERE follower_id = p_user_id)
      AND pr.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = p_user_id)
    ORDER BY pr.follower_count DESC
    LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ============================================================================
-- A7: ENGAGEMENT-WEIGHTED NOTIFICATIONS
-- ============================================================================
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium'
  CHECK (priority IN ('high', 'medium', 'low'));

-- Set priority based on affinity when creating notifications
CREATE OR REPLACE FUNCTION set_notification_priority() RETURNS TRIGGER AS $$
DECLARE
  v_affinity FLOAT;
BEGIN
  IF NEW.actor_id IS NOT NULL AND NEW.user_id IS NOT NULL THEN
    SELECT affinity_score INTO v_affinity
    FROM user_affinities
    WHERE user_id = NEW.user_id AND creator_id = NEW.actor_id;

    IF v_affinity IS NOT NULL THEN
      IF v_affinity >= 10.0 THEN
        NEW.priority := 'high';
      ELSIF v_affinity >= 3.0 THEN
        NEW.priority := 'medium';
      ELSE
        NEW.priority := 'low';
      END IF;
    END IF;
  END IF;

  -- Certain notification types are always high priority
  IF NEW.notification_type IN ('subscription', 'tip') THEN
    NEW.priority := 'high';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_notification_priority ON notifications;
CREATE TRIGGER trg_set_notification_priority
  BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_notification_priority();


-- ============================================================================
-- A8: REEL AUTOPLAY ALGORITHM
-- ============================================================================

-- Track reel watch time for engagement signal
CREATE TABLE IF NOT EXISTS reel_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  watch_time_seconds INT DEFAULT 0,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

ALTER TABLE reel_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reel_views"
  ON reel_views FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can track reel views"
  ON reel_views FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update reel views"
  ON reel_views FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reel_views_user ON reel_views(user_id);
CREATE INDEX IF NOT EXISTS idx_reel_views_post ON reel_views(post_id);

-- RPC to upsert reel watch time
CREATE OR REPLACE FUNCTION track_reel_view(
  p_user_id UUID,
  p_post_id UUID,
  p_watch_time INT,
  p_completed BOOLEAN DEFAULT FALSE
) RETURNS VOID AS $$
BEGIN
  INSERT INTO reel_views (user_id, post_id, watch_time_seconds, completed)
  VALUES (p_user_id, p_post_id, p_watch_time, p_completed)
  ON CONFLICT (user_id, post_id) DO UPDATE SET
    watch_time_seconds = GREATEST(reel_views.watch_time_seconds, p_watch_time),
    completed = reel_views.completed OR p_completed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Personalized reels feed — engagement-weighted, not just chronological
CREATE OR REPLACE FUNCTION personalized_reels(
  p_user_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
) RETURNS TABLE (
  post_id UUID,
  score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id AS post_id,
    (
      calculate_hot_score(p.like_count, p.comment_count, p.view_count, p.created_at)
      * GREATEST(COALESCE(ua.affinity_score, 1.0), 0.1)
      * CASE
          WHEN rv.post_id IS NOT NULL THEN 0.1  -- Already watched → heavily downrank
          ELSE 1.0
        END
    ) AS score
  FROM posts p
  LEFT JOIN user_affinities ua
    ON p_user_id IS NOT NULL AND ua.user_id = p_user_id AND ua.creator_id = p.author_id
  LEFT JOIN reel_views rv
    ON p_user_id IS NOT NULL AND rv.user_id = p_user_id AND rv.post_id = p.id
  WHERE p.post_type = 'video'
    AND p.visibility = 'public'
    -- Block filtering
    AND (p_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM blocks
      WHERE (blocker_id = p_user_id AND blocked_id = p.author_id)
         OR (blocker_id = p.author_id AND blocked_id = p_user_id)
    ))
  ORDER BY score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ============================================================================
-- BATCH VIEW COUNT (ensure it exists)
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_view_counts(p_post_ids UUID[])
RETURNS VOID AS $$
BEGIN
  UPDATE posts SET view_count = view_count + 1
  WHERE id = ANY(p_post_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- INDEXES for algorithm performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_visibility_created ON posts(visibility, created_at DESC) WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_likes_created ON likes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_created ON follows(created_at DESC);
