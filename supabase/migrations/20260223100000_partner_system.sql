-- ═══════════════════════════════════════════════════════════════════════
-- HEATLY PARTNER BADGE SYSTEM
-- Blue Partner  = 500+ active subscribers for 3 consecutive months → Livestreaming
-- Gold Partner  = 1000+ active subscribers for 3 consecutive months → 1-on-1 Calls
-- Staff can override partner_tier to 'blue', 'gold', or 'both'
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Add partner columns to profiles ──────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_tier TEXT DEFAULT NULL
  CHECK (partner_tier IN ('blue', 'gold', 'both'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_since TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_override BOOLEAN DEFAULT FALSE;

-- Livestreaming settings (only available to blue/gold/both partners)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS livestream_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS livestream_price DECIMAL(10,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS livestream_notify_followers BOOLEAN DEFAULT TRUE;

-- 1-on-1 call settings (only available to gold/both partners)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calls_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS call_price_per_minute DECIMAL(10,2) DEFAULT 1.00;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS call_availability TEXT DEFAULT 'offline'
  CHECK (call_availability IN ('online', 'busy', 'offline'));

CREATE INDEX IF NOT EXISTS idx_profiles_partner_tier ON profiles (partner_tier) WHERE partner_tier IS NOT NULL;

-- ─── 2. Monthly subscriber snapshot table ────────────────────────────
-- Records each creator's active subscriber count at the end of each month.
-- Used to determine 3-month streak for partner qualification.

CREATE TABLE IF NOT EXISTS monthly_subscriber_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL, -- '2026-02' format
  subscriber_count INTEGER NOT NULL DEFAULT 0,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(creator_id, month_year)
);

CREATE INDEX IF NOT EXISTS idx_mss_creator_month ON monthly_subscriber_snapshots (creator_id, month_year DESC);

-- ─── 3. Take monthly snapshot ────────────────────────────────────────
-- Called by a monthly cron job (pg_cron or external) to snapshot counts.

CREATE OR REPLACE FUNCTION take_monthly_subscriber_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month TEXT;
BEGIN
  v_month := to_char(NOW(), 'YYYY-MM');

  INSERT INTO monthly_subscriber_snapshots (creator_id, month_year, subscriber_count)
  SELECT
    p.id,
    v_month,
    COALESCE(
      (SELECT COUNT(*) FROM subscriptions s
       WHERE s.creator_id = p.id
         AND s.status = 'active'
         AND s.expires_at > NOW()),
      0
    )
  FROM profiles p
  WHERE p.is_creator = TRUE
  ON CONFLICT (creator_id, month_year)
  DO UPDATE SET subscriber_count = EXCLUDED.subscriber_count, snapshot_at = NOW();
END;
$$;

-- ─── 4. Evaluate partner status for all creators ─────────────────────
-- Checks the last 3 months of snapshots. If a creator has ≥500 subs
-- for all 3 months → blue. If ≥1000 for all 3 → gold.
-- Does NOT touch partner_override = true (staff overrides are sticky).

CREATE OR REPLACE FUNCTION evaluate_partner_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  v_months TEXT[];
  v_min_subs INTEGER;
  v_count INTEGER;
  v_new_tier TEXT;
BEGIN
  -- Build array of the last 3 month keys (not including current month)
  v_months := ARRAY[
    to_char(NOW() - interval '1 month', 'YYYY-MM'),
    to_char(NOW() - interval '2 months', 'YYYY-MM'),
    to_char(NOW() - interval '3 months', 'YYYY-MM')
  ];

  FOR r IN
    SELECT id, partner_tier, partner_override
    FROM profiles
    WHERE is_creator = TRUE
  LOOP
    -- Skip staff-overridden profiles
    IF r.partner_override THEN
      CONTINUE;
    END IF;

    -- Check how many of the last 3 months have snapshots
    SELECT COUNT(*), COALESCE(MIN(subscriber_count), 0)
    INTO v_count, v_min_subs
    FROM monthly_subscriber_snapshots
    WHERE creator_id = r.id
      AND month_year = ANY(v_months);

    -- Need all 3 months of data
    IF v_count < 3 THEN
      -- Not enough history; remove partner status if they had it
      IF r.partner_tier IS NOT NULL THEN
        UPDATE profiles SET partner_tier = NULL, partner_since = NULL WHERE id = r.id;
      END IF;
      CONTINUE;
    END IF;

    -- Determine tier by minimum subscriber count across the 3 months
    IF v_min_subs >= 1000 THEN
      v_new_tier := 'gold';
    ELSIF v_min_subs >= 500 THEN
      v_new_tier := 'blue';
    ELSE
      v_new_tier := NULL;
    END IF;

    -- Update only if changed
    IF v_new_tier IS DISTINCT FROM r.partner_tier THEN
      UPDATE profiles
      SET partner_tier = v_new_tier,
          partner_since = CASE
            WHEN v_new_tier IS NOT NULL AND r.partner_tier IS NULL THEN NOW()
            WHEN v_new_tier IS NULL THEN NULL
            ELSE partner_since
          END
      WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;

-- ─── 5. Admin: Set partner override ─────────────────────────────────
-- Allows staff to manually set any partner tier (blue, gold, both, null).

CREATE OR REPLACE FUNCTION admin_set_partner_tier(
  p_target_user_id UUID,
  p_tier TEXT,        -- 'blue', 'gold', 'both', or null
  p_override BOOLEAN DEFAULT TRUE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT system_role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Validate tier
  IF p_tier IS NOT NULL AND p_tier NOT IN ('blue', 'gold', 'both') THEN
    RAISE EXCEPTION 'Invalid tier: must be blue, gold, both, or null';
  END IF;

  UPDATE profiles
  SET partner_tier = p_tier,
      partner_override = p_override,
      partner_since = CASE
        WHEN p_tier IS NOT NULL AND partner_since IS NULL THEN NOW()
        WHEN p_tier IS NULL THEN NULL
        ELSE partner_since
      END
  WHERE id = p_target_user_id;
END;
$$;

-- ─── 6. Get partner status for a creator (public-ish) ────────────────

CREATE OR REPLACE FUNCTION get_partner_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
  v_snapshots JSONB;
  v_active_subs INTEGER;
  v_months_text TEXT[];
  v_progress JSONB;
BEGIN
  SELECT partner_tier, partner_since, partner_override,
         subscriber_count, is_creator,
         livestream_enabled, livestream_price, livestream_notify_followers,
         calls_enabled, call_price_per_minute, call_availability
  INTO v_profile
  FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  -- Current active subscriber count
  SELECT COUNT(*) INTO v_active_subs
  FROM subscriptions
  WHERE creator_id = p_user_id AND status = 'active' AND expires_at > NOW();

  -- Last 6 months of snapshots for the progress chart
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('month', month_year, 'count', subscriber_count)
    ORDER BY month_year DESC
  ), '[]'::jsonb)
  INTO v_snapshots
  FROM monthly_subscriber_snapshots
  WHERE creator_id = p_user_id
  ORDER BY month_year DESC
  LIMIT 6;

  -- Progress towards each tier
  v_progress := jsonb_build_object(
    'current_subscribers', v_active_subs,
    'blue_threshold', 500,
    'gold_threshold', 1000,
    'blue_pct', LEAST(ROUND((v_active_subs::numeric / 500) * 100), 100),
    'gold_pct', LEAST(ROUND((v_active_subs::numeric / 1000) * 100), 100)
  );

  RETURN jsonb_build_object(
    'partner_tier', v_profile.partner_tier,
    'partner_since', v_profile.partner_since,
    'partner_override', v_profile.partner_override,
    'is_creator', v_profile.is_creator,
    'progress', v_progress,
    'snapshots', v_snapshots,
    'settings', jsonb_build_object(
      'livestream_enabled', v_profile.livestream_enabled,
      'livestream_price', v_profile.livestream_price,
      'livestream_notify_followers', v_profile.livestream_notify_followers,
      'calls_enabled', v_profile.calls_enabled,
      'call_price_per_minute', v_profile.call_price_per_minute,
      'call_availability', v_profile.call_availability
    )
  );
END;
$$;

-- ─── 7. Update partner settings ─────────────────────────────────────
-- Creators can toggle their livestream/call settings.

CREATE OR REPLACE FUNCTION update_partner_settings(
  p_livestream_enabled BOOLEAN DEFAULT NULL,
  p_livestream_price DECIMAL DEFAULT NULL,
  p_livestream_notify_followers BOOLEAN DEFAULT NULL,
  p_calls_enabled BOOLEAN DEFAULT NULL,
  p_call_price_per_minute DECIMAL DEFAULT NULL,
  p_call_availability TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier TEXT;
BEGIN
  SELECT partner_tier INTO v_tier FROM profiles WHERE id = auth.uid();

  -- Only partners can update partner settings
  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'Not a partner';
  END IF;

  -- Blue/both can configure livestreaming
  IF v_tier IN ('blue', 'gold', 'both') AND p_livestream_enabled IS NOT NULL THEN
    UPDATE profiles SET livestream_enabled = p_livestream_enabled WHERE id = auth.uid();
  END IF;
  IF p_livestream_price IS NOT NULL THEN
    UPDATE profiles SET livestream_price = p_livestream_price WHERE id = auth.uid();
  END IF;
  IF p_livestream_notify_followers IS NOT NULL THEN
    UPDATE profiles SET livestream_notify_followers = p_livestream_notify_followers WHERE id = auth.uid();
  END IF;

  -- Gold/both can configure calls
  IF v_tier IN ('gold', 'both') AND p_calls_enabled IS NOT NULL THEN
    UPDATE profiles SET calls_enabled = p_calls_enabled WHERE id = auth.uid();
  END IF;
  IF p_call_price_per_minute IS NOT NULL THEN
    UPDATE profiles SET call_price_per_minute = p_call_price_per_minute WHERE id = auth.uid();
  END IF;
  IF p_call_availability IS NOT NULL THEN
    IF p_call_availability NOT IN ('online', 'busy', 'offline') THEN
      RAISE EXCEPTION 'Invalid availability status';
    END IF;
    UPDATE profiles SET call_availability = p_call_availability WHERE id = auth.uid();
  END IF;
END;
$$;

-- ─── 8. Schedule monthly evaluation ─────────────────────────────────
-- If pg_cron is available, schedule both ops for the 1st of every month.
-- If not, an external cron must call these functions.
--
-- SELECT cron.schedule('monthly-sub-snapshot', '0 0 1 * *', 'SELECT take_monthly_subscriber_snapshot()');
-- SELECT cron.schedule('monthly-partner-eval',  '0 1 1 * *', 'SELECT evaluate_partner_status()');
