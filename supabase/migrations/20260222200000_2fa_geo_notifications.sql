-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 2FA, Geographic/Language Content, Engagement-Weighted Notifications
-- Date: 2026-02-21
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. TWO-FACTOR AUTHENTICATION ─────────────────────────────────────────
-- Supabase Auth handles TOTP natively via auth.mfa APIs.
-- We just need to track 2FA status on the profile for quick access.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;

-- ─── 2. GEOGRAPHIC / LANGUAGE CONTENT SURFACING ──────────────────────────
-- Store user's preferred language and detected country for content surfacing.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT NULL;

-- Add language and country to posts for geo/language-based surfacing
ALTER TABLE posts ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT NULL;

-- Index for language-based content queries
CREATE INDEX IF NOT EXISTS idx_posts_language ON posts(language) WHERE language IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_country ON posts(country_code) WHERE country_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_country ON profiles(country_code) WHERE country_code IS NOT NULL;

-- RPC: Get geo-surfaced content (boost posts in user's language + country)
CREATE OR REPLACE FUNCTION get_geo_surfaced_posts(
  p_user_id UUID DEFAULT NULL,
  p_language TEXT DEFAULT 'en',
  p_country TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
) RETURNS TABLE(
  id UUID,
  author_id UUID,
  content TEXT,
  post_type post_type,
  visibility visibility_type,
  like_count INT,
  comment_count INT,
  view_count INT,
  created_at TIMESTAMPTZ,
  language TEXT,
  country_code TEXT,
  geo_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.author_id,
    p.content,
    p.post_type,
    p.visibility,
    p.like_count,
    p.comment_count,
    p.view_count,
    p.created_at,
    p.language,
    p.country_code,
    -- Geo scoring: same language = 2x, same country = 1.5x, both = 3x
    (
      CASE WHEN p.language = p_language THEN 2.0 ELSE 1.0 END *
      CASE WHEN p_country IS NOT NULL AND p.country_code = p_country THEN 1.5 ELSE 1.0 END
    )::NUMERIC AS geo_score
  FROM posts p
  WHERE p.visibility = 'public'
    AND p.created_at > NOW() - INTERVAL '7 days'
    AND (p_user_id IS NULL OR p.author_id != p_user_id)
    -- Exclude hidden
    AND NOT EXISTS(
      SELECT 1 FROM hidden_posts hp WHERE hp.user_id = p_user_id AND hp.post_id = p.id
    )
  ORDER BY
    geo_score DESC,
    p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ─── 3. ENGAGEMENT-WEIGHTED NOTIFICATIONS (A9) ──────────────────────────
-- Priority scoring for notifications based on affinity + engagement.

-- Add priority_score to notifications for smart ordering
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority_score NUMERIC(6,2) DEFAULT 0;

-- Function to calculate notification priority based on user affinity
CREATE OR REPLACE FUNCTION calculate_notification_priority(
  p_recipient_id UUID,
  p_actor_id UUID,
  p_type TEXT
) RETURNS NUMERIC AS $$
DECLARE
  v_affinity NUMERIC;
  v_type_weight NUMERIC;
  v_score NUMERIC;
BEGIN
  -- Get affinity score (0-100 from user_affinities)
  SELECT COALESCE(affinity_score, 0) INTO v_affinity
  FROM user_affinities
  WHERE user_id = p_recipient_id AND target_user_id = p_actor_id;

  -- Type-based weighting
  v_type_weight := CASE p_type
    WHEN 'subscription' THEN 5.0  -- Highest: someone subscribed
    WHEN 'tip'          THEN 4.5  -- High: financial engagement
    WHEN 'comment'      THEN 3.0  -- Medium-high: conversation
    WHEN 'follow'       THEN 2.5  -- Medium: social graph growth
    WHEN 'like'         THEN 1.5  -- Lower: passive engagement
    WHEN 'mention'      THEN 3.5  -- High: direct attention
    WHEN 'message'      THEN 2.0  -- Medium: separate channel
    ELSE 1.0
  END;

  -- Combined score = type_weight * (1 + log(1 + affinity/10))
  v_score := v_type_weight * (1.0 + LN(1.0 + COALESCE(v_affinity, 0) / 10.0));

  RETURN ROUND(v_score, 2);
END;
$$ LANGUAGE plpgsql STABLE;

-- Update notification triggers to set priority_score
-- We'll create a trigger that fires BEFORE INSERT on notifications
CREATE OR REPLACE FUNCTION set_notification_priority()
RETURNS TRIGGER AS $$
BEGIN
  NEW.priority_score := calculate_notification_priority(
    NEW.user_id,
    NEW.actor_id,
    NEW.notification_type
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_notification_priority ON notifications;
CREATE TRIGGER trg_set_notification_priority
  BEFORE INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION set_notification_priority();

-- Update get_notifications_paginated to use priority_score
DROP FUNCTION IF EXISTS get_notifications_paginated(UUID, TIMESTAMPTZ, INT, TEXT);
CREATE OR REPLACE FUNCTION get_notifications_paginated(
  p_user_id UUID,
  p_cursor TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 30,
  p_type TEXT DEFAULT NULL
) RETURNS TABLE(
  id UUID,
  user_id UUID,
  actor_id UUID,
  notification_type TEXT,
  reference_id UUID,
  message TEXT,
  is_read BOOLEAN,
  priority TEXT,
  priority_score NUMERIC,
  created_at TIMESTAMPTZ,
  actor_username TEXT,
  actor_display_name TEXT,
  actor_avatar_url TEXT,
  actor_is_verified BOOLEAN,
  post_content TEXT,
  post_thumbnail TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.user_id,
    n.actor_id,
    n.notification_type::TEXT,
    n.reference_id,
    n.message,
    n.is_read,
    n.priority::TEXT,
    n.priority_score,
    n.created_at,
    p.username AS actor_username,
    p.display_name AS actor_display_name,
    p.avatar_url AS actor_avatar_url,
    p.is_verified AS actor_is_verified,
    -- Post preview data (for like/comment notifications)
    CASE 
      WHEN n.notification_type IN ('like', 'comment', 'mention') AND n.reference_id IS NOT NULL
      THEN (SELECT LEFT(posts.content, 100) FROM posts WHERE posts.id = n.reference_id)
      ELSE NULL
    END AS post_content,
    CASE 
      WHEN n.notification_type IN ('like', 'comment', 'mention') AND n.reference_id IS NOT NULL
      THEN (SELECT m.url FROM media m WHERE m.post_id = n.reference_id ORDER BY m.sort_order LIMIT 1)
      ELSE NULL
    END AS post_thumbnail
  FROM notifications n
  LEFT JOIN profiles p ON p.id = n.actor_id
  WHERE n.user_id = p_user_id
    AND (p_type IS NULL OR n.notification_type = p_type)
    AND (p_cursor IS NULL OR n.created_at < p_cursor)
    AND n.created_at > NOW() - INTERVAL '90 days'
  ORDER BY
    -- Priority-weighted sort: high-priority recent items first
    -- Score = priority_score * freshness_factor
    (COALESCE(n.priority_score, 1.0) * (1.0 / (1.0 + EXTRACT(EPOCH FROM (NOW() - n.created_at)) / 86400.0))) DESC,
    n.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Index for priority-sorted notifications
CREATE INDEX IF NOT EXISTS idx_notifications_priority_score
  ON notifications(user_id, priority_score DESC, created_at DESC);
