-- =============================================================================
-- REVERT: Restore visibility filtering in feed RPCs and posts RLS
-- The correct behavior: subscribers_only posts hidden from non-subscribers.
-- The only fix needed was: creators can see their OWN subscriber-only posts
-- (handled by OR p.author_id = p_user_id).
-- =============================================================================

-- 1. Restore restrictive posts SELECT RLS policy
DROP POLICY IF EXISTS "Anyone can view all posts" ON posts;
DROP POLICY IF EXISTS "Users can view public posts" ON posts;

CREATE POLICY "Users can view public posts"
  ON posts FOR SELECT
  USING (
    visibility = 'public'
    OR author_id = auth.uid()
    OR (visibility = 'followers_only' AND is_following(author_id))
    OR (visibility = 'subscribers_only' AND is_subscribed_to(author_id))
  );


-- 2. Restore personalized_feed WITH self-visibility fix
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
  IF p_user_id IS NOT NULL THEN
    SELECT ea.experiment_id, ea.bucket INTO v_experiment_id, v_bucket
    FROM experiment_assignments ea
    JOIN experiments e ON e.id = ea.experiment_id
    WHERE ea.user_id = p_user_id AND e.status = 'active'
    ORDER BY ea.assigned_at DESC LIMIT 1;

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

      v_use_ml := (v_w_bias IS NOT NULL);
      IF NOT v_use_ml THEN
        v_w_bias := -1.0; v_w_ln_engagement := 0.8; v_w_ln_affinity := 0.6;
        v_w_is_following := 0.8; v_w_is_subscribed := 1.5; v_w_content_pref := 0.5;
        v_w_velocity_ratio := 1.2; v_w_ln_friend_likes := 0.8; v_w_inv_age := 2.0;
        v_w_is_novel := 1.0; v_w_has_media := 0.3; v_w_topic_affinity := 0.5;
      END IF;
    END IF;
  END IF;

  RETURN QUERY
  WITH
  user_follows AS (
    SELECT following_id FROM follows WHERE follower_id = p_user_id
  ),
  user_subs AS (
    SELECT creator_id FROM subscriptions
    WHERE subscriber_id = p_user_id AND status = 'active' AND expires_at > NOW()
  ),
  velocity AS (
    SELECT l.post_id, COUNT(*)::FLOAT AS recent_likes
    FROM likes l
    JOIN posts p ON p.id = l.post_id AND p.created_at > NOW() - INTERVAL '14 days'
    WHERE l.created_at > NOW() - INTERVAL '6 hours'
    GROUP BY l.post_id
  ),
  social_proof AS (
    SELECT l.post_id, COUNT(*)::FLOAT AS friend_likes
    FROM likes l
    WHERE l.user_id IN (SELECT following_id FROM user_follows)
      AND l.created_at > NOW() - INTERVAL '7 days'
    GROUP BY l.post_id
  ),
  candidates AS (
    SELECT
      p.id, p.author_id, p.content, p.post_type, p.visibility, p.is_pinned,
      p.like_count, p.comment_count, p.repost_count, p.view_count,
      p.tip_amount, p.price, p.cover_image_url, p.media_count,
      p.repost_of, p.reposted_by, p.created_at, p.updated_at,
      calculate_hot_score(p.like_count, p.comment_count, p.view_count, p.created_at) AS base_score,
      EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 AS age_hours,
      COALESCE(ua.affinity_score, 0.0) AS affinity,
      (p.author_id IN (SELECT following_id FROM user_follows)) AS is_following,
      (p.author_id IN (SELECT creator_id FROM user_subs)) AS is_subscribed,
      COALESCE(ucp.preference_score, 1.0) AS content_pref,
      COALESCE(pi.seen_count, 0) AS seen_count,
      COALESCE(v.recent_likes, 0.0) AS recent_likes,
      COALESCE(sp.friend_likes, 0.0) AS friend_likes,
      COALESCE(topic_agg.avg_topic_score, 0.0) AS topic_score,
      COALESCE(author_p.is_plus AND author_p.plus_tier = 'creator' AND author_p.plus_expires_at > NOW(), FALSE) AS author_is_plus
    FROM posts p
    LEFT JOIN user_affinities ua
      ON p_user_id IS NOT NULL AND ua.user_id = p_user_id AND ua.creator_id = p.author_id
    LEFT JOIN user_content_preferences ucp
      ON p_user_id IS NOT NULL AND ucp.user_id = p_user_id AND ucp.content_type = p.post_type::TEXT
    LEFT JOIN post_impressions pi
      ON p_user_id IS NOT NULL AND pi.user_id = p_user_id AND pi.post_id = p.id
    LEFT JOIN velocity v ON v.post_id = p.id
    LEFT JOIN social_proof sp ON sp.post_id = p.id
    LEFT JOIN LATERAL (
      SELECT AVG(uta.affinity_score) AS avg_topic_score
      FROM post_hashtags ph
      JOIN user_topic_affinities uta ON uta.user_id = p_user_id AND uta.hashtag_id = ph.hashtag_id
      WHERE ph.post_id = p.id
    ) topic_agg ON p_user_id IS NOT NULL
    LEFT JOIN profiles author_p ON author_p.id = p.author_id
    WHERE
      -- Visibility: public, own posts, or subscribed
      (p.author_id = p_user_id
        OR p.visibility = 'public'
        OR (p.visibility = 'subscribers_only' AND p_user_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM subscriptions s
              WHERE s.subscriber_id = p_user_id AND s.creator_id = p.author_id
                AND s.status = 'active' AND s.expires_at > NOW()
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
  scored AS (
    SELECT
      c.*,
      (
        CASE WHEN v_use_ml THEN
          (1.0 / (1.0 + EXP(-(
            v_w_bias
            + v_w_ln_engagement * LN(GREATEST(c.base_score, 0.001))
            + v_w_ln_affinity * LN(GREATEST(c.affinity, 0) + 1.0)
            + v_w_is_following * CASE WHEN c.is_following THEN 1.0 ELSE 0.0 END
            + v_w_is_subscribed * CASE WHEN c.is_subscribed THEN 1.0 ELSE 0.0 END
            + v_w_content_pref * c.content_pref
            + v_w_velocity_ratio * LEAST(c.recent_likes / GREATEST(c.like_count::FLOAT, 1.0), 3.0)
            + v_w_ln_friend_likes * LN(c.friend_likes + 1.0)
            + v_w_inv_age * (1.0 / (c.age_hours + 1.0))
            + v_w_is_novel * CASE WHEN c.seen_count = 0 THEN 1.0 ELSE 0.0 END
            + v_w_has_media * CASE WHEN c.media_count > 0 THEN 1.0 ELSE 0.0 END
            + v_w_topic_affinity * GREATEST(c.topic_score, 0.0)
          ))))
          * (1.0 / (1.0 + c.seen_count * 0.3))
          * CASE WHEN c.author_is_plus THEN 1.35 ELSE 1.0 END
          * (0.85 + random() * 0.30)
        ELSE
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
            * (1.0 / (1.0 + c.seen_count * 0.3))
            * CASE WHEN c.media_count > 0 THEN 1.2 ELSE 1.0 END
            * (1.0 + LEAST(GREATEST(c.topic_score, 0.0) * 0.3, 1.5))
            * CASE WHEN c.author_is_plus THEN 1.35 ELSE 1.0 END
          )
          * (0.85 + random() * 0.30)
        END
      ) AS computed_score
    FROM candidates c
  )
  SELECT
    s.id, s.author_id, s.content, s.post_type, s.visibility, s.is_pinned,
    s.like_count, s.comment_count, s.repost_count, s.view_count,
    s.tip_amount, s.price, s.cover_image_url, s.media_count,
    s.repost_of, s.reposted_by, s.created_at, s.updated_at,
    s.base_score AS hot_score,
    s.computed_score AS personal_score
  FROM scored s
  ORDER BY s.computed_score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- 3. Restore following_feed_ranked WITH self-visibility fix
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
    UNION
    SELECT p_user_id
  )
  SELECT
    p.id, p.author_id, p.content, p.post_type, p.visibility, p.is_pinned,
    p.like_count, p.comment_count, p.repost_count, p.view_count,
    p.tip_amount, p.price, p.cover_image_url, p.media_count,
    p.repost_of, p.reposted_by, p.created_at, p.updated_at,
    calculate_hot_score(p.like_count, p.comment_count, p.view_count, p.created_at) AS hot_score,
    (
      calculate_hot_score(p.like_count, p.comment_count, p.view_count, p.created_at)
      * GREATEST(
          CASE
            WHEN COALESCE(ua.affinity_score, 0) > 0 THEN 1.0 + LN(ua.affinity_score + 1.0) * 0.5
            ELSE 1.0
          END, 0.5)
      * CASE WHEN p.is_pinned THEN 1.5 ELSE 1.0 END
      * CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 < 2 THEN 5.0
          WHEN EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 < 6 THEN 3.0
          WHEN EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 < 24 THEN 2.0
          WHEN EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 < 72 THEN 1.0
          ELSE 0.5
        END
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
    -- Visibility: own posts, public, or subscribed
    (p.author_id = p_user_id
      OR p.visibility = 'public'
      OR (p.visibility = 'subscribers_only'
          AND EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.subscriber_id = p_user_id AND s.creator_id = p.author_id
              AND s.status = 'active' AND s.expires_at > NOW()
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


-- 4. Restore personalized_reels WITH self-visibility fix
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
    p.id, p.author_id, p.content, p.post_type, p.visibility, p.is_pinned,
    p.like_count, p.comment_count, p.repost_count, p.view_count,
    p.tip_amount, p.price, p.cover_image_url, p.media_count,
    p.repost_of, p.reposted_by, p.created_at, p.updated_at,
    (
      calculate_hot_score(p.like_count, p.comment_count, p.view_count, p.created_at)
      * GREATEST(
          CASE
            WHEN COALESCE(ua.affinity_score, 0) > 0 THEN 1.0 + LN(ua.affinity_score + 1.0) * 0.5
            ELSE 1.0
          END, 0.1)
      * (1.0 + LEAST(COALESCE(v.recent_likes, 0) / GREATEST(p.like_count::FLOAT, 1.0) * 3.0, 3.0))
      * CASE WHEN rv.post_id IS NOT NULL THEN 0.1 ELSE 1.0 END
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
      p.author_id = p_user_id
      OR p.visibility = 'public'
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


-- 5. Restore explore_posts — public only (correct for explore/discover)
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
        (
          (COALESCE(v.recent_likes, 0) * 3.0 + p.comment_count * 5.0 + p.like_count * 1.0)
          / POWER(GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0, 0.5), 1.1)
        )
        * CASE
            WHEN p_user_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM user_affinities ua
              WHERE ua.user_id = p_user_id AND ua.creator_id = p.author_id AND ua.affinity_score > 3
            ) THEN 1.3
            ELSE 1.0
          END
        * CASE
            WHEN EXISTS (
              SELECT 1 FROM profiles pr
              WHERE pr.id = p.author_id AND pr.is_plus = TRUE
                AND pr.plus_tier = 'creator' AND pr.plus_expires_at > NOW()
            ) THEN 1.30
            ELSE 1.0
          END
      WHEN 'latest' THEN EXTRACT(EPOCH FROM p.created_at)
      WHEN 'top' THEN (p.like_count * 2.0 + p.comment_count * 3.0 + p.view_count * 0.05)::FLOAT
      ELSE 0
    END AS score
  FROM posts p
  LEFT JOIN post_hashtags ph ON ph.post_id = p.id
  LEFT JOIN hashtags h ON h.id = ph.hashtag_id
  LEFT JOIN velocity v ON v.pid = p.id
  WHERE p.visibility = 'public'
    AND (p.is_draft IS NULL OR p.is_draft = FALSE)
    AND (p_category IS NULL OR p.category = p_category)
    AND (p_hashtag IS NULL OR h.name = lower(p_hashtag))
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
