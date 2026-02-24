-- ═══════════════════════════════════════════════════════════════════════
-- PARTNER SYSTEM V2 + TEAM LEAD FEATURES
-- ═══════════════════════════════════════════════════════════════════════
-- 3 tiers: verified (permanent), red (losable), gold (losable)
-- Staff helper functions, updated RLS policies, team online tracking,
-- dedicated partner support assignments, updated RPCs.
-- ═══════════════════════════════════════════════════════════════════════


-- ─── 1. STAFF HELPER FUNCTIONS ──────────────────────────────────────
-- Reusable helpers for RLS policies so future role changes only need
-- to update these functions, not every policy.

CREATE OR REPLACE FUNCTION is_support_team()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND system_role IN ('admin', 'support', 'support_lead')
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_management_team()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND system_role IN ('admin', 'manager', 'management_lead')
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_any_staff()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND system_role IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_team_lead()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND system_role IN ('admin', 'support_lead', 'management_lead')
  );
END;
$$;


-- ─── 2. EXPAND PARTNER TIER ────────────────────────────────────────
-- Ensure partner columns exist (idempotent), then update constraint.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_tier TEXT DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_since TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_override BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS partner_settings JSONB DEFAULT '{}';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_partner_tier_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_partner_tier_check
  CHECK (partner_tier IN ('verified', 'red', 'gold'));

-- Permanent verified timestamp (never lost once earned)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified_partner_since TIMESTAMPTZ DEFAULT NULL;

-- Backfill: existing partners should have verified_partner_since set
UPDATE profiles SET verified_partner_since = partner_since
WHERE partner_tier IS NOT NULL AND verified_partner_since IS NULL;


-- ─── 3. ADD REVENUE TRACKING TO SNAPSHOTS ───────────────────────────

-- Ensure the snapshots table exists (idempotent)
CREATE TABLE IF NOT EXISTS monthly_subscriber_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL,
  subscriber_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (creator_id, month_year)
);
CREATE INDEX IF NOT EXISTS idx_mss_creator_month ON monthly_subscriber_snapshots (creator_id, month_year DESC);

ALTER TABLE monthly_subscriber_snapshots
  ADD COLUMN IF NOT EXISTS monthly_revenue NUMERIC(12,2) DEFAULT 0;


-- ─── 4. STAFF ONLINE STATUS ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_online_status (
  staff_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_online BOOLEAN DEFAULT TRUE,
  current_page TEXT DEFAULT NULL
);

ALTER TABLE staff_online_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leads and admins can view online status"
  ON staff_online_status FOR SELECT
  USING (is_team_lead());

CREATE POLICY "Staff can upsert own status"
  ON staff_online_status FOR INSERT
  WITH CHECK (auth.uid() = staff_id);

CREATE POLICY "Staff can update own status"
  ON staff_online_status FOR UPDATE
  USING (auth.uid() = staff_id);


-- ─── 5. DEDICATED PARTNER SUPPORT ──────────────────────────────────
-- Partner Golds get a dedicated support agent assigned by a lead.

CREATE TABLE IF NOT EXISTS dedicated_partner_support (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  support_agent_id UUID NOT NULL REFERENCES profiles(id),
  assigned_by UUID NOT NULL REFERENCES profiles(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  UNIQUE(partner_id)
);

ALTER TABLE dedicated_partner_support ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Support team can view assignments"
  ON dedicated_partner_support FOR SELECT
  USING (
    auth.uid() = partner_id
    OR auth.uid() = support_agent_id
    OR is_support_team()
  );

CREATE POLICY "Leads can insert assignments"
  ON dedicated_partner_support FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND system_role IN ('admin', 'support_lead')
    )
  );

CREATE POLICY "Leads can update assignments"
  ON dedicated_partner_support FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND system_role IN ('admin', 'support_lead')
    )
  );

CREATE POLICY "Leads can delete assignments"
  ON dedicated_partner_support FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
      AND system_role IN ('admin', 'support_lead')
    )
  );

CREATE INDEX IF NOT EXISTS idx_dps_agent ON dedicated_partner_support (support_agent_id);


-- ─── 6. UPDATE EXISTING RLS POLICIES FOR NEW ROLES ─────────────────
-- Reports: support_lead gets access
DROP POLICY IF EXISTS "Staff can view all reports" ON reports;
CREATE POLICY "Staff can view all reports"
  ON reports FOR SELECT
  USING (is_support_team());

DROP POLICY IF EXISTS "Staff can update reports" ON reports;
CREATE POLICY "Staff can update reports"
  ON reports FOR UPDATE
  USING (is_support_team());

-- Content uploads: management_lead gets access
DROP POLICY IF EXISTS "Creators can view own uploads" ON content_uploads;
CREATE POLICY "Creators can view own uploads"
  ON content_uploads FOR SELECT
  USING (auth.uid() = creator_id OR is_management_team());

DROP POLICY IF EXISTS "Management can update uploads" ON content_uploads;
CREATE POLICY "Management can update uploads"
  ON content_uploads FOR UPDATE
  USING (is_management_team());

DROP POLICY IF EXISTS "Management can delete uploads" ON content_uploads;
CREATE POLICY "Management can delete uploads"
  ON content_uploads FOR DELETE
  USING (auth.uid() = creator_id OR is_management_team());

-- Scheduled posts: management_lead gets access
DROP POLICY IF EXISTS "View scheduled posts" ON scheduled_posts;
CREATE POLICY "View scheduled posts"
  ON scheduled_posts FOR SELECT
  USING (
    auth.uid() = author_id
    OR auth.uid() = scheduled_by
    OR is_management_team()
  );

DROP POLICY IF EXISTS "Create scheduled posts" ON scheduled_posts;
CREATE POLICY "Create scheduled posts"
  ON scheduled_posts FOR INSERT
  WITH CHECK (
    auth.uid() = scheduled_by
    AND (auth.uid() = author_id OR is_management_team())
  );

DROP POLICY IF EXISTS "Update scheduled posts" ON scheduled_posts;
CREATE POLICY "Update scheduled posts"
  ON scheduled_posts FOR UPDATE
  USING (
    auth.uid() = scheduled_by
    OR auth.uid() = author_id
    OR is_management_team()
  );

DROP POLICY IF EXISTS "Delete scheduled posts" ON scheduled_posts;
CREATE POLICY "Delete scheduled posts"
  ON scheduled_posts FOR DELETE
  USING (
    auth.uid() = scheduled_by
    OR auth.uid() = author_id
    OR is_management_team()
  );

-- Subscriptions: support_lead gets access
DROP POLICY IF EXISTS "Staff can update subscriptions" ON subscriptions;
CREATE POLICY "Staff can update subscriptions"
  ON subscriptions FOR UPDATE
  USING (is_support_team());

-- Posts: management_lead can create for managed creators
DROP POLICY IF EXISTS "Users and managers can create posts" ON posts;
CREATE POLICY "Users and managers can create posts"
  ON posts FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    OR (
      is_management_team()
      AND EXISTS (
        SELECT 1 FROM profiles creator
        WHERE creator.id = author_id AND creator.is_managed = TRUE
      )
    )
  );

-- Media: management_lead can add
DROP POLICY IF EXISTS "Users and managers can add media" ON media;
CREATE POLICY "Users and managers can add media"
  ON media FOR INSERT
  WITH CHECK (auth.uid() = uploader_id OR is_management_team());


-- ─── 7. STAFF HEARTBEAT RPC ────────────────────────────────────────

CREATE OR REPLACE FUNCTION staff_heartbeat(p_page TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IS NOT NULL) THEN
    RETURN;
  END IF;

  INSERT INTO staff_online_status (staff_id, last_heartbeat, is_online, current_page)
  VALUES (auth.uid(), NOW(), TRUE, p_page)
  ON CONFLICT (staff_id)
  DO UPDATE SET last_heartbeat = NOW(), is_online = TRUE, current_page = COALESCE(p_page, staff_online_status.current_page);
END;
$$;


-- ─── 8. GET TEAM STATUS RPC ────────────────────────────────────────
-- Returns online/offline team members for leads.

CREATE OR REPLACE FUNCTION get_team_status(p_team TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_team_roles TEXT[];
  v_result JSONB;
BEGIN
  SELECT system_role::text INTO v_role FROM profiles WHERE id = auth.uid();

  -- Only leads and admin can view
  IF v_role NOT IN ('admin', 'support_lead', 'management_lead') THEN
    RAISE EXCEPTION 'Unauthorized: team leads only';
  END IF;

  -- Determine which roles to query
  IF p_team = 'support' THEN
    v_team_roles := ARRAY['support', 'support_lead'];
  ELSIF p_team = 'management' THEN
    v_team_roles := ARRAY['manager', 'management_lead'];
  ELSE
    v_team_roles := ARRAY['support', 'support_lead', 'manager', 'management_lead'];
  END IF;

  -- Admin always sees all
  IF v_role = 'admin' THEN
    v_team_roles := ARRAY['support', 'support_lead', 'manager', 'management_lead', 'admin'];
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'system_role', p.system_role::text,
      'is_online', COALESCE(s.is_online AND s.last_heartbeat > NOW() - interval '5 minutes', FALSE),
      'last_heartbeat', s.last_heartbeat,
      'current_page', s.current_page
    ) ORDER BY COALESCE(s.last_heartbeat, '1970-01-01'::timestamptz) DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM profiles p
  LEFT JOIN staff_online_status s ON s.staff_id = p.id
  WHERE p.system_role::text = ANY(v_team_roles);

  RETURN v_result;
END;
$$;


-- ─── 9. GET TEAM ACTIVITY LOG RPC ──────────────────────────────────
-- Returns moderation actions filtered by team role.

CREATE OR REPLACE FUNCTION get_team_activity_log(p_team TEXT, p_limit INT DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_team_roles TEXT[];
  v_result JSONB;
BEGIN
  SELECT system_role::text INTO v_role FROM profiles WHERE id = auth.uid();

  IF v_role NOT IN ('admin', 'support_lead', 'management_lead') THEN
    RAISE EXCEPTION 'Unauthorized: team leads only';
  END IF;

  IF p_team = 'support' THEN
    v_team_roles := ARRAY['support', 'support_lead'];
  ELSIF p_team = 'management' THEN
    v_team_roles := ARRAY['manager', 'management_lead'];
  ELSE
    v_team_roles := ARRAY['support', 'support_lead', 'manager', 'management_lead', 'admin'];
  END IF;

  IF v_role = 'admin' THEN
    v_team_roles := ARRAY['support', 'support_lead', 'manager', 'management_lead', 'admin'];
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ma.id,
      'action_type', ma.action_type,
      'reason', ma.reason,
      'metadata', ma.metadata,
      'created_at', ma.created_at,
      'moderator', jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'system_role', p.system_role::text
      ),
      'target_user', CASE WHEN tu.id IS NOT NULL THEN
        jsonb_build_object('id', tu.id, 'username', tu.username, 'display_name', tu.display_name)
      ELSE NULL END
    ) ORDER BY ma.created_at DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM moderation_actions ma
  JOIN profiles p ON p.id = ma.moderator_id
  LEFT JOIN profiles tu ON tu.id = ma.target_user_id
  WHERE p.system_role::text = ANY(v_team_roles)
  LIMIT p_limit;

  RETURN v_result;
END;
$$;


-- ─── 10. DEDICATED SUPPORT RPCs ────────────────────────────────────

CREATE OR REPLACE FUNCTION assign_dedicated_support(
  p_partner_id UUID,
  p_agent_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_partner_tier TEXT;
  v_agent_role TEXT;
BEGIN
  SELECT system_role::text INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'support_lead') THEN
    RAISE EXCEPTION 'Unauthorized: support lead or admin only';
  END IF;

  -- Verify partner is gold tier
  SELECT partner_tier INTO v_partner_tier FROM profiles WHERE id = p_partner_id;
  IF v_partner_tier != 'gold' THEN
    RAISE EXCEPTION 'Only gold partners can have dedicated support';
  END IF;

  -- Verify agent is support team
  SELECT system_role::text INTO v_agent_role FROM profiles WHERE id = p_agent_id;
  IF v_agent_role NOT IN ('support', 'support_lead') THEN
    RAISE EXCEPTION 'Agent must be a support team member';
  END IF;

  INSERT INTO dedicated_partner_support (partner_id, support_agent_id, assigned_by, notes)
  VALUES (p_partner_id, p_agent_id, auth.uid(), p_notes)
  ON CONFLICT (partner_id)
  DO UPDATE SET
    support_agent_id = p_agent_id,
    assigned_by = auth.uid(),
    assigned_at = NOW(),
    notes = COALESCE(p_notes, dedicated_partner_support.notes);

  -- Log the action
  INSERT INTO moderation_actions (moderator_id, target_user_id, action_type, reason, metadata)
  VALUES (auth.uid(), p_partner_id, 'assign_manager',
    'Dedicated support assigned',
    jsonb_build_object('agent_id', p_agent_id, 'type', 'dedicated_support'));
END;
$$;

CREATE OR REPLACE FUNCTION get_dedicated_support_assignments()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_result JSONB;
BEGIN
  SELECT system_role::text INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role NOT IN ('admin', 'support', 'support_lead') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', dps.id,
      'assigned_at', dps.assigned_at,
      'notes', dps.notes,
      'partner', jsonb_build_object(
        'id', partner.id,
        'username', partner.username,
        'display_name', partner.display_name,
        'avatar_url', partner.avatar_url,
        'subscriber_count', partner.subscriber_count
      ),
      'agent', jsonb_build_object(
        'id', agent.id,
        'username', agent.username,
        'display_name', agent.display_name,
        'avatar_url', agent.avatar_url
      ),
      'assigned_by_user', jsonb_build_object(
        'id', assigner.id,
        'username', assigner.username,
        'display_name', assigner.display_name
      )
    ) ORDER BY dps.assigned_at DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM dedicated_partner_support dps
  JOIN profiles partner ON partner.id = dps.partner_id
  JOIN profiles agent ON agent.id = dps.support_agent_id
  JOIN profiles assigner ON assigner.id = dps.assigned_by
  WHERE
    v_role IN ('admin', 'support_lead')
    OR dps.support_agent_id = auth.uid();

  RETURN v_result;
END;
$$;


-- ─── 11. UPDATED PARTNER RPCs ──────────────────────────────────────

-- Updated snapshot function with revenue tracking
CREATE OR REPLACE FUNCTION take_monthly_subscriber_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month TEXT;
  v_month_start TIMESTAMPTZ;
  v_month_end TIMESTAMPTZ;
BEGIN
  v_month := to_char(NOW(), 'YYYY-MM');
  v_month_start := date_trunc('month', NOW());
  v_month_end := v_month_start + interval '1 month';

  INSERT INTO monthly_subscriber_snapshots (creator_id, month_year, subscriber_count, monthly_revenue)
  SELECT
    p.id,
    v_month,
    COALESCE(
      (SELECT COUNT(*) FROM subscriptions s
       WHERE s.creator_id = p.id
         AND s.status = 'active'
         AND s.expires_at > NOW()),
      0
    ),
    COALESCE(
      (SELECT SUM(t.amount) FROM transactions t
       WHERE t.creator_id = p.id
         AND t.status = 'completed'
         AND t.created_at >= v_month_start
         AND t.created_at < v_month_end),
      0
    )
  FROM profiles p
  WHERE p.is_creator = TRUE
  ON CONFLICT (creator_id, month_year)
  DO UPDATE SET
    subscriber_count = EXCLUDED.subscriber_count,
    monthly_revenue = EXCLUDED.monthly_revenue,
    snapshot_at = NOW();
END;
$$;


-- Updated evaluation for 3-tier system
-- Verified: 100 subs × 3 months (permanent once earned)
-- Red: 500 subs + $5,000 revenue/month × 3 months (losable)
-- Gold: 1,000 subs + $15,000 revenue/month × 3 months (losable)

CREATE OR REPLACE FUNCTION evaluate_partner_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  v_months TEXT[];
  v_count INTEGER;
  v_min_subs INTEGER;
  v_min_revenue NUMERIC;
  v_new_tier TEXT;
BEGIN
  v_months := ARRAY[
    to_char(NOW() - interval '1 month', 'YYYY-MM'),
    to_char(NOW() - interval '2 months', 'YYYY-MM'),
    to_char(NOW() - interval '3 months', 'YYYY-MM')
  ];

  FOR r IN
    SELECT id, partner_tier, partner_override, verified_partner_since
    FROM profiles
    WHERE is_creator = TRUE
  LOOP
    -- Skip staff-overridden profiles
    IF r.partner_override THEN
      CONTINUE;
    END IF;

    -- Check last 3 months of snapshots
    SELECT COUNT(*), COALESCE(MIN(subscriber_count), 0), COALESCE(MIN(monthly_revenue), 0)
    INTO v_count, v_min_subs, v_min_revenue
    FROM monthly_subscriber_snapshots
    WHERE creator_id = r.id
      AND month_year = ANY(v_months);

    -- Need all 3 months of data
    IF v_count < 3 THEN
      -- Preserve verified (permanent) but clear higher tiers
      IF r.verified_partner_since IS NOT NULL THEN
        IF r.partner_tier IS DISTINCT FROM 'verified' THEN
          UPDATE profiles SET partner_tier = 'verified' WHERE id = r.id;
        END IF;
      ELSIF r.partner_tier IS NOT NULL THEN
        UPDATE profiles SET partner_tier = NULL, partner_since = NULL WHERE id = r.id;
      END IF;
      CONTINUE;
    END IF;

    -- Determine tier based on minimums across all 3 months
    IF v_min_subs >= 1000 AND v_min_revenue >= 15000 THEN
      v_new_tier := 'gold';
    ELSIF v_min_subs >= 500 AND v_min_revenue >= 5000 THEN
      v_new_tier := 'red';
    ELSIF v_min_subs >= 100 THEN
      v_new_tier := 'verified';
    ELSE
      -- Verified is permanent
      v_new_tier := CASE WHEN r.verified_partner_since IS NOT NULL THEN 'verified' ELSE NULL END;
    END IF;

    -- Update if changed
    IF v_new_tier IS DISTINCT FROM r.partner_tier THEN
      UPDATE profiles
      SET partner_tier = v_new_tier,
          partner_since = CASE
            WHEN v_new_tier IS NOT NULL AND partner_since IS NULL THEN NOW()
            WHEN v_new_tier IS NULL THEN NULL
            ELSE partner_since
          END,
          -- Set verified_partner_since when first reaching any tier
          verified_partner_since = CASE
            WHEN v_new_tier IN ('verified', 'red', 'gold') AND verified_partner_since IS NULL THEN NOW()
            ELSE verified_partner_since
          END
      WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;


-- Updated admin override for 3 tiers
CREATE OR REPLACE FUNCTION admin_set_partner_tier(
  p_target_user_id UUID,
  p_tier TEXT,
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
  SELECT system_role::text INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'manager', 'management_lead') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_tier IS NOT NULL AND p_tier NOT IN ('verified', 'red', 'gold') THEN
    RAISE EXCEPTION 'Invalid tier: must be verified, red, gold, or null';
  END IF;

  UPDATE profiles
  SET partner_tier = p_tier,
      partner_override = p_override,
      partner_since = CASE
        WHEN p_tier IS NOT NULL AND partner_since IS NULL THEN NOW()
        WHEN p_tier IS NULL THEN NULL
        ELSE partner_since
      END,
      verified_partner_since = CASE
        WHEN p_tier IN ('verified', 'red', 'gold') AND verified_partner_since IS NULL THEN NOW()
        ELSE verified_partner_since
      END
  WHERE id = p_target_user_id;
END;
$$;


-- Updated get_partner_status with 3-tier data + revenue
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
  v_current_revenue NUMERIC;
  v_progress JSONB;
BEGIN
  SELECT partner_tier, partner_since, partner_override, verified_partner_since,
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

  -- Current month revenue
  SELECT COALESCE(SUM(amount), 0) INTO v_current_revenue
  FROM transactions
  WHERE creator_id = p_user_id
    AND status = 'completed'
    AND created_at >= date_trunc('month', NOW());

  -- Last 6 months of snapshots
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'month', month_year,
      'count', subscriber_count,
      'revenue', monthly_revenue
    ) ORDER BY month_year DESC
  ), '[]'::jsonb)
  INTO v_snapshots
  FROM monthly_subscriber_snapshots
  WHERE creator_id = p_user_id
  ORDER BY month_year DESC
  LIMIT 6;

  -- Progress towards each tier
  v_progress := jsonb_build_object(
    'current_subscribers', v_active_subs,
    'current_revenue', v_current_revenue,
    'verified_threshold_subs', 100,
    'red_threshold_subs', 500,
    'red_threshold_revenue', 5000,
    'gold_threshold_subs', 1000,
    'gold_threshold_revenue', 15000,
    'verified_pct', LEAST(ROUND((v_active_subs::numeric / 100) * 100), 100),
    'red_subs_pct', LEAST(ROUND((v_active_subs::numeric / 500) * 100), 100),
    'red_rev_pct', LEAST(ROUND((v_current_revenue / 5000) * 100), 100),
    'gold_subs_pct', LEAST(ROUND((v_active_subs::numeric / 1000) * 100), 100),
    'gold_rev_pct', LEAST(ROUND((v_current_revenue / 15000) * 100), 100)
  );

  RETURN jsonb_build_object(
    'partner_tier', v_profile.partner_tier,
    'partner_since', v_profile.partner_since,
    'partner_override', v_profile.partner_override,
    'verified_partner_since', v_profile.verified_partner_since,
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


-- Updated partner settings (calls now unlock at red, livestream at gold)
CREATE OR REPLACE FUNCTION update_partner_settings(
  p_livestream_enabled BOOLEAN DEFAULT NULL,
  p_livestream_price DECIMAL DEFAULT NULL,
  p_livestream_notify BOOLEAN DEFAULT NULL,
  p_calls_enabled BOOLEAN DEFAULT NULL,
  p_call_price DECIMAL DEFAULT NULL,
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

  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'Not a partner';
  END IF;

  -- Red+ can configure calls (1-on-1 calls unlock at red)
  IF v_tier IN ('red', 'gold') AND p_calls_enabled IS NOT NULL THEN
    UPDATE profiles SET calls_enabled = p_calls_enabled WHERE id = auth.uid();
  END IF;
  IF p_call_price IS NOT NULL THEN
    UPDATE profiles SET call_price_per_minute = p_call_price WHERE id = auth.uid();
  END IF;
  IF p_call_availability IS NOT NULL THEN
    IF p_call_availability NOT IN ('online', 'busy', 'offline') THEN
      RAISE EXCEPTION 'Invalid availability status';
    END IF;
    UPDATE profiles SET call_availability = p_call_availability WHERE id = auth.uid();
  END IF;

  -- Gold can configure livestreaming
  IF v_tier = 'gold' AND p_livestream_enabled IS NOT NULL THEN
    UPDATE profiles SET livestream_enabled = p_livestream_enabled WHERE id = auth.uid();
  END IF;
  IF p_livestream_price IS NOT NULL THEN
    UPDATE profiles SET livestream_price = p_livestream_price WHERE id = auth.uid();
  END IF;
  IF p_livestream_notify IS NOT NULL THEN
    UPDATE profiles SET livestream_notify_followers = p_livestream_notify WHERE id = auth.uid();
  END IF;
END;
$$;
