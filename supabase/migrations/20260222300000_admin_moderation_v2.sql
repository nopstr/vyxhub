-- ============================================================================
-- ADMIN/MODERATION V2: Auto-moderation, Bulk Actions, Appeal System, IP Bans
-- ============================================================================

-- ============================================================================
-- 1. EXTEND MODERATION_ACTIONS CHECK CONSTRAINT
-- ============================================================================
-- Drop old constraint and add new action types
ALTER TABLE moderation_actions DROP CONSTRAINT IF EXISTS moderation_actions_action_type_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_action_type_check CHECK (action_type IN (
  'warn', 'suspend', 'ban', 'unsuspend', 'unban',
  'delete_post', 'hide_post', 'restore_post',
  'verify_profile', 'unverify_profile',
  'resolve_report', 'dismiss_report',
  'override_split', 'assign_manager', 'remove_manager',
  'set_role', 'remove_role',
  -- New v2 action types
  'auto_flag', 'auto_hide', 'auto_suspend',
  'bulk_suspend', 'bulk_ban', 'bulk_unsuspend', 'bulk_unban',
  'bulk_resolve_reports', 'bulk_dismiss_reports',
  'approve_appeal', 'deny_appeal',
  'ban_ip', 'unban_ip'
));

-- ============================================================================
-- 2. AUTO-MODERATION RULES TABLE
-- ============================================================================
CREATE TABLE auto_moderation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('keyword', 'regex', 'spam_link', 'duplicate')),
  pattern TEXT NOT NULL,          -- keyword list (comma-separated) or regex pattern
  action TEXT NOT NULL CHECK (action IN ('flag', 'hide', 'suspend_author')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_active BOOLEAN DEFAULT TRUE,
  applies_to TEXT NOT NULL DEFAULT 'posts' CHECK (applies_to IN ('posts', 'comments', 'both')),
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE auto_moderation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view auto-mod rules"
  ON auto_moderation_rules FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')));

CREATE POLICY "Staff can manage auto-mod rules"
  ON auto_moderation_rules FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')));

CREATE POLICY "Staff can update auto-mod rules"
  ON auto_moderation_rules FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')));

CREATE POLICY "Staff can delete auto-mod rules"
  ON auto_moderation_rules FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'admin'));

CREATE INDEX idx_auto_mod_rules_active ON auto_moderation_rules (is_active, rule_type);

-- ============================================================================
-- 3. AUTO-MODERATION LOG TABLE
-- ============================================================================
CREATE TABLE auto_moderation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES auto_moderation_rules(id) ON DELETE SET NULL,
  rule_name TEXT NOT NULL,
  target_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  target_comment_id UUID,
  target_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action_taken TEXT NOT NULL CHECK (action_taken IN ('flag', 'hide', 'suspend_author')),
  matched_pattern TEXT,
  matched_content TEXT,           -- snippet of content that matched
  is_false_positive BOOLEAN DEFAULT FALSE,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE auto_moderation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view auto-mod log"
  ON auto_moderation_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')));

CREATE POLICY "Staff can update auto-mod log"
  ON auto_moderation_log FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')));

CREATE INDEX idx_auto_mod_log_post ON auto_moderation_log (target_post_id) WHERE target_post_id IS NOT NULL;
CREATE INDEX idx_auto_mod_log_user ON auto_moderation_log (target_user_id, created_at DESC);
CREATE INDEX idx_auto_mod_log_rule ON auto_moderation_log (rule_id, created_at DESC);

-- ============================================================================
-- 4. AUTO-MODERATE CONTENT FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_moderate_content()
RETURNS TRIGGER AS $$
DECLARE
  rule RECORD;
  content_text TEXT;
  keywords TEXT[];
  kw TEXT;
  matched BOOLEAN;
BEGIN
  content_text := LOWER(COALESCE(NEW.content, ''));
  
  -- Skip if content is empty
  IF content_text = '' THEN
    RETURN NEW;
  END IF;

  FOR rule IN
    SELECT * FROM auto_moderation_rules
    WHERE is_active = TRUE
      AND (applies_to = 'posts' OR applies_to = 'both')
    ORDER BY
      CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
  LOOP
    matched := FALSE;

    IF rule.rule_type = 'keyword' THEN
      -- Comma-separated keywords, match any
      keywords := string_to_array(LOWER(rule.pattern), ',');
      FOREACH kw IN ARRAY keywords LOOP
        kw := TRIM(kw);
        IF kw != '' AND content_text LIKE '%' || kw || '%' THEN
          matched := TRUE;
          EXIT;
        END IF;
      END LOOP;

    ELSIF rule.rule_type = 'regex' THEN
      -- Regex pattern match
      BEGIN
        IF content_text ~ rule.pattern THEN
          matched := TRUE;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Invalid regex, skip
        matched := FALSE;
      END;

    ELSIF rule.rule_type = 'spam_link' THEN
      -- Check for suspicious link patterns
      keywords := string_to_array(LOWER(rule.pattern), ',');
      FOREACH kw IN ARRAY keywords LOOP
        kw := TRIM(kw);
        IF kw != '' AND content_text LIKE '%' || kw || '%' THEN
          matched := TRUE;
          EXIT;
        END IF;
      END LOOP;

    ELSIF rule.rule_type = 'duplicate' THEN
      -- Check for duplicate content from same author in last hour
      IF EXISTS (
        SELECT 1 FROM posts
        WHERE author_id = NEW.author_id
          AND content = NEW.content
          AND id != NEW.id
          AND created_at > NOW() - INTERVAL '1 hour'
      ) THEN
        matched := TRUE;
      END IF;
    END IF;

    IF matched THEN
      -- Log the auto-moderation action
      INSERT INTO auto_moderation_log (rule_id, rule_name, target_post_id, target_user_id, action_taken, matched_pattern, matched_content)
      VALUES (rule.id, rule.name, NEW.id, NEW.author_id, rule.action, rule.pattern, LEFT(content_text, 200));

      -- Execute the action
      IF rule.action = 'flag' THEN
        -- Create an auto-report
        INSERT INTO reports (reporter_id, reported_post_id, reported_user_id, reason, description, status)
        VALUES (NEW.author_id, NEW.id, NEW.author_id, 'spam', 'Auto-flagged by rule: ' || rule.name, 'pending')
        ON CONFLICT DO NOTHING;

        -- Log moderation action
        INSERT INTO moderation_actions (moderator_id, target_post_id, target_user_id, action_type, reason, metadata)
        VALUES (NEW.author_id, NEW.id, NEW.author_id, 'auto_flag', 'Auto-flagged: ' || rule.name,
          jsonb_build_object('rule_id', rule.id, 'rule_name', rule.name));

      ELSIF rule.action = 'hide' THEN
        -- Hide the post by changing visibility
        NEW.visibility := 'hidden';

        INSERT INTO moderation_actions (moderator_id, target_post_id, target_user_id, action_type, reason, metadata)
        VALUES (NEW.author_id, NEW.id, NEW.author_id, 'auto_hide', 'Auto-hidden: ' || rule.name,
          jsonb_build_object('rule_id', rule.id, 'rule_name', rule.name));

      ELSIF rule.action = 'suspend_author' THEN
        -- Suspend the author (for critical violations)
        UPDATE profiles SET
          is_suspended = TRUE,
          suspended_at = NOW(),
          suspension_reason = 'Auto-suspended: ' || rule.name
        WHERE id = NEW.author_id AND is_suspended = FALSE AND system_role IS NULL;

        NEW.visibility := 'hidden';

        INSERT INTO moderation_actions (moderator_id, target_post_id, target_user_id, action_type, reason, metadata)
        VALUES (NEW.author_id, NEW.id, NEW.author_id, 'auto_suspend', 'Auto-suspended: ' || rule.name,
          jsonb_build_object('rule_id', rule.id, 'rule_name', rule.name));
      END IF;

      -- For critical/high severity, stop after first match
      IF rule.severity IN ('critical', 'high') THEN
        RETURN NEW;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_auto_moderate_post
  BEFORE INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION auto_moderate_content();

-- ============================================================================
-- 5. AUTO-MOD RULES MANAGEMENT RPCs
-- ============================================================================
CREATE OR REPLACE FUNCTION create_auto_mod_rule(
  p_name TEXT,
  p_description TEXT,
  p_rule_type TEXT,
  p_pattern TEXT,
  p_action TEXT,
  p_severity TEXT DEFAULT 'medium',
  p_applies_to TEXT DEFAULT 'posts'
)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')) THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  INSERT INTO auto_moderation_rules (name, description, rule_type, pattern, action, severity, applies_to, created_by)
  VALUES (p_name, p_description, p_rule_type, p_pattern, p_action, p_severity, p_applies_to, auth.uid())
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_auto_mod_rule(
  p_rule_id UUID,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_pattern TEXT DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')) THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  UPDATE auto_moderation_rules SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    pattern = COALESCE(p_pattern, pattern),
    action = COALESCE(p_action, action),
    severity = COALESCE(p_severity, severity),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = NOW()
  WHERE id = p_rule_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION delete_auto_mod_rule(p_rule_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  DELETE FROM auto_moderation_rules WHERE id = p_rule_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. BULK ACTION RPCs
-- ============================================================================
CREATE OR REPLACE FUNCTION staff_bulk_suspend(p_user_ids UUID[], p_suspend BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS INT AS $$
DECLARE
  affected INT := 0;
  uid UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')) THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  FOREACH uid IN ARRAY p_user_ids LOOP
    -- Skip staff members
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = uid AND system_role IS NOT NULL) THEN
      UPDATE profiles SET
        is_suspended = p_suspend,
        suspended_at = CASE WHEN p_suspend THEN NOW() ELSE NULL END,
        suspended_by = CASE WHEN p_suspend THEN auth.uid() ELSE NULL END,
        suspension_reason = CASE WHEN p_suspend THEN p_reason ELSE NULL END
      WHERE id = uid;

      affected := affected + 1;
    END IF;
  END LOOP;

  -- Log bulk action
  INSERT INTO moderation_actions (moderator_id, action_type, reason, metadata)
  VALUES (auth.uid(),
    CASE WHEN p_suspend THEN 'bulk_suspend' ELSE 'bulk_unsuspend' END,
    COALESCE(p_reason, CASE WHEN p_suspend THEN 'Bulk suspension' ELSE 'Bulk unsuspension' END),
    jsonb_build_object('user_ids', p_user_ids, 'affected_count', affected));

  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION staff_bulk_ban(p_user_ids UUID[], p_ban BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS INT AS $$
DECLARE
  affected INT := 0;
  uid UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')) THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  FOREACH uid IN ARRAY p_user_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = uid AND system_role IS NOT NULL) THEN
      UPDATE profiles SET
        is_banned = p_ban,
        banned_at = CASE WHEN p_ban THEN NOW() ELSE NULL END,
        banned_by = CASE WHEN p_ban THEN auth.uid() ELSE NULL END,
        is_suspended = FALSE,
        suspended_at = NULL,
        suspended_by = NULL,
        suspension_reason = NULL
      WHERE id = uid;

      affected := affected + 1;
    END IF;
  END LOOP;

  INSERT INTO moderation_actions (moderator_id, action_type, reason, metadata)
  VALUES (auth.uid(),
    CASE WHEN p_ban THEN 'bulk_ban' ELSE 'bulk_unban' END,
    COALESCE(p_reason, CASE WHEN p_ban THEN 'Bulk ban' ELSE 'Bulk unban' END),
    jsonb_build_object('user_ids', p_user_ids, 'affected_count', affected));

  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION staff_bulk_resolve_reports(p_report_ids UUID[], p_status report_status)
RETURNS INT AS $$
DECLARE
  affected INT := 0;
  rid UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')) THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  IF p_status NOT IN ('reviewed', 'actioned', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  FOREACH rid IN ARRAY p_report_ids LOOP
    UPDATE reports SET
      status = p_status,
      reviewed_at = NOW()
    WHERE id = rid AND status = 'pending';

    IF FOUND THEN
      affected := affected + 1;
    END IF;
  END LOOP;

  INSERT INTO moderation_actions (moderator_id, action_type, reason, metadata)
  VALUES (auth.uid(),
    CASE WHEN p_status = 'dismissed' THEN 'bulk_dismiss_reports' ELSE 'bulk_resolve_reports' END,
    'Bulk ' || p_status || ' reports',
    jsonb_build_object('report_ids', p_report_ids, 'status', p_status, 'affected_count', affected));

  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. APPEALS SYSTEM
-- ============================================================================
CREATE TABLE appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  appeal_type TEXT NOT NULL CHECK (appeal_type IN ('suspension', 'ban', 'post_removal', 'other')),
  reason TEXT NOT NULL,
  evidence_urls TEXT[],           -- optional links to evidence
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'denied')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewer_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE appeals ENABLE ROW LEVEL SECURITY;

-- Users can view their own appeals
CREATE POLICY "Users can view own appeals"
  ON appeals FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create appeals (max 1 pending per type)
CREATE POLICY "Users can create appeals"
  ON appeals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Staff can view all appeals
CREATE POLICY "Staff can view all appeals"
  ON appeals FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')));

-- Staff can update appeals
CREATE POLICY "Staff can update appeals"
  ON appeals FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')));

-- Prevent multiple pending appeals of same type
CREATE UNIQUE INDEX idx_appeals_pending_unique
  ON appeals (user_id, appeal_type)
  WHERE status IN ('pending', 'under_review');

CREATE INDEX idx_appeals_status ON appeals (status, created_at DESC);
CREATE INDEX idx_appeals_user ON appeals (user_id, created_at DESC);

-- Submit appeal RPC (user-facing)
CREATE OR REPLACE FUNCTION submit_appeal(
  p_appeal_type TEXT,
  p_reason TEXT,
  p_evidence_urls TEXT[] DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
  caller_profile RECORD;
BEGIN
  SELECT * INTO caller_profile FROM profiles WHERE id = auth.uid();

  -- Validate: user must actually be suspended/banned to appeal
  IF p_appeal_type = 'suspension' AND NOT caller_profile.is_suspended THEN
    RAISE EXCEPTION 'You are not currently suspended';
  END IF;

  IF p_appeal_type = 'ban' AND NOT caller_profile.is_banned THEN
    RAISE EXCEPTION 'You are not currently banned';
  END IF;

  -- Check for existing pending appeal
  IF EXISTS (
    SELECT 1 FROM appeals
    WHERE user_id = auth.uid()
      AND appeal_type = p_appeal_type
      AND status IN ('pending', 'under_review')
  ) THEN
    RAISE EXCEPTION 'You already have a pending appeal of this type';
  END IF;

  INSERT INTO appeals (user_id, appeal_type, reason, evidence_urls)
  VALUES (auth.uid(), p_appeal_type, p_reason, p_evidence_urls)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Resolve appeal RPC (staff-facing)
CREATE OR REPLACE FUNCTION staff_resolve_appeal(
  p_appeal_id UUID,
  p_status TEXT,
  p_reviewer_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  appeal_record RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')) THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  IF p_status NOT IN ('under_review', 'approved', 'denied') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO appeal_record FROM appeals WHERE id = p_appeal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appeal not found';
  END IF;

  -- Update the appeal
  UPDATE appeals SET
    status = p_status,
    reviewed_by = auth.uid(),
    reviewer_notes = COALESCE(p_reviewer_notes, reviewer_notes),
    resolved_at = CASE WHEN p_status IN ('approved', 'denied') THEN NOW() ELSE NULL END,
    updated_at = NOW()
  WHERE id = p_appeal_id;

  -- If approved, reverse the moderation action
  IF p_status = 'approved' THEN
    IF appeal_record.appeal_type = 'suspension' THEN
      UPDATE profiles SET
        is_suspended = FALSE,
        suspended_at = NULL,
        suspended_by = NULL,
        suspension_reason = NULL
      WHERE id = appeal_record.user_id;
    ELSIF appeal_record.appeal_type = 'ban' THEN
      UPDATE profiles SET
        is_banned = FALSE,
        banned_at = NULL,
        banned_by = NULL
      WHERE id = appeal_record.user_id;
    END IF;

    INSERT INTO moderation_actions (moderator_id, target_user_id, action_type, reason, metadata)
    VALUES (auth.uid(), appeal_record.user_id, 'approve_appeal', p_reviewer_notes,
      jsonb_build_object('appeal_id', p_appeal_id, 'appeal_type', appeal_record.appeal_type));
  ELSE
    IF p_status = 'denied' THEN
      INSERT INTO moderation_actions (moderator_id, target_user_id, action_type, reason, metadata)
      VALUES (auth.uid(), appeal_record.user_id, 'deny_appeal', p_reviewer_notes,
        jsonb_build_object('appeal_id', p_appeal_id, 'appeal_type', appeal_record.appeal_type));
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. IP-BASED BANS
-- ============================================================================
CREATE TABLE banned_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL,
  reason TEXT,
  banned_by UUID NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMPTZ,         -- NULL = permanent
  is_active BOOLEAN DEFAULT TRUE,
  associated_user_id UUID REFERENCES profiles(id), -- optional: link to banned user
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE banned_ips ENABLE ROW LEVEL SECURITY;

-- Staff can view banned IPs
CREATE POLICY "Staff can view banned IPs"
  ON banned_ips FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')));

-- Staff can manage banned IPs
CREATE POLICY "Staff can manage banned IPs"
  ON banned_ips FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')));

CREATE POLICY "Staff can update banned IPs"
  ON banned_ips FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')));

CREATE POLICY "Staff can delete banned IPs"
  ON banned_ips FOR DELETE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'admin'));

CREATE UNIQUE INDEX idx_banned_ips_active ON banned_ips (ip_address) WHERE is_active = TRUE;
CREATE INDEX idx_banned_ips_user ON banned_ips (associated_user_id) WHERE associated_user_id IS NOT NULL;

-- Ban IP RPC
CREATE OR REPLACE FUNCTION staff_ban_ip(
  p_ip_address INET,
  p_reason TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_associated_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')) THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  -- Deactivate existing ban on this IP if any
  UPDATE banned_ips SET is_active = FALSE WHERE ip_address = p_ip_address AND is_active = TRUE;

  INSERT INTO banned_ips (ip_address, reason, banned_by, expires_at, associated_user_id)
  VALUES (p_ip_address, p_reason, auth.uid(), p_expires_at, p_associated_user_id)
  RETURNING id INTO new_id;

  INSERT INTO moderation_actions (moderator_id, action_type, reason, metadata)
  VALUES (auth.uid(), 'ban_ip', COALESCE(p_reason, 'IP banned'),
    jsonb_build_object('ip_address', p_ip_address::TEXT, 'expires_at', p_expires_at, 'associated_user_id', p_associated_user_id));

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Unban IP RPC
CREATE OR REPLACE FUNCTION staff_unban_ip(p_ban_id UUID)
RETURNS VOID AS $$
DECLARE
  ban_record RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')) THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  SELECT * INTO ban_record FROM banned_ips WHERE id = p_ban_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IP ban not found';
  END IF;

  UPDATE banned_ips SET is_active = FALSE WHERE id = p_ban_id;

  INSERT INTO moderation_actions (moderator_id, action_type, reason, metadata)
  VALUES (auth.uid(), 'unban_ip', 'IP unbanned',
    jsonb_build_object('ip_address', ban_record.ip_address::TEXT, 'ban_id', p_ban_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if IP is banned (can be called from auth hooks or Edge Functions)
CREATE OR REPLACE FUNCTION check_ip_banned(p_ip_address INET)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM banned_ips
    WHERE ip_address = p_ip_address
      AND is_active = TRUE
      AND (expires_at IS NULL OR expires_at > NOW())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's last known IP from login_history (helper for staff)
CREATE OR REPLACE FUNCTION get_user_ips(p_user_id UUID)
RETURNS TABLE (ip_address TEXT, last_seen TIMESTAMPTZ, login_count BIGINT) AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')) THEN
    RAISE EXCEPTION 'Unauthorized: staff only';
  END IF;

  RETURN QUERY
  SELECT
    lh.ip_address::TEXT,
    MAX(lh.created_at) AS last_seen,
    COUNT(*)::BIGINT AS login_count
  FROM login_history lh
  WHERE lh.user_id = p_user_id
    AND lh.ip_address IS NOT NULL
  GROUP BY lh.ip_address
  ORDER BY last_seen DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
