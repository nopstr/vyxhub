-- ============================================================================
-- FEED ALGORITHM V2 — MULTI-FACTOR PERSONALIZATION ENGINE
-- February 21, 2026
-- ============================================================================
-- Replaces the basic personalized_feed RPC with a real multi-factor scoring
-- algorithm. Adds content type affinity, topic affinity, engagement velocity,
-- social proof, impression tracking, and ranked following feed.
--
-- Score formula (9 factors):
--   personal_score = base_engagement
--     × creator_affinity        (how much user engages with this creator)
--     × relationship_boost      (2x subscribed, 1.5x following, 1x discovery)
--     × content_type_preference (boost post types user prefers)
--     × engagement_velocity     (trending content gets boosted)
--     × social_proof            (liked by people user follows)
--     × freshness_bonus         (exponential time decay with recency boost)
--     × novelty_factor          (unseen posts boosted, seen posts penalized)
--     × media_richness          (posts with media slightly boosted)
--     × topic_affinity          (boost posts with hashtags user likes)
-- ============================================================================


-- ============================================================================
-- 1. USER CONTENT TYPE PREFERENCES
-- Tracks how much a user engages with each post type (video, image, set, text)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_content_preferences (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL,  -- 'post', 'video', 'set', 'reel'
  engagement_count INT DEFAULT 0,
  preference_score FLOAT DEFAULT 1.0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, content_type)
);

ALTER TABLE user_content_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own content preferences"
  ON user_content_preferences FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System manages content preferences"
  ON user_content_preferences FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_user_content_prefs_user
  ON user_content_preferences(user_id);


-- ============================================================================
-- 2. USER TOPIC AFFINITIES (hashtag-based)
-- Tracks which hashtags/topics the user engages with most
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_topic_affinities (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  hashtag_id UUID REFERENCES hashtags(id) ON DELETE CASCADE,
  affinity_score FLOAT DEFAULT 0.0,
  interaction_count INT DEFAULT 0,
  last_interaction TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, hashtag_id)
);

ALTER TABLE user_topic_affinities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own topic affinities"
  ON user_topic_affinities FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System manages topic affinities"
  ON user_topic_affinities FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_user_topic_affinities_user
  ON user_topic_affinities(user_id, affinity_score DESC);


-- ============================================================================
-- 3. POST IMPRESSIONS (seen tracking)
-- Lightweight: stores which posts each user has already "seen" in their feed
-- ============================================================================
CREATE TABLE IF NOT EXISTS post_impressions (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

ALTER TABLE post_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own impressions"
  ON post_impressions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_post_impressions_user
  ON post_impressions(user_id, seen_at DESC);

-- Auto-cleanup: drop impressions older than 14 days (keep table lean)
CREATE OR REPLACE FUNCTION cleanup_old_impressions()
RETURNS INT AS $$
DECLARE affected INT;
BEGIN
  DELETE FROM post_impressions WHERE seen_at < NOW() - INTERVAL '14 days';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 4. BATCH RECORD IMPRESSIONS RPC
-- Called from frontend to record which posts the user has seen
-- ============================================================================
CREATE OR REPLACE FUNCTION record_post_impressions(
  p_user_id UUID,
  p_post_ids UUID[]
) RETURNS VOID AS $$
BEGIN
  INSERT INTO post_impressions (user_id, post_id)
  SELECT p_user_id, unnest(p_post_ids)
  ON CONFLICT (user_id, post_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 5. TRIGGERS: Update content type + topic preferences on engagement
-- ============================================================================

-- Helper: update content type preference when user engages with a post
CREATE OR REPLACE FUNCTION update_content_type_pref(p_user_id UUID, p_post_id UUID, p_delta INT)
RETURNS VOID AS $$
DECLARE
  v_post_type TEXT;
BEGIN
  SELECT post_type::TEXT INTO v_post_type FROM posts WHERE id = p_post_id;
  IF v_post_type IS NULL THEN RETURN; END IF;

  INSERT INTO user_content_preferences (user_id, content_type, engagement_count, preference_score, last_updated)
  VALUES (p_user_id, v_post_type, GREATEST(p_delta, 0), 1.0, NOW())
  ON CONFLICT (user_id, content_type) DO UPDATE SET
    engagement_count = GREATEST(user_content_preferences.engagement_count + p_delta, 0),
    last_updated = NOW();

  -- Recalculate preference_score: normalize so the preferred type gets a boost
  -- Score = count / avg(count) across all types for this user, clamped 0.5-2.5
  UPDATE user_content_preferences ucp
  SET preference_score = LEAST(GREATEST(
    ucp.engagement_count::FLOAT / GREATEST(
      (SELECT AVG(engagement_count)::FLOAT FROM user_content_preferences WHERE user_id = p_user_id AND engagement_count > 0),
      1.0
    ),
    0.5
  ), 2.5)
  WHERE ucp.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: update topic affinity when user engages with a post's hashtags
CREATE OR REPLACE FUNCTION update_topic_affinity(p_user_id UUID, p_post_id UUID, p_delta FLOAT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_topic_affinities (user_id, hashtag_id, affinity_score, interaction_count, last_interaction)
  SELECT p_user_id, ph.hashtag_id, GREATEST(p_delta, 0), 1, NOW()
  FROM post_hashtags ph
  WHERE ph.post_id = p_post_id
  ON CONFLICT (user_id, hashtag_id) DO UPDATE SET
    affinity_score = GREATEST(user_topic_affinities.affinity_score + p_delta, -10),
    interaction_count = user_topic_affinities.interaction_count + 1,
    last_interaction = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: track content type + topic preferences on like
CREATE OR REPLACE FUNCTION feed_signals_on_like() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM update_content_type_pref(NEW.user_id, NEW.post_id, 1);
    PERFORM update_topic_affinity(NEW.user_id, NEW.post_id, 1.0);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM update_content_type_pref(OLD.user_id, OLD.post_id, -1);
    PERFORM update_topic_affinity(OLD.user_id, OLD.post_id, -0.5);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_feed_signals_on_like ON likes;
CREATE TRIGGER trg_feed_signals_on_like
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION feed_signals_on_like();

-- Trigger: track on comment
CREATE OR REPLACE FUNCTION feed_signals_on_comment() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM update_content_type_pref(NEW.author_id, NEW.post_id, 2);
    PERFORM update_topic_affinity(NEW.author_id, NEW.post_id, 2.0);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM update_content_type_pref(OLD.author_id, OLD.post_id, -1);
    PERFORM update_topic_affinity(OLD.author_id, OLD.post_id, -1.0);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_feed_signals_on_comment ON comments;
CREATE TRIGGER trg_feed_signals_on_comment
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION feed_signals_on_comment();

-- Trigger: track on bookmark (strong interest signal)
CREATE OR REPLACE FUNCTION feed_signals_on_bookmark() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM update_content_type_pref(NEW.user_id, NEW.post_id, 3);
    PERFORM update_topic_affinity(NEW.user_id, NEW.post_id, 2.0);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM update_content_type_pref(OLD.user_id, OLD.post_id, -1);
    PERFORM update_topic_affinity(OLD.user_id, OLD.post_id, -0.5);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_feed_signals_on_bookmark ON bookmarks;
CREATE TRIGGER trg_feed_signals_on_bookmark
  AFTER INSERT OR DELETE ON bookmarks
  FOR EACH ROW EXECUTE FUNCTION feed_signals_on_bookmark();


-- ============================================================================
-- 6. IMPROVED HOT SCORE — better time decay curve
-- Uses logarithmic decay instead of polynomial for more natural ranking
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
  -- Weighted engagement: comments > likes > views
  engagement := (p_like_count * 3.0) + (p_comment_count * 5.0) + (LEAST(p_view_count, 10000) * 0.1);
  age_hours := EXTRACT(EPOCH FROM (NOW() - p_created_at)) / 3600.0;

  -- Logarithmic gravity: gentler than polynomial but still decays
  -- log(age+2) grows slowly, giving newer content a natural advantage
  -- The +1 on engagement ensures even 0-engagement posts get a non-zero score
  RETURN (LN(engagement + 1.0) + 1.0) / POWER(age_hours + 2.0, 1.2);
END;
$$ LANGUAGE plpgsql STABLE;


-- ============================================================================
-- 7. PERSONALIZED FEED V2 — THE REAL ALGORITHM
-- Multi-factor scoring with 9 signals, candidate pool, and efficient JOINs
-- ============================================================================
DROP FUNCTION IF EXISTS personalized_feed(UUID, INT, INT);

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
  WITH
  -- Pre-compute user's social graph (once)
  user_follows AS (
    SELECT following_id FROM follows WHERE follower_id = p_user_id
  ),
  user_subs AS (
    SELECT creator_id FROM subscriptions
    WHERE subscriber_id = p_user_id AND status = 'active' AND expires_at > NOW()
  ),

  -- Pre-compute engagement velocity: posts with recent likes (last 6h)
  -- Only for posts created in the last 14 days (performance guard)
  velocity AS (
    SELECT l.post_id, COUNT(*)::FLOAT AS recent_likes
    FROM likes l
    JOIN posts p ON p.id = l.post_id AND p.created_at > NOW() - INTERVAL '14 days'
    WHERE l.created_at > NOW() - INTERVAL '6 hours'
    GROUP BY l.post_id
  ),

  -- Pre-compute social proof: posts liked by people the user follows (last 7d)
  social_proof AS (
    SELECT l.post_id, COUNT(*)::FLOAT AS friend_likes
    FROM likes l
    WHERE l.user_id IN (SELECT following_id FROM user_follows)
      AND l.created_at > NOW() - INTERVAL '7 days'
    GROUP BY l.post_id
  ),

  -- Candidate posts: broad pool with all filters applied
  candidates AS (
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

      -- Base score
      calculate_hot_score(p.like_count, p.comment_count, p.view_count, p.created_at) AS base_score,
      EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 AS age_hours,

      -- Factor 1: Creator affinity
      COALESCE(ua.affinity_score, 0.0) AS affinity,

      -- Factor 2: Relationship
      (p.author_id IN (SELECT following_id FROM user_follows)) AS is_following,
      (p.author_id IN (SELECT creator_id FROM user_subs)) AS is_subscribed,

      -- Factor 3: Content type preference
      COALESCE(ucp.preference_score, 1.0) AS content_pref,

      -- Factor 7: Already seen?
      (pi.post_id IS NOT NULL) AS is_seen,

      -- Factor 4: Velocity (pre-computed)
      COALESCE(v.recent_likes, 0.0) AS recent_likes,

      -- Factor 5: Social proof (pre-computed)
      COALESCE(sp.friend_likes, 0.0) AS friend_likes,

      -- Factor 9: Topic affinity (average affinity for post's hashtags)
      COALESCE(topic_agg.avg_topic_score, 0.0) AS topic_score

    FROM posts p

    -- Creator affinity
    LEFT JOIN user_affinities ua
      ON p_user_id IS NOT NULL AND ua.user_id = p_user_id AND ua.creator_id = p.author_id

    -- Content type preference
    LEFT JOIN user_content_preferences ucp
      ON p_user_id IS NOT NULL AND ucp.user_id = p_user_id AND ucp.content_type = p.post_type::TEXT

    -- Seen tracking
    LEFT JOIN post_impressions pi
      ON p_user_id IS NOT NULL AND pi.user_id = p_user_id AND pi.post_id = p.id

    -- Pre-computed velocity
    LEFT JOIN velocity v ON v.post_id = p.id

    -- Pre-computed social proof
    LEFT JOIN social_proof sp ON sp.post_id = p.id

    -- Topic affinity: average score across all hashtags on this post
    LEFT JOIN LATERAL (
      SELECT AVG(uta.affinity_score) AS avg_topic_score
      FROM post_hashtags ph
      JOIN user_topic_affinities uta
        ON uta.user_id = p_user_id AND uta.hashtag_id = ph.hashtag_id
      WHERE ph.post_id = p.id
    ) topic_agg ON p_user_id IS NOT NULL

    WHERE
      -- Visibility filter: public or subscribers_only for active subs
      (
        p.visibility = 'public'
        OR (
          p.visibility = 'subscribers_only'
          AND p_user_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.subscriber_id = p_user_id
              AND s.creator_id = p.author_id
              AND s.status = 'active'
              AND s.expires_at > NOW()
          )
        )
      )
      -- Draft filter: only published posts
      AND (p.is_draft IS NULL OR p.is_draft = FALSE)
      -- Block filter: exclude blocked/muted users bidirectionally
      AND (p_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM blocks
        WHERE (blocker_id = p_user_id AND blocked_id = p.author_id)
           OR (blocker_id = p.author_id AND blocked_id = p_user_id)
      ))
      -- Negative affinity filter
      AND (ua.affinity_score IS NULL OR ua.affinity_score > -50)
      -- Hidden posts filter
      AND (p_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM hidden_posts hp WHERE hp.user_id = p_user_id AND hp.post_id = p.id
      ))
      -- Age limit: don't surface posts older than 30 days (performance + relevance)
      AND p.created_at > NOW() - INTERVAL '30 days'

    -- Initial sort by recency to get a reasonable candidate pool
    ORDER BY p.created_at DESC
    LIMIT 500
  ),

  -- Score every candidate with the multi-factor formula
  scored AS (
    SELECT
      c.*,
      (
        -- BASE: engagement-weighted hot score
        c.base_score

        -- FACTOR 1: Creator affinity (0.1x to 5x)
        -- affinity_score ranges from -100 to 100+; normalize to multiplier
        -- 0 affinity = 1x, 10 = ~2x, 20+ = ~3x, negative = penalty
        * GREATEST(
            CASE
              WHEN c.affinity > 0 THEN 1.0 + LN(c.affinity + 1.0) * 0.6
              WHEN c.affinity < 0 THEN GREATEST(1.0 + c.affinity * 0.05, 0.1)
              ELSE 1.0
            END,
            0.1
          )

        -- FACTOR 2: Relationship boost
        * CASE
            WHEN c.is_subscribed THEN 2.0
            WHEN c.is_following THEN 1.5
            ELSE 1.0
          END

        -- FACTOR 3: Content type preference (0.5x to 2.5x)
        * GREATEST(c.content_pref, 0.5)

        -- FACTOR 4: Engagement velocity (1x to 4x)
        -- Recent likes relative to total = trending indicator
        * (1.0 + LEAST(
            c.recent_likes / GREATEST(c.like_count::FLOAT, 1.0) * 3.0,
            3.0
          ))

        -- FACTOR 5: Social proof (1x to 3x)
        -- Posts liked by people you follow are more relevant
        * (1.0 + LEAST(c.friend_likes * 0.4, 2.0))

        -- FACTOR 6: Freshness bonus (exponential recency boost)
        * CASE
            WHEN c.age_hours < 1   THEN 3.0   -- < 1 hour: huge boost
            WHEN c.age_hours < 3   THEN 2.2   -- 1-3 hours: strong boost
            WHEN c.age_hours < 8   THEN 1.6   -- 3-8 hours: moderate boost
            WHEN c.age_hours < 24  THEN 1.2   -- 8-24 hours: slight boost
            WHEN c.age_hours < 72  THEN 1.0   -- 1-3 days: neutral
            WHEN c.age_hours < 168 THEN 0.8   -- 3-7 days: slight penalty
            ELSE 0.5                           -- 7+ days: heavy penalty
          END

        -- FACTOR 7: Novelty (unseen posts boosted, seen posts penalized)
        * CASE WHEN c.is_seen THEN 0.25 ELSE 1.0 END

        -- FACTOR 8: Media richness (posts with media slightly boosted)
        * CASE WHEN c.media_count > 0 THEN 1.2 ELSE 1.0 END

        -- FACTOR 9: Topic affinity (1x to 2.5x)
        * (1.0 + LEAST(GREATEST(c.topic_score, 0.0) * 0.3, 1.5))
      ) AS computed_score

    FROM candidates c
  )

  -- Return top results
  SELECT
    s.id,
    s.author_id,
    s.content,
    s.post_type,
    s.visibility,
    s.is_pinned,
    s.like_count,
    s.comment_count,
    s.repost_count,
    s.view_count,
    s.tip_amount,
    s.price,
    s.cover_image_url,
    s.media_count,
    s.repost_of,
    s.reposted_by,
    s.created_at,
    s.updated_at,
    s.base_score AS hot_score,
    s.computed_score AS personal_score
  FROM scored s
  ORDER BY s.computed_score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ============================================================================
-- 8. RANKED FOLLOWING FEED
-- Instead of pure chronological, ranks followed creators' posts by engagement
-- within a recency window, with affinity weighting
-- ============================================================================
CREATE OR REPLACE FUNCTION following_feed_ranked(
  p_user_id UUID,
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
  WITH
  user_following AS (
    SELECT following_id FROM follows WHERE follower_id = p_user_id
    UNION
    SELECT creator_id FROM subscriptions
    WHERE subscriber_id = p_user_id AND status = 'active' AND expires_at > NOW()
  )
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
      -- Affinity weighting: high-affinity creators' posts rank higher
      * GREATEST(
          CASE
            WHEN COALESCE(ua.affinity_score, 0) > 0 THEN 1.0 + LN(ua.affinity_score + 1.0) * 0.5
            ELSE 1.0
          END,
          0.5
        )
      -- Pinned posts boosted
      * CASE WHEN p.is_pinned THEN 1.5 ELSE 1.0 END
      -- Strong recency bias for following feed (users expect chronological-ish)
      * CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 < 2 THEN 5.0
          WHEN EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 < 6 THEN 3.0
          WHEN EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 < 24 THEN 2.0
          WHEN EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 < 72 THEN 1.0
          ELSE 0.5
        END
      -- Seen penalty (lighter than For You since this is their followed content)
      * CASE
          WHEN EXISTS (SELECT 1 FROM post_impressions pi2 WHERE pi2.user_id = p_user_id AND pi2.post_id = p.id)
          THEN 0.5
          ELSE 1.0
        END
    ) AS personal_score
  FROM posts p
  JOIN user_following uf ON uf.following_id = p.author_id
  LEFT JOIN user_affinities ua
    ON ua.user_id = p_user_id AND ua.creator_id = p.author_id
  WHERE
    (
      p.visibility = 'public'
      OR (
        p.visibility = 'subscribers_only'
        AND EXISTS (
          SELECT 1 FROM subscriptions s
          WHERE s.subscriber_id = p_user_id
            AND s.creator_id = p.author_id
            AND s.status = 'active'
            AND s.expires_at > NOW()
        )
      )
    )
    AND (p.is_draft IS NULL OR p.is_draft = FALSE)
    AND NOT EXISTS (
      SELECT 1 FROM blocks
      WHERE (blocker_id = p_user_id AND blocked_id = p.author_id)
         OR (blocker_id = p.author_id AND blocked_id = p_user_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM hidden_posts hp WHERE hp.user_id = p_user_id AND hp.post_id = p.id
    )
    AND p.created_at > NOW() - INTERVAL '14 days'
  ORDER BY personal_score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ============================================================================
-- 9. ENHANCED EXPLORE — discovery algorithm with personalization
-- ============================================================================
DROP FUNCTION IF EXISTS explore_posts(UUID, TEXT, TEXT, TEXT, INT, INT);

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
  WITH
  velocity AS (
    SELECT l.post_id AS pid, COUNT(*)::FLOAT AS recent_likes
    FROM likes l
    JOIN posts p ON p.id = l.post_id AND p.created_at > NOW() - INTERVAL '14 days'
    WHERE l.created_at > NOW() - INTERVAL '6 hours'
    GROUP BY l.post_id
  )
  SELECT DISTINCT p.id AS post_id,
    CASE p_sort
      WHEN 'trending' THEN
        -- Velocity-based trending: recent engagement / age
        (
          (COALESCE(v.recent_likes, 0) * 3.0 + p.comment_count * 5.0 + p.like_count * 1.0)
          / POWER(GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0, 0.5), 1.1)
        )
        -- Personalization boost for explore (lighter than feed)
        * CASE
            WHEN p_user_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM user_affinities ua
              WHERE ua.user_id = p_user_id AND ua.creator_id = p.author_id AND ua.affinity_score > 3
            ) THEN 1.3
            ELSE 1.0
          END
      WHEN 'latest' THEN EXTRACT(EPOCH FROM p.created_at)
      WHEN 'top' THEN (p.like_count * 2.0 + p.comment_count * 3.0 + p.view_count * 0.05)::FLOAT
      ELSE 0
    END AS score
  FROM posts p
  LEFT JOIN post_hashtags ph ON ph.post_id = p.id
  LEFT JOIN hashtags h ON h.id = ph.hashtag_id
  LEFT JOIN velocity v ON v.post_id = p.id
  WHERE p.visibility = 'public'
    AND (p.is_draft IS NULL OR p.is_draft = FALSE)
    AND (p_category IS NULL OR p.category = p_category)
    AND (p_hashtag IS NULL OR h.name = lower(p_hashtag))
    -- Block filtering
    AND (p_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM blocks
      WHERE (blocker_id = p_user_id AND blocked_id = p.author_id)
         OR (blocker_id = p.author_id AND blocked_id = p_user_id)
    ))
    AND (p_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM hidden_posts hp WHERE hp.user_id = p_user_id AND hp.post_id = p.id
    ))
  ORDER BY score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ============================================================================
-- 10. ENHANCED PERSONALIZED REELS — same multi-factor approach
-- ============================================================================
DROP FUNCTION IF EXISTS personalized_reels(UUID, INT, INT);

CREATE OR REPLACE FUNCTION personalized_reels(
  p_user_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 10,
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
  score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH
  velocity AS (
    SELECT l.post_id AS pid, COUNT(*)::FLOAT AS recent_likes
    FROM likes l
    JOIN posts p ON p.id = l.post_id AND p.post_type = 'video' AND p.created_at > NOW() - INTERVAL '14 days'
    WHERE l.created_at > NOW() - INTERVAL '6 hours'
    GROUP BY l.post_id
  )
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
    (
      calculate_hot_score(p.like_count, p.comment_count, p.view_count, p.created_at)
      * GREATEST(
          CASE
            WHEN COALESCE(ua.affinity_score, 0) > 0 THEN 1.0 + LN(ua.affinity_score + 1.0) * 0.5
            ELSE 1.0
          END,
          0.1
        )
      -- Velocity boost
      * (1.0 + LEAST(COALESCE(v.recent_likes, 0) / GREATEST(p.like_count::FLOAT, 1.0) * 3.0, 3.0))
      -- Already watched → heavy penalty
      * CASE
          WHEN rv.post_id IS NOT NULL THEN 0.1
          ELSE 1.0
        END
      -- Freshness
      * CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 < 6 THEN 2.0
          WHEN EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 < 24 THEN 1.5
          ELSE 1.0
        END
    ) AS score
  FROM posts p
  LEFT JOIN user_affinities ua
    ON p_user_id IS NOT NULL AND ua.user_id = p_user_id AND ua.creator_id = p.author_id
  LEFT JOIN reel_views rv
    ON p_user_id IS NOT NULL AND rv.user_id = p_user_id AND rv.post_id = p.id
  LEFT JOIN velocity v ON v.pid = p.id
  WHERE p.post_type = 'video'
    AND (
      p.visibility = 'public'
      OR (
        p.visibility = 'subscribers_only'
        AND p_user_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM subscriptions s
          WHERE s.subscriber_id = p_user_id
            AND s.creator_id = p.author_id
            AND s.status = 'active'
            AND s.expires_at > NOW()
        )
      )
    )
    AND (p.is_draft IS NULL OR p.is_draft = FALSE)
    AND (p_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM blocks
      WHERE (blocker_id = p_user_id AND blocked_id = p.author_id)
         OR (blocker_id = p.author_id AND blocked_id = p_user_id)
    ))
    AND p.created_at > NOW() - INTERVAL '30 days'
  ORDER BY score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ============================================================================
-- 11. ENHANCED TRENDING — refresh materialized views with better scoring
-- ============================================================================
DROP MATERIALIZED VIEW IF EXISTS trending_posts CASCADE;
CREATE MATERIALIZED VIEW trending_posts AS
SELECT
  p.id,
  p.author_id,
  p.content,
  p.post_type,
  p.like_count,
  p.comment_count,
  p.view_count,
  p.created_at,
  -- Velocity score: engagement in recent window / age
  (
    (SELECT COUNT(*) FROM likes WHERE post_id = p.id
     AND created_at > NOW() - INTERVAL '4 hours')::FLOAT * 3.0
    + (SELECT COUNT(*) FROM comments WHERE post_id = p.id
       AND created_at > NOW() - INTERVAL '4 hours')::FLOAT * 5.0
    + (SELECT COUNT(*) FROM likes WHERE post_id = p.id
       AND created_at > NOW() - INTERVAL '24 hours')::FLOAT * 1.0
  ) / POWER(GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0, 0.5), 1.1) AS velocity_score
FROM posts p
WHERE p.visibility = 'public'
  AND (p.is_draft IS NULL OR p.is_draft = FALSE)
  AND p.created_at > NOW() - INTERVAL '7 days'
  AND (p.like_count + p.comment_count) > 0  -- Only posts with some engagement
ORDER BY velocity_score DESC
LIMIT 200;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trending_posts_id ON trending_posts(id);

-- Refresh trending views
DROP MATERIALIZED VIEW IF EXISTS trending_creators CASCADE;
CREATE MATERIALIZED VIEW trending_creators AS
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


-- ============================================================================
-- 12. DECAY TOPIC AFFINITIES — keep them fresh
-- ============================================================================
CREATE OR REPLACE FUNCTION decay_topic_affinities()
RETURNS INT AS $$
DECLARE affected INT;
BEGIN
  -- Decay topic affinities by 10% for entries not interacted with in 7 days
  UPDATE user_topic_affinities
  SET affinity_score = affinity_score * 0.90
  WHERE last_interaction < NOW() - INTERVAL '7 days'
    AND affinity_score > 0.1;
  GET DIAGNOSTICS affected = ROW_COUNT;

  -- Clean up near-zero entries
  DELETE FROM user_topic_affinities WHERE affinity_score < 0.05 AND affinity_score >= 0;

  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 13. PG_CRON SCHEDULING
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Refresh trending every 15 minutes
    PERFORM cron.schedule(
      'refresh-trending-views',
      '*/15 * * * *',
      'SELECT refresh_trending();'
    );

    -- Decay user affinities daily at 3am UTC
    PERFORM cron.schedule(
      'decay-user-affinities',
      '0 3 * * *',
      'SELECT decay_user_affinities();'
    );

    -- Decay topic affinities daily at 3:15am UTC
    PERFORM cron.schedule(
      'decay-topic-affinities',
      '15 3 * * *',
      'SELECT decay_topic_affinities();'
    );

    -- Clean up old impressions weekly on Sunday at 4am UTC
    PERFORM cron.schedule(
      'cleanup-old-impressions',
      '0 4 * * 0',
      'SELECT cleanup_old_impressions();'
    );

    RAISE NOTICE 'pg_cron jobs scheduled: refresh-trending (15min), decay-affinities (daily), cleanup-impressions (weekly)';
  ELSE
    RAISE NOTICE 'pg_cron not enabled. Enable it in Supabase dashboard for automatic scheduling.';
  END IF;
END $$;


-- ============================================================================
-- 14. PERFORMANCE INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_posts_created_desc_public
  ON posts(created_at DESC) WHERE visibility = 'public' AND (is_draft IS NULL OR is_draft = FALSE);

CREATE INDEX IF NOT EXISTS idx_likes_post_recent
  ON likes(post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_likes_user_recent
  ON likes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_author_created
  ON posts(author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_follows_follower
  ON follows(follower_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_active
  ON subscriptions(subscriber_id, status, expires_at)
  WHERE status = 'active';
