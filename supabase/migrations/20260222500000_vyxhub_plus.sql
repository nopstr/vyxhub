-- ============================================================================
-- VYXHUB+ PREMIUM SUBSCRIPTION SYSTEM
-- ============================================================================
-- Two tiers:
--   • User tier ($4.99/mo): No ads, badge, free DM unlock, priority support
--   • Creator tier ($9.99/mo): All user perks + algorithm boost, reduced fee (25%), discovery priority, analytics
-- ============================================================================

-- ─── 1. ADD PLUS COLUMNS TO PROFILES ────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_plus BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plus_tier TEXT CHECK (plus_tier IS NULL OR plus_tier IN ('user', 'creator'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plus_expires_at TIMESTAMPTZ;

-- ─── 2. PLATFORM SUBSCRIPTIONS TABLE ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('user', 'creator')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  price_paid DECIMAL(10,2) NOT NULL,
  payment_method TEXT DEFAULT 'crypto',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_subs_user ON platform_subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_platform_subs_expires ON platform_subscriptions(expires_at) WHERE status = 'active';

-- ─── 3. AFFILIATE ADS TABLE ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliate_ads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  link_url TEXT NOT NULL,
  placement TEXT NOT NULL DEFAULT 'both' CHECK (placement IN ('feed', 'sidebar', 'both')),
  is_active BOOLEAN DEFAULT TRUE,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_ads_active ON affiliate_ads(is_active, placement)
  WHERE is_active = TRUE;

-- ─── 4. RLS POLICIES ────────────────────────────────────────────────────────

ALTER TABLE platform_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_ads ENABLE ROW LEVEL SECURITY;

-- Platform subscriptions: users can see their own
CREATE POLICY "Users can view own platform subscriptions"
  ON platform_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Platform subscriptions: service role inserts (via RPCs)
CREATE POLICY "Service can manage platform subscriptions"
  ON platform_subscriptions FOR ALL
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'admin'
  ));

-- Affiliate ads: anyone can read active ads
CREATE POLICY "Anyone can view active affiliate ads"
  ON affiliate_ads FOR SELECT
  USING (is_active = TRUE AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at > NOW()));

-- Affiliate ads: only admins can manage
CREATE POLICY "Admins can manage affiliate ads"
  ON affiliate_ads FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'admin'));

-- ─── 5. SUBSCRIBE TO PLUS ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION subscribe_to_plus(
  p_user_id UUID,
  p_tier TEXT,
  p_price DECIMAL DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'crypto'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_price DECIMAL(10,2);
  v_sub_id UUID;
  v_expires TIMESTAMPTZ;
BEGIN
  -- Validate tier
  IF p_tier NOT IN ('user', 'creator') THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Invalid tier');
  END IF;

  -- Creator tier requires is_creator
  IF p_tier = 'creator' THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND is_creator = TRUE) THEN
      RETURN jsonb_build_object('success', FALSE, 'error', 'Must be a creator to subscribe to creator tier');
    END IF;
  END IF;

  -- Set price
  v_price := COALESCE(p_price,
    CASE p_tier WHEN 'user' THEN 4.99 WHEN 'creator' THEN 9.99 END
  );

  -- Determine expiry (extend if already active)
  SELECT GREATEST(plus_expires_at, NOW()) INTO v_expires
  FROM profiles WHERE id = p_user_id;
  v_expires := COALESCE(v_expires, NOW()) + INTERVAL '30 days';

  -- Cancel any existing active subscription
  UPDATE platform_subscriptions
  SET status = 'expired', updated_at = NOW()
  WHERE user_id = p_user_id AND status = 'active';

  -- Create new subscription
  INSERT INTO platform_subscriptions (user_id, tier, price_paid, payment_method, expires_at)
  VALUES (p_user_id, p_tier, v_price, p_payment_method, v_expires)
  RETURNING id INTO v_sub_id;

  -- Update profile
  UPDATE profiles
  SET is_plus = TRUE, plus_tier = p_tier, plus_expires_at = v_expires, updated_at = NOW()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'subscription_id', v_sub_id,
    'tier', p_tier,
    'expires_at', v_expires
  );
END;
$$;

-- ─── 6. CANCEL PLUS SUBSCRIPTION ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cancel_plus_subscription(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE platform_subscriptions
  SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
  WHERE user_id = p_user_id AND status = 'active';

  -- Don't remove Plus immediately — let it expire naturally
  -- Just mark as cancelled so it won't auto-renew

  RETURN jsonb_build_object('success', TRUE, 'message', 'Subscription cancelled. Plus benefits remain until expiry.');
END;
$$;

-- ─── 7. EXPIRE STALE PLUS SUBSCRIPTIONS (CRON JOB) ──────────────────────────

CREATE OR REPLACE FUNCTION expire_stale_plus_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Expire subscription records
  UPDATE platform_subscriptions
  SET status = 'expired', updated_at = NOW()
  WHERE status IN ('active', 'cancelled')
    AND expires_at < NOW();

  -- Remove Plus status from expired users
  WITH expired_users AS (
    UPDATE profiles
    SET is_plus = FALSE, plus_tier = NULL, plus_expires_at = NULL, updated_at = NOW()
    WHERE is_plus = TRUE
      AND plus_expires_at < NOW()
      AND NOT EXISTS (
        SELECT 1 FROM platform_subscriptions ps
        WHERE ps.user_id = profiles.id AND ps.status = 'active' AND ps.expires_at > NOW()
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM expired_users;

  RETURN v_count;
END;
$$;

-- ─── 8. HELPER: check if user has active Plus ────────────────────────────────

CREATE OR REPLACE FUNCTION is_plus_active(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id AND is_plus = TRUE AND plus_expires_at > NOW()
  );
END;
$$;

-- ─── 9. GET AFFILIATE ADS ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_affiliate_ads(
  p_placement TEXT DEFAULT 'feed',
  p_limit INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  placement TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.title, a.description, a.image_url, a.link_url, a.placement
  FROM affiliate_ads a
  WHERE a.is_active = TRUE
    AND (a.placement = p_placement OR a.placement = 'both')
    AND (a.starts_at IS NULL OR a.starts_at <= NOW())
    AND (a.ends_at IS NULL OR a.ends_at > NOW())
  ORDER BY random()
  LIMIT p_limit;
END;
$$;

-- ─── 10. RECORD AFFILIATE CLICK ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_affiliate_click(p_ad_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE affiliate_ads SET clicks = clicks + 1, updated_at = NOW() WHERE id = p_ad_id;
END;
$$;

-- ─── 11. RECORD AFFILIATE IMPRESSION ────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_affiliate_impressions(p_ad_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE affiliate_ads SET impressions = impressions + 1, updated_at = NOW()
  WHERE id = ANY(p_ad_ids);
END;
$$;

-- ─── 12. UPDATE FEE RATE: VyxHub+ creators get 25% fee instead of 30% ──────

CREATE OR REPLACE FUNCTION get_creator_fee_rate(p_creator_id UUID)
RETURNS NUMERIC(5,4) AS $$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT revenue_split_override, is_managed, management_split, is_plus, plus_tier, plus_expires_at
  INTO v_profile
  FROM profiles
  WHERE id = p_creator_id;

  -- 1. Admin override takes absolute priority
  IF v_profile.revenue_split_override IS NOT NULL THEN
    RETURN v_profile.revenue_split_override / 100.0;
  END IF;

  -- 2. Managed creators get management_split fee (default 40%)
  IF v_profile.is_managed = TRUE THEN
    RETURN (100.0 - COALESCE(v_profile.management_split, 60.0)) / 100.0;
  END IF;

  -- 3. VyxHub+ creator tier: reduced 25% fee
  IF v_profile.is_plus = TRUE AND v_profile.plus_tier = 'creator' AND v_profile.plus_expires_at > NOW() THEN
    RETURN 0.2500;
  END IF;

  -- 4. Default: 30% platform fee (creator keeps 70%)
  RETURN 0.3000;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ─── 13. UPDATE DM UNLOCK: VyxHub+ users skip payment ──────────────────────

CREATE OR REPLACE FUNCTION pay_message_unlock(
  p_sender_id UUID,
  p_receiver_id UUID,
  p_conversation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_price DECIMAL(10,2);
  v_fee_rate NUMERIC(5,4);
  v_fee DECIMAL(10,2);
  v_net DECIMAL(10,2);
  v_tx_id UUID;
  v_sender_is_plus BOOLEAN;
BEGIN
  SELECT COALESCE(message_price, 0) INTO v_price
  FROM profiles WHERE id = p_receiver_id;

  IF v_price <= 0 THEN
    RETURN jsonb_build_object('success', TRUE, 'amount', 0);
  END IF;

  -- VyxHub+ users get free DM unlock
  SELECT (is_plus = TRUE AND plus_expires_at > NOW()) INTO v_sender_is_plus
  FROM profiles WHERE id = p_sender_id;

  IF v_sender_is_plus THEN
    RETURN jsonb_build_object('success', TRUE, 'amount', 0, 'plus_bypass', TRUE);
  END IF;

  -- Use per-creator fee rate
  v_fee_rate := get_creator_fee_rate(p_receiver_id);
  v_fee := ROUND(v_price * v_fee_rate, 2);
  v_net := v_price - v_fee;

  INSERT INTO transactions (from_user_id, to_user_id, transaction_type, amount, platform_fee, net_amount, reference_id, status)
  VALUES (p_sender_id, p_receiver_id, 'message_unlock', v_price, v_fee, v_net, p_conversation_id, 'completed')
  RETURNING id INTO v_tx_id;

  -- Credit wallet
  PERFORM credit_wallet(p_receiver_id, v_tx_id, 'message_unlock', v_price, p_sender_id);

  RETURN jsonb_build_object('success', TRUE, 'amount', v_price);
END;
$$;

-- ─── 14. UPDATE FEED ALGORITHM: VyxHub+ creator boost ───────────────────────

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
  -- EXPERIMENT DISPATCH
  -- ========================================================================
  IF p_user_id IS NOT NULL THEN
    SELECT ea.experiment_id, ea.bucket INTO v_experiment_id, v_bucket
    FROM experiment_assignments ea
    JOIN experiments e ON e.id = ea.experiment_id
    WHERE ea.user_id = p_user_id AND e.status = 'active'
    ORDER BY ea.assigned_at DESC
    LIMIT 1;

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

  -- ========================================================================
  -- MAIN QUERY
  -- ========================================================================
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
      -- VyxHub+ creator boost flag
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
    -- JOIN author profile for VyxHub+ check
    LEFT JOIN profiles author_p ON author_p.id = p.author_id
    WHERE
      (p.visibility = 'public' OR (
        p.visibility = 'subscribers_only' AND p_user_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM subscriptions s
          WHERE s.subscriber_id = p_user_id AND s.creator_id = p.author_id
            AND s.status = 'active' AND s.expires_at > NOW()
        )
      ))
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
          -- ML PATH with random jitter
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
          -- Progressive seen demotion
          * (1.0 / (1.0 + c.seen_count * 0.3))
          -- VyxHub+ creator boost: 35% more reach
          * CASE WHEN c.author_is_plus THEN 1.35 ELSE 1.0 END
          -- Random jitter ±15%
          * (0.85 + random() * 0.30)

        ELSE
          -- HEURISTIC PATH with random jitter
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
            -- Progressive seen demotion
            * (1.0 / (1.0 + c.seen_count * 0.3))
            * CASE WHEN c.media_count > 0 THEN 1.2 ELSE 1.0 END
            * (1.0 + LEAST(GREATEST(c.topic_score, 0.0) * 0.3, 1.5))
            -- VyxHub+ creator boost: 35% more reach
            * CASE WHEN c.author_is_plus THEN 1.35 ELSE 1.0 END
          )
          -- Random jitter ±15%
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
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ─── 15. UPDATE EXPLORE ALGORITHM: VyxHub+ creator boost ────────────────────

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
        -- Personalization boost (lighter than feed)
        * CASE
            WHEN p_user_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM user_affinities ua
              WHERE ua.user_id = p_user_id AND ua.creator_id = p.author_id AND ua.affinity_score > 3
            ) THEN 1.3
            ELSE 1.0
          END
        -- VyxHub+ creator discovery boost: 30% priority in trending
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
  LEFT JOIN velocity v ON v.post_id = p.id
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

-- ─── 16. UPDATE CRYPTO PAYMENT PROCESSOR: handle plus_subscription ──────────

CREATE OR REPLACE FUNCTION process_confirmed_crypto_payment(
  p_crypto_payment_id UUID,
  p_provider_payment_id TEXT DEFAULT NULL,
  p_provider_data JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cp crypto_payments%ROWTYPE;
  v_creator_id UUID;
  v_post_id UUID;
  v_conversation_id UUID;
  v_message_id UUID;
  v_plus_tier TEXT;
BEGIN
  SELECT * INTO cp FROM crypto_payments
  WHERE id = p_crypto_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  IF cp.is_processed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already processed');
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', cp.user_id::text,
    'role', 'authenticated'
  )::text, true);

  v_creator_id := (cp.payment_metadata->>'creator_id')::UUID;
  v_post_id := NULLIF(cp.payment_metadata->>'post_id', '')::UUID;

  CASE cp.payment_type
    WHEN 'subscription' THEN
      PERFORM process_subscription(
        p_subscriber_id := cp.user_id,
        p_creator_id := v_creator_id,
        p_price := cp.usd_amount,
        p_referrer_id := NULLIF(cp.payment_metadata->>'referrer_id', '')::UUID
      );

    WHEN 'tip' THEN
      PERFORM send_tip(
        p_from_user_id := cp.user_id,
        p_to_user_id := v_creator_id,
        p_amount := cp.usd_amount,
        p_post_id := v_post_id,
        p_message := cp.payment_metadata->>'message'
      );

    WHEN 'ppv_post' THEN
      PERFORM purchase_ppv_post(
        p_buyer_id := cp.user_id,
        p_post_id := v_post_id
      );

    WHEN 'message_unlock' THEN
      v_conversation_id := (cp.payment_metadata->>'conversation_id')::UUID;
      PERFORM pay_message_unlock(
        p_sender_id := cp.user_id,
        p_receiver_id := v_creator_id,
        p_conversation_id := v_conversation_id
      );

    WHEN 'payment_request' THEN
      v_message_id := (cp.payment_metadata->>'message_id')::UUID;
      PERFORM pay_message_request(
        p_payer_id := cp.user_id,
        p_message_id := v_message_id
      );

    WHEN 'plus_subscription' THEN
      v_plus_tier := COALESCE(cp.payment_metadata->>'tier', 'user');
      PERFORM subscribe_to_plus(
        p_user_id := cp.user_id,
        p_tier := v_plus_tier,
        p_price := cp.usd_amount,
        p_payment_method := 'crypto'
      );

    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Unknown payment type: ' || cp.payment_type);
  END CASE;

  UPDATE crypto_payments SET
    payment_status = 'finished',
    is_processed = TRUE,
    confirmed_at = COALESCE(cp.confirmed_at, NOW()),
    processed_at = NOW(),
    provider_payment_id = COALESCE(p_provider_payment_id, cp.provider_payment_id),
    provider_data = cp.provider_data || p_provider_data,
    updated_at = NOW()
  WHERE id = p_crypto_payment_id;

  RETURN jsonb_build_object('success', true, 'payment_type', cp.payment_type);

EXCEPTION WHEN OTHERS THEN
  UPDATE crypto_payments SET
    payment_status = 'failed',
    provider_data = cp.provider_data || jsonb_build_object('processing_error', SQLERRM),
    updated_at = NOW()
  WHERE id = p_crypto_payment_id;

  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ─── 17. ADMIN: GET PLUS STATS ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_plus_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_total_active INTEGER;
  v_user_tier INTEGER;
  v_creator_tier INTEGER;
  v_monthly_revenue DECIMAL;
BEGIN
  SELECT COUNT(*) INTO v_total_active
  FROM profiles WHERE is_plus = TRUE AND plus_expires_at > NOW();

  SELECT COUNT(*) INTO v_user_tier
  FROM profiles WHERE is_plus = TRUE AND plus_tier = 'user' AND plus_expires_at > NOW();

  SELECT COUNT(*) INTO v_creator_tier
  FROM profiles WHERE is_plus = TRUE AND plus_tier = 'creator' AND plus_expires_at > NOW();

  SELECT COALESCE(SUM(price_paid), 0) INTO v_monthly_revenue
  FROM platform_subscriptions
  WHERE status IN ('active', 'cancelled')
    AND starts_at > NOW() - INTERVAL '30 days';

  RETURN jsonb_build_object(
    'total_active', v_total_active,
    'user_tier', v_user_tier,
    'creator_tier', v_creator_tier,
    'monthly_revenue', v_monthly_revenue
  );
END;
$$;

-- ─── DONE ────────────────────────────────────────────────────────────────────
