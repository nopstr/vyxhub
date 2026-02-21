-- ============================================================================
-- ML-BASED RANKING & A/B TESTING FRAMEWORK
-- February 21, 2026
-- ============================================================================
-- Adds:
-- 1. model_weights table — stores learned logistic regression coefficients
-- 2. experiments table — A/B test definitions
-- 3. experiment_assignments table — user ↔ bucket mapping
-- 4. experiment_metrics table — engagement tracking per bucket
-- 5. Updated personalized_feed with ML branch (sigmoid scoring)
-- 6. Training data export RPC for Python pipeline
-- 7. Experiment results aggregation RPC
-- 8. Auto-metric triggers on engagement
-- 9. Seed heuristic-equivalent default weights
-- 10. activate_model_version RPC
--
-- ML Scoring Formula (logistic regression):
--   P(engage) = sigmoid(w0 + w1*ln_engagement + w2*ln_affinity + w3*is_following
--     + w4*is_subscribed + w5*content_pref + w6*velocity_ratio + w7*ln_friend_likes
--     + w8*inv_age + w9*is_novel + w10*has_media + w11*topic_affinity)
--
-- Where sigmoid(x) = 1 / (1 + exp(-x))
-- ============================================================================


-- ============================================================================
-- 1. MODEL WEIGHTS — learned coefficients for feed scoring
-- ============================================================================
CREATE TABLE IF NOT EXISTS model_weights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  model_name TEXT NOT NULL DEFAULT 'feed_v1',
  feature_name TEXT NOT NULL,
  weight FLOAT NOT NULL DEFAULT 0.0,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (model_name, feature_name, version)
);

ALTER TABLE model_weights ENABLE ROW LEVEL SECURITY;

-- Anyone can read weights (they're not secret)
CREATE POLICY "Anyone can view model weights"
  ON model_weights FOR SELECT USING (true);

-- Only service role / SECURITY DEFINER can write
-- (no INSERT/UPDATE/DELETE policy for regular users)

CREATE INDEX IF NOT EXISTS idx_model_weights_active
  ON model_weights(model_name, is_active) WHERE is_active = TRUE;


-- ============================================================================
-- 2. EXPERIMENTS — A/B test definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS experiments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  control_variant TEXT DEFAULT 'heuristic_v2',
  test_variant TEXT DEFAULT 'ml_v1',
  traffic_pct FLOAT DEFAULT 0.5 CHECK (traffic_pct >= 0 AND traffic_pct <= 1),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view experiments"
  ON experiments FOR SELECT USING (true);


-- ============================================================================
-- 3. EXPERIMENT ASSIGNMENTS — user ↔ bucket mapping
-- ============================================================================
CREATE TABLE IF NOT EXISTS experiment_assignments (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  experiment_id UUID REFERENCES experiments(id) ON DELETE CASCADE,
  bucket INT NOT NULL CHECK (bucket IN (0, 1)),  -- 0=control (heuristic), 1=test (ML)
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, experiment_id)
);

ALTER TABLE experiment_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own experiment assignment"
  ON experiment_assignments FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System manages experiment assignments"
  ON experiment_assignments FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_experiment_assignments_user
  ON experiment_assignments(user_id);

CREATE INDEX IF NOT EXISTS idx_experiment_assignments_experiment_bucket
  ON experiment_assignments(experiment_id, bucket);


-- ============================================================================
-- 4. EXPERIMENT METRICS — engagement events per bucket
-- ============================================================================
CREATE TABLE IF NOT EXISTS experiment_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  experiment_id UUID REFERENCES experiments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  bucket INT NOT NULL,
  event_type TEXT NOT NULL,  -- 'like', 'comment', 'bookmark', 'impression'
  post_id UUID,
  value FLOAT DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE experiment_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own experiment metrics"
  ON experiment_metrics FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System manages experiment metrics"
  ON experiment_metrics FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_experiment_metrics_experiment
  ON experiment_metrics(experiment_id, bucket, event_type);

CREATE INDEX IF NOT EXISTS idx_experiment_metrics_created
  ON experiment_metrics(created_at DESC);


-- ============================================================================
-- 5. AUTO-METRIC TRIGGER — records engagement events for experiment users
-- Fires on likes, comments, bookmarks. No frontend changes needed.
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_experiment_metric_on_engage()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_post_id UUID;
  v_experiment_id UUID;
  v_bucket INT;
BEGIN
  -- Determine user and post from trigger context
  IF TG_TABLE_NAME = 'comments' THEN
    v_user_id := NEW.author_id;
  ELSE
    v_user_id := NEW.user_id;
  END IF;
  v_post_id := NEW.post_id;

  -- Check if user is in an active experiment
  SELECT ea.experiment_id, ea.bucket INTO v_experiment_id, v_bucket
  FROM experiment_assignments ea
  JOIN experiments e ON e.id = ea.experiment_id
  WHERE ea.user_id = v_user_id AND e.status = 'active'
  LIMIT 1;

  -- Record metric if in experiment
  IF v_experiment_id IS NOT NULL THEN
    INSERT INTO experiment_metrics (experiment_id, user_id, bucket, event_type, post_id)
    VALUES (v_experiment_id, v_user_id, v_bucket, TG_TABLE_NAME, v_post_id);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach to likes
DROP TRIGGER IF EXISTS trg_experiment_metric_likes ON likes;
CREATE TRIGGER trg_experiment_metric_likes
  AFTER INSERT ON likes
  FOR EACH ROW EXECUTE FUNCTION trg_experiment_metric_on_engage();

-- Attach to comments
DROP TRIGGER IF EXISTS trg_experiment_metric_comments ON comments;
CREATE TRIGGER trg_experiment_metric_comments
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION trg_experiment_metric_on_engage();

-- Attach to bookmarks
DROP TRIGGER IF EXISTS trg_experiment_metric_bookmarks ON bookmarks;
CREATE TRIGGER trg_experiment_metric_bookmarks
  AFTER INSERT ON bookmarks
  FOR EACH ROW EXECUTE FUNCTION trg_experiment_metric_on_engage();


-- ============================================================================
-- 6. GET EXPERIMENT RESULTS — aggregates metrics per bucket for analysis
-- ============================================================================
CREATE OR REPLACE FUNCTION get_experiment_results(p_experiment_name TEXT)
RETURNS TABLE (
  bucket INT,
  user_count BIGINT,
  total_likes BIGINT,
  total_comments BIGINT,
  total_bookmarks BIGINT,
  total_engagements BIGINT,
  impression_count BIGINT,
  engagement_rate FLOAT,
  avg_engagements_per_user FLOAT
) AS $$
DECLARE
  v_experiment_id UUID;
BEGIN
  SELECT id INTO v_experiment_id FROM experiments WHERE name = p_experiment_name;
  IF v_experiment_id IS NULL THEN
    RAISE EXCEPTION 'Experiment not found: %', p_experiment_name;
  END IF;

  RETURN QUERY
  SELECT
    ea.bucket,
    COUNT(DISTINCT ea.user_id) AS user_count,
    COUNT(*) FILTER (WHERE em.event_type = 'likes') AS total_likes,
    COUNT(*) FILTER (WHERE em.event_type = 'comments') AS total_comments,
    COUNT(*) FILTER (WHERE em.event_type = 'bookmarks') AS total_bookmarks,
    COUNT(*) AS total_engagements,
    -- Count impressions from post_impressions for users in this bucket
    COALESCE((
      SELECT COUNT(*)::BIGINT FROM post_impressions pi2
      WHERE pi2.user_id IN (
        SELECT ea2.user_id FROM experiment_assignments ea2
        WHERE ea2.experiment_id = v_experiment_id AND ea2.bucket = ea.bucket
      )
    ), 0) AS impression_count,
    -- Engagement rate: engagements / impressions
    CASE WHEN COALESCE((
      SELECT COUNT(*) FROM post_impressions pi3
      WHERE pi3.user_id IN (
        SELECT ea3.user_id FROM experiment_assignments ea3
        WHERE ea3.experiment_id = v_experiment_id AND ea3.bucket = ea.bucket
      )
    ), 0) > 0 THEN
      COUNT(*)::FLOAT / (
        SELECT COUNT(*) FROM post_impressions pi4
        WHERE pi4.user_id IN (
          SELECT ea4.user_id FROM experiment_assignments ea4
          WHERE ea4.experiment_id = v_experiment_id AND ea4.bucket = ea.bucket
        )
      )::FLOAT
    ELSE 0 END AS engagement_rate,
    -- Avg engagements per user
    CASE WHEN COUNT(DISTINCT ea.user_id) > 0 THEN
      COUNT(*)::FLOAT / COUNT(DISTINCT ea.user_id)::FLOAT
    ELSE 0 END AS avg_engagements_per_user
  FROM experiment_assignments ea
  LEFT JOIN experiment_metrics em
    ON em.experiment_id = ea.experiment_id AND em.user_id = ea.user_id
  WHERE ea.experiment_id = v_experiment_id
  GROUP BY ea.bucket
  ORDER BY ea.bucket;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ============================================================================
-- 7. EXPORT TRAINING DATA — labeled feature vectors for ML pipeline
-- Returns (user, post) impression pairs with features + engagement label
-- ============================================================================
CREATE OR REPLACE FUNCTION export_training_data(
  p_days INT DEFAULT 30,
  p_limit INT DEFAULT 50000
) RETURNS TABLE (
  engaged BOOLEAN,
  ln_engagement FLOAT,
  ln_affinity FLOAT,
  is_following INT,
  is_subscribed INT,
  content_pref FLOAT,
  velocity_ratio FLOAT,
  ln_friend_likes FLOAT,
  inv_age FLOAT,
  has_media INT,
  topic_affinity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH sample AS (
    SELECT pi.user_id, pi.post_id, pi.seen_at
    FROM post_impressions pi
    WHERE pi.seen_at > NOW() - (p_days || ' days')::INTERVAL
    ORDER BY RANDOM()
    LIMIT p_limit
  )
  SELECT
    -- Label: did the user engage with this post?
    (
      EXISTS (SELECT 1 FROM likes l WHERE l.user_id = s.user_id AND l.post_id = s.post_id) OR
      EXISTS (SELECT 1 FROM comments c WHERE c.author_id = s.user_id AND c.post_id = s.post_id) OR
      EXISTS (SELECT 1 FROM bookmarks b WHERE b.user_id = s.user_id AND b.post_id = s.post_id)
    )::BOOLEAN AS engaged,

    -- Feature 1: log engagement (weighted likes + comments + views)
    LN(GREATEST(
      (p.like_count * 3.0 + p.comment_count * 5.0 + LEAST(p.view_count, 10000) * 0.1),
      0.1
    ))::FLOAT AS ln_engagement,

    -- Feature 2: log creator affinity
    LN(GREATEST(COALESCE(ua.affinity_score, 0), 0) + 1.0)::FLOAT AS ln_affinity,

    -- Feature 3: is following
    (CASE WHEN EXISTS (
      SELECT 1 FROM follows f WHERE f.follower_id = s.user_id AND f.following_id = p.author_id
    ) THEN 1 ELSE 0 END)::INT AS is_following,

    -- Feature 4: is subscribed
    (CASE WHEN EXISTS (
      SELECT 1 FROM subscriptions sub
      WHERE sub.subscriber_id = s.user_id AND sub.creator_id = p.author_id AND sub.status = 'active'
    ) THEN 1 ELSE 0 END)::INT AS is_subscribed,

    -- Feature 5: content type preference
    COALESCE(ucp.preference_score, 1.0)::FLOAT AS content_pref,

    -- Feature 6: engagement velocity (recent likes / total likes)
    LEAST(
      COALESCE((
        SELECT COUNT(*)::FLOAT FROM likes l2
        WHERE l2.post_id = p.id AND l2.created_at > s.seen_at - INTERVAL '6 hours'
      ) / GREATEST(p.like_count::FLOAT, 1.0), 0),
      3.0
    )::FLOAT AS velocity_ratio,

    -- Feature 7: log social proof (friend likes)
    LN(COALESCE((
      SELECT COUNT(*)::FLOAT FROM likes l3
      WHERE l3.post_id = s.post_id
        AND l3.user_id IN (SELECT following_id FROM follows WHERE follower_id = s.user_id)
        AND l3.created_at < s.seen_at
    ), 0) + 1.0)::FLOAT AS ln_friend_likes,

    -- Feature 8: inverse age at time of impression (freshness)
    (1.0 / (EXTRACT(EPOCH FROM (s.seen_at - p.created_at)) / 3600.0 + 1.0))::FLOAT AS inv_age,

    -- Feature 9: has media
    (CASE WHEN p.media_count > 0 THEN 1 ELSE 0 END)::INT AS has_media,

    -- Feature 10: topic affinity (avg across post's hashtags)
    GREATEST(COALESCE((
      SELECT AVG(uta.affinity_score)
      FROM post_hashtags ph
      JOIN user_topic_affinities uta ON uta.user_id = s.user_id AND uta.hashtag_id = ph.hashtag_id
      WHERE ph.post_id = s.post_id
    ), 0), 0)::FLOAT AS topic_affinity

  FROM sample s
  JOIN posts p ON p.id = s.post_id
  LEFT JOIN user_affinities ua ON ua.user_id = s.user_id AND ua.creator_id = p.author_id
  LEFT JOIN user_content_preferences ucp ON ucp.user_id = s.user_id AND ucp.content_type = p.post_type::TEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- ============================================================================
-- 8. ACTIVATE MODEL VERSION — switches which weight version is live
-- ============================================================================
CREATE OR REPLACE FUNCTION activate_model_version(
  p_model_name TEXT DEFAULT 'feed_v1',
  p_version INT DEFAULT 1
) RETURNS VOID AS $$
BEGIN
  -- Deactivate all versions of this model
  UPDATE model_weights SET is_active = FALSE WHERE model_name = p_model_name;
  -- Activate the specified version
  UPDATE model_weights SET is_active = TRUE
  WHERE model_name = p_model_name AND version = p_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================================
-- 9. UPDATED PERSONALIZED FEED — with ML branch
-- Checks experiment assignment + active model weights.
-- Bucket 0 (control) = existing heuristic. Bucket 1 (test) = ML sigmoid.
-- Auto-assigns users to experiments on first feed request.
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
DECLARE
  v_use_ml BOOLEAN := FALSE;
  v_experiment_id UUID;
  v_bucket INT;
  v_traffic_pct FLOAT;
  -- ML weight variables (11 features + bias)
  v_w_bias FLOAT := -1.0;
  v_w_ln_engagement FLOAT := 0.8;
  v_w_ln_affinity FLOAT := 0.6;
  v_w_is_following FLOAT := 0.8;
  v_w_is_subscribed FLOAT := 1.5;
  v_w_content_pref FLOAT := 0.5;
  v_w_velocity_ratio FLOAT := 1.2;
  v_w_ln_friend_likes FLOAT := 0.8;
  v_w_inv_age FLOAT := 2.0;
  v_w_is_novel FLOAT := 1.0;
  v_w_has_media FLOAT := 0.3;
  v_w_topic_affinity FLOAT := 0.5;
BEGIN
  -- ========================================================================
  -- EXPERIMENT DISPATCH: check if user should get ML scoring
  -- ========================================================================
  IF p_user_id IS NOT NULL THEN
    -- Check existing experiment assignment
    SELECT ea.experiment_id, ea.bucket INTO v_experiment_id, v_bucket
    FROM experiment_assignments ea
    JOIN experiments e ON e.id = ea.experiment_id
    WHERE ea.user_id = p_user_id AND e.status = 'active'
    ORDER BY ea.assigned_at DESC
    LIMIT 1;

    -- Auto-assign if not in any active experiment
    IF v_experiment_id IS NULL THEN
      SELECT e.id, e.traffic_pct INTO v_experiment_id, v_traffic_pct
      FROM experiments e WHERE e.status = 'active' LIMIT 1;

      IF v_experiment_id IS NOT NULL THEN
        v_bucket := CASE WHEN random() < v_traffic_pct THEN 1 ELSE 0 END;
        INSERT INTO experiment_assignments (user_id, experiment_id, bucket)
        VALUES (p_user_id, v_experiment_id, v_bucket)
        ON CONFLICT (user_id, experiment_id) DO NOTHING;
      ELSE
        v_bucket := 0;
      END IF;
    END IF;

    -- If in test bucket (1), load ML weights
    IF v_bucket = 1 THEN
      SELECT
        COALESCE(MAX(weight) FILTER (WHERE feature_name = 'bias'), NULL),
        COALESCE(MAX(weight) FILTER (WHERE feature_name = 'ln_engagement'), NULL),
        COALESCE(MAX(weight) FILTER (WHERE feature_name = 'ln_affinity'), NULL),
        COALESCE(MAX(weight) FILTER (WHERE feature_name = 'is_following'), NULL),
        COALESCE(MAX(weight) FILTER (WHERE feature_name = 'is_subscribed'), NULL),
        COALESCE(MAX(weight) FILTER (WHERE feature_name = 'content_pref'), NULL),
        COALESCE(MAX(weight) FILTER (WHERE feature_name = 'velocity_ratio'), NULL),
        COALESCE(MAX(weight) FILTER (WHERE feature_name = 'ln_friend_likes'), NULL),
        COALESCE(MAX(weight) FILTER (WHERE feature_name = 'inv_age'), NULL),
        COALESCE(MAX(weight) FILTER (WHERE feature_name = 'is_novel'), NULL),
        COALESCE(MAX(weight) FILTER (WHERE feature_name = 'has_media'), NULL),
        COALESCE(MAX(weight) FILTER (WHERE feature_name = 'topic_affinity'), NULL)
      INTO
        v_w_bias, v_w_ln_engagement, v_w_ln_affinity, v_w_is_following,
        v_w_is_subscribed, v_w_content_pref, v_w_velocity_ratio,
        v_w_ln_friend_likes, v_w_inv_age, v_w_is_novel, v_w_has_media,
        v_w_topic_affinity
      FROM model_weights
      WHERE model_name = 'feed_v1' AND is_active = TRUE;

      -- Only use ML if weights were actually found
      v_use_ml := (v_w_bias IS NOT NULL);

      -- Reset to defaults if no weights found (fall back to heuristic)
      IF NOT v_use_ml THEN
        v_w_bias := -1.0;
        v_w_ln_engagement := 0.8;
        v_w_ln_affinity := 0.6;
        v_w_is_following := 0.8;
        v_w_is_subscribed := 1.5;
        v_w_content_pref := 0.5;
        v_w_velocity_ratio := 1.2;
        v_w_ln_friend_likes := 0.8;
        v_w_inv_age := 2.0;
        v_w_is_novel := 1.0;
        v_w_has_media := 0.3;
        v_w_topic_affinity := 0.5;
      END IF;
    END IF;
  END IF;

  -- ========================================================================
  -- MAIN QUERY — shared candidate pool, branching only in scoring formula
  -- ========================================================================
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
      -- Visibility filter
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
      AND (p.is_draft IS NULL OR p.is_draft = FALSE)
      AND (p_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM blocks
        WHERE (blocker_id = p_user_id AND blocked_id = p.author_id)
           OR (blocker_id = p.author_id AND blocked_id = p_user_id)
      ))
      AND (ua.affinity_score IS NULL OR ua.affinity_score > -50)
      AND (p_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM hidden_posts hp WHERE hp.user_id = p_user_id AND hp.post_id = p.id
      ))
      AND p.created_at > NOW() - INTERVAL '30 days'

    ORDER BY p.created_at DESC
    LIMIT 500
  ),

  -- Score with EITHER heuristic (multiplicative) OR ML (sigmoid) formula
  scored AS (
    SELECT
      c.*,
      CASE WHEN v_use_ml THEN
        -- ================================================================
        -- ML PATH: Logistic regression sigmoid scoring
        -- P(engage) = 1 / (1 + exp(-(w0 + w1*f1 + ... + w11*f11)))
        -- ================================================================
        1.0 / (1.0 + EXP(-(
          v_w_bias
          + v_w_ln_engagement * LN(GREATEST(c.base_score, 0.001))
          + v_w_ln_affinity * LN(GREATEST(c.affinity, 0) + 1.0)
          + v_w_is_following * CASE WHEN c.is_following THEN 1.0 ELSE 0.0 END
          + v_w_is_subscribed * CASE WHEN c.is_subscribed THEN 1.0 ELSE 0.0 END
          + v_w_content_pref * c.content_pref
          + v_w_velocity_ratio * LEAST(c.recent_likes / GREATEST(c.like_count::FLOAT, 1.0), 3.0)
          + v_w_ln_friend_likes * LN(c.friend_likes + 1.0)
          + v_w_inv_age * (1.0 / (c.age_hours + 1.0))
          + v_w_is_novel * CASE WHEN c.is_seen THEN 0.0 ELSE 1.0 END
          + v_w_has_media * CASE WHEN c.media_count > 0 THEN 1.0 ELSE 0.0 END
          + v_w_topic_affinity * GREATEST(c.topic_score, 0.0)
        )))

      ELSE
        -- ================================================================
        -- HEURISTIC PATH: Multiplicative 9-factor scoring (unchanged)
        -- ================================================================
        (
          c.base_score
          * GREATEST(
              CASE
                WHEN c.affinity > 0 THEN 1.0 + LN(c.affinity + 1.0) * 0.6
                WHEN c.affinity < 0 THEN GREATEST(1.0 + c.affinity * 0.05, 0.1)
                ELSE 1.0
              END, 0.1)
          * CASE
              WHEN c.is_subscribed THEN 2.0
              WHEN c.is_following THEN 1.5
              ELSE 1.0
            END
          * GREATEST(c.content_pref, 0.5)
          * (1.0 + LEAST(c.recent_likes / GREATEST(c.like_count::FLOAT, 1.0) * 3.0, 3.0))
          * (1.0 + LEAST(c.friend_likes * 0.4, 2.0))
          * CASE
              WHEN c.age_hours < 1   THEN 3.0
              WHEN c.age_hours < 3   THEN 2.2
              WHEN c.age_hours < 8   THEN 1.6
              WHEN c.age_hours < 24  THEN 1.2
              WHEN c.age_hours < 72  THEN 1.0
              WHEN c.age_hours < 168 THEN 0.8
              ELSE 0.5
            END
          * CASE WHEN c.is_seen THEN 0.25 ELSE 1.0 END
          * CASE WHEN c.media_count > 0 THEN 1.2 ELSE 1.0 END
          * (1.0 + LEAST(GREATEST(c.topic_score, 0.0) * 0.3, 1.5))
        )
      END AS computed_score
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
-- 10. SEED DEFAULT ML WEIGHTS (version 0)
-- These approximate the heuristic behavior so the ML path produces similar
-- rankings even before any training has occurred.
-- ============================================================================
INSERT INTO model_weights (model_name, feature_name, weight, version, is_active) VALUES
  ('feed_v1', 'bias',            -1.0,  0, FALSE),
  ('feed_v1', 'ln_engagement',    0.8,  0, FALSE),
  ('feed_v1', 'ln_affinity',      0.6,  0, FALSE),
  ('feed_v1', 'is_following',     0.8,  0, FALSE),
  ('feed_v1', 'is_subscribed',    1.5,  0, FALSE),
  ('feed_v1', 'content_pref',     0.5,  0, FALSE),
  ('feed_v1', 'velocity_ratio',   1.2,  0, FALSE),
  ('feed_v1', 'ln_friend_likes',  0.8,  0, FALSE),
  ('feed_v1', 'inv_age',          2.0,  0, FALSE),
  ('feed_v1', 'is_novel',         1.0,  0, FALSE),
  ('feed_v1', 'has_media',        0.3,  0, FALSE),
  ('feed_v1', 'topic_affinity',   0.5,  0, FALSE)
ON CONFLICT (model_name, feature_name, version) DO NOTHING;


-- ============================================================================
-- 11. SEED DEFAULT EXPERIMENT (paused — activate when ready to test)
-- ============================================================================
INSERT INTO experiments (name, description, control_variant, test_variant, traffic_pct, status)
VALUES (
  'heuristic_vs_ml_v1',
  'A/B test: heuristic multiplicative scoring (control) vs ML logistic regression scoring (test). Activate when you have trained a model and are ready to test.',
  'heuristic_v2',
  'ml_v1',
  0.5,
  'paused'
) ON CONFLICT (name) DO NOTHING;


-- ============================================================================
-- 12. CLEANUP OLD EXPERIMENT DATA — pg_cron daily job
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_old_experiment_metrics()
RETURNS INT AS $$
DECLARE affected INT;
BEGIN
  -- Drop metrics older than 90 days
  DELETE FROM experiment_metrics WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-experiment-metrics',
      '0 5 * * 0',  -- Weekly Sunday 5am UTC
      'SELECT cleanup_old_experiment_metrics();'
    );
    RAISE NOTICE 'pg_cron: cleanup-experiment-metrics scheduled weekly';
  END IF;
END $$;


-- ============================================================================
-- 13. PERFORMANCE INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_model_weights_lookup
  ON model_weights(model_name, version, is_active);

CREATE INDEX IF NOT EXISTS idx_experiments_status
  ON experiments(status) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_experiment_metrics_agg
  ON experiment_metrics(experiment_id, bucket, event_type, created_at);
