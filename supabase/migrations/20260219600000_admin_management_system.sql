-- ============================================================================
-- ADMIN, SUPPORT & MANAGEMENT SYSTEM
-- System roles, moderation tools, managed creators, post scheduling,
-- CEO/admin message highlighting
-- ============================================================================

-- ============================================================================
-- 1. SYSTEM ROLES
-- ============================================================================
CREATE TYPE system_role AS ENUM ('admin', 'support', 'manager');

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS system_role system_role DEFAULT NULL;

-- Only one admin can set/remove system roles (enforced via RLS + RPC)
CREATE INDEX idx_profiles_system_role ON profiles (system_role) WHERE system_role IS NOT NULL;

-- ============================================================================
-- 2. PROFILE MODERATION FIELDS
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_by UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES profiles(id);

-- Revenue split override (NULL = use default PLATFORM_FEE_PERCENT)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS revenue_split_override NUMERIC(5,2) DEFAULT NULL;
-- Constraint: split override must be between 0 and 100
ALTER TABLE profiles ADD CONSTRAINT chk_revenue_split_range
  CHECK (revenue_split_override IS NULL OR (revenue_split_override >= 0 AND revenue_split_override <= 100));

-- ============================================================================
-- 3. MANAGED CREATORS
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_managed BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS managed_by UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS management_split NUMERIC(5,2) DEFAULT 60.00;
-- When managed, creator keeps management_split% (default 60%), platform keeps 40%

-- Content uploads from managed creators → management team
CREATE TABLE content_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,        -- storage path in 'content-uploads' bucket
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video')),
  file_name TEXT,
  file_size_bytes BIGINT,
  instructions TEXT,             -- optional notes from creator to management
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'rejected')),
  used_in_post UUID REFERENCES posts(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE content_uploads ENABLE ROW LEVEL SECURITY;

-- Creator can view/insert their own uploads
CREATE POLICY "Creators can view own uploads"
  ON content_uploads FOR SELECT
  USING (
    auth.uid() = creator_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'manager'))
  );

CREATE POLICY "Creators can upload content"
  ON content_uploads FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

-- Managers/admins can update status
CREATE POLICY "Management can update uploads"
  ON content_uploads FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'manager'))
  );

CREATE POLICY "Management can delete uploads"
  ON content_uploads FOR DELETE
  USING (
    auth.uid() = creator_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'manager'))
  );

CREATE INDEX idx_content_uploads_creator ON content_uploads (creator_id, status);
CREATE INDEX idx_content_uploads_status ON content_uploads (status, created_at DESC);

-- ============================================================================
-- 4. POST SCHEDULING
-- ============================================================================
CREATE TABLE scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,    -- the profile the post will appear on
  scheduled_by UUID NOT NULL REFERENCES profiles(id),                   -- who created this scheduled post
  content TEXT,
  post_type post_type DEFAULT 'post',
  visibility visibility_type DEFAULT 'public',
  price NUMERIC(10,2) DEFAULT 0,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'published', 'cancelled', 'failed')),
  media_urls JSONB DEFAULT '[]'::jsonb,   -- array of {url, type, is_preview} objects
  published_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;

-- Creators can see their own scheduled posts, schedulers can see what they scheduled
CREATE POLICY "View scheduled posts"
  ON scheduled_posts FOR SELECT
  USING (
    auth.uid() = author_id
    OR auth.uid() = scheduled_by
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'manager'))
  );

-- Creators can schedule their own posts; managers can schedule for managed creators
CREATE POLICY "Create scheduled posts"
  ON scheduled_posts FOR INSERT
  WITH CHECK (
    auth.uid() = scheduled_by
    AND (
      auth.uid() = author_id
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND system_role IN ('admin', 'manager')
      )
    )
  );

CREATE POLICY "Update scheduled posts"
  ON scheduled_posts FOR UPDATE
  USING (
    auth.uid() = scheduled_by
    OR auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'manager'))
  );

CREATE POLICY "Delete scheduled posts"
  ON scheduled_posts FOR DELETE
  USING (
    auth.uid() = scheduled_by
    OR auth.uid() = author_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'manager'))
  );

CREATE INDEX idx_scheduled_posts_author ON scheduled_posts (author_id, status);
CREATE INDEX idx_scheduled_posts_due ON scheduled_posts (scheduled_for, status)
  WHERE status = 'scheduled';

-- ============================================================================
-- 5. MODERATION ACTIONS LOG (immutable audit trail)
-- ============================================================================
CREATE TABLE moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id UUID NOT NULL REFERENCES profiles(id),
  target_user_id UUID REFERENCES profiles(id),
  target_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  target_report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'warn', 'suspend', 'ban', 'unsuspend', 'unban',
    'delete_post', 'hide_post', 'restore_post',
    'verify_profile', 'unverify_profile',
    'resolve_report', 'dismiss_report',
    'override_split', 'assign_manager', 'remove_manager',
    'set_role', 'remove_role'
  )),
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;

-- Only staff can view moderation log
CREATE POLICY "Staff can view moderation log"
  ON moderation_actions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IS NOT NULL)
  );

-- Only staff can create moderation actions
CREATE POLICY "Staff can create moderation actions"
  ON moderation_actions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IS NOT NULL)
  );

CREATE INDEX idx_moderation_actions_target ON moderation_actions (target_user_id, created_at DESC);
CREATE INDEX idx_moderation_actions_moderator ON moderation_actions (moderator_id, created_at DESC);

-- ============================================================================
-- 6. MESSAGE SYSTEM ENHANCEMENTS (CEO/admin highlighting)
-- ============================================================================
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_system_message BOOLEAN DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_system_role system_role;

-- ============================================================================
-- 7. REPORTS: Allow staff to update reports
-- ============================================================================
CREATE POLICY "Staff can view all reports"
  ON reports FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support'))
  );

CREATE POLICY "Staff can update reports"
  ON reports FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support'))
  );

-- ============================================================================
-- 8. POST POLICIES: Allow managers to post on behalf of managed creators
-- ============================================================================
-- Update INSERT policy to allow managers to create posts for managed creators
DROP POLICY IF EXISTS "Users can create posts" ON posts;

CREATE POLICY "Users and managers can create posts"
  ON posts FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    OR (
      -- Manager posting on behalf of a managed creator
      EXISTS (
        SELECT 1 FROM profiles mgr
        WHERE mgr.id = auth.uid()
        AND mgr.system_role IN ('admin', 'manager')
      )
      AND EXISTS (
        SELECT 1 FROM profiles creator
        WHERE creator.id = author_id
        AND creator.is_managed = TRUE
      )
    )
  );

-- Also allow managers to add media for managed creators
DROP POLICY IF EXISTS "Users can add media to their posts" ON media;

CREATE POLICY "Users and managers can add media"
  ON media FOR INSERT
  WITH CHECK (
    auth.uid() = uploader_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND system_role IN ('admin', 'manager')
    )
  );

-- ============================================================================
-- 9. SUBSCRIPTIONS: Allow staff to cancel/update subscriptions
-- ============================================================================
CREATE POLICY "Staff can update subscriptions"
  ON subscriptions FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support'))
  );

-- ============================================================================
-- 10. ADMIN RPC FUNCTIONS
-- ============================================================================

-- Get monthly revenue stats for admin dashboard
CREATE OR REPLACE FUNCTION get_monthly_revenue(p_year INT, p_month INT)
RETURNS TABLE (
  total_revenue NUMERIC,
  total_platform_fees NUMERIC,
  total_creator_payouts NUMERIC,
  transaction_count BIGINT,
  subscription_revenue NUMERIC,
  ppv_revenue NUMERIC,
  tip_revenue NUMERIC
) AS $$
DECLARE
  month_start TIMESTAMPTZ;
  month_end TIMESTAMPTZ;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  month_start := make_timestamptz(p_year, p_month, 1, 0, 0, 0);
  month_end := month_start + INTERVAL '1 month';

  RETURN QUERY
  SELECT
    COALESCE(SUM(t.amount), 0)::NUMERIC AS total_revenue,
    COALESCE(SUM(t.platform_fee), 0)::NUMERIC AS total_platform_fees,
    COALESCE(SUM(t.net_amount), 0)::NUMERIC AS total_creator_payouts,
    COUNT(*)::BIGINT AS transaction_count,
    COALESCE(SUM(CASE WHEN t.transaction_type = 'subscription' THEN t.amount ELSE 0 END), 0)::NUMERIC AS subscription_revenue,
    COALESCE(SUM(CASE WHEN t.transaction_type = 'ppv_post' THEN t.amount ELSE 0 END), 0)::NUMERIC AS ppv_revenue,
    COALESCE(SUM(CASE WHEN t.transaction_type = 'tip' THEN t.amount ELSE 0 END), 0)::NUMERIC AS tip_revenue
  FROM transactions t
  WHERE t.created_at >= month_start
    AND t.created_at < month_end
    AND t.status = 'completed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get platform stats for admin dashboard
CREATE OR REPLACE FUNCTION get_platform_stats()
RETURNS TABLE (
  total_users BIGINT,
  total_creators BIGINT,
  total_managed_creators BIGINT,
  total_posts BIGINT,
  total_active_subscriptions BIGINT,
  verified_creators BIGINT
) AS $$
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM profiles WHERE deleted_at IS NULL)::BIGINT AS total_users,
    (SELECT COUNT(*) FROM profiles WHERE is_creator = TRUE AND deleted_at IS NULL)::BIGINT AS total_creators,
    (SELECT COUNT(*) FROM profiles WHERE is_managed = TRUE AND deleted_at IS NULL)::BIGINT AS total_managed_creators,
    (SELECT COUNT(*) FROM posts)::BIGINT AS total_posts,
    (SELECT COUNT(*) FROM subscriptions WHERE status = 'active' AND expires_at > NOW())::BIGINT AS total_active_subscriptions,
    (SELECT COUNT(*) FROM profiles WHERE is_verified = TRUE AND deleted_at IS NULL)::BIGINT AS verified_creators;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin: set revenue split override for a user
CREATE OR REPLACE FUNCTION admin_set_split(p_target_user_id UUID, p_split NUMERIC)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  IF p_split IS NOT NULL AND (p_split < 0 OR p_split > 100) THEN
    RAISE EXCEPTION 'Split must be between 0 and 100';
  END IF;

  UPDATE profiles SET revenue_split_override = p_split WHERE id = p_target_user_id;

  INSERT INTO moderation_actions (moderator_id, target_user_id, action_type, reason, metadata)
  VALUES (auth.uid(), p_target_user_id, 'override_split', 'Split override', jsonb_build_object('new_split', p_split));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Support: verify/unverify a profile
CREATE OR REPLACE FUNCTION staff_verify_profile(p_target_user_id UUID, p_verify BOOLEAN)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')) THEN
    RAISE EXCEPTION 'Unauthorized: admin or support only';
  END IF;

  UPDATE profiles SET
    is_verified = p_verify,
    verified_at = CASE WHEN p_verify THEN NOW() ELSE NULL END,
    verified_by = CASE WHEN p_verify THEN auth.uid() ELSE NULL END
  WHERE id = p_target_user_id;

  INSERT INTO moderation_actions (moderator_id, target_user_id, action_type, reason)
  VALUES (auth.uid(), p_target_user_id,
    CASE WHEN p_verify THEN 'verify_profile' ELSE 'unverify_profile' END,
    CASE WHEN p_verify THEN 'Profile verified' ELSE 'Verification removed' END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Support: suspend/unsuspend user
CREATE OR REPLACE FUNCTION staff_suspend_user(p_target_user_id UUID, p_suspend BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')) THEN
    RAISE EXCEPTION 'Unauthorized: admin or support only';
  END IF;

  -- Cannot suspend other staff
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_target_user_id AND system_role IS NOT NULL) THEN
    RAISE EXCEPTION 'Cannot suspend staff members';
  END IF;

  UPDATE profiles SET
    is_suspended = p_suspend,
    suspended_at = CASE WHEN p_suspend THEN NOW() ELSE NULL END,
    suspended_by = CASE WHEN p_suspend THEN auth.uid() ELSE NULL END,
    suspension_reason = CASE WHEN p_suspend THEN p_reason ELSE NULL END
  WHERE id = p_target_user_id;

  INSERT INTO moderation_actions (moderator_id, target_user_id, action_type, reason)
  VALUES (auth.uid(), p_target_user_id,
    CASE WHEN p_suspend THEN 'suspend' ELSE 'unsuspend' END,
    COALESCE(p_reason, CASE WHEN p_suspend THEN 'Suspended' ELSE 'Unsuspended' END)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Support: ban/unban user
CREATE OR REPLACE FUNCTION staff_ban_user(p_target_user_id UUID, p_ban BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')) THEN
    RAISE EXCEPTION 'Unauthorized: admin or support only';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_target_user_id AND system_role IS NOT NULL) THEN
    RAISE EXCEPTION 'Cannot ban staff members';
  END IF;

  UPDATE profiles SET
    is_banned = p_ban,
    banned_at = CASE WHEN p_ban THEN NOW() ELSE NULL END,
    banned_by = CASE WHEN p_ban THEN auth.uid() ELSE NULL END,
    is_suspended = FALSE,  -- clear suspension when banning
    suspended_at = NULL,
    suspended_by = NULL,
    suspension_reason = NULL
  WHERE id = p_target_user_id;

  INSERT INTO moderation_actions (moderator_id, target_user_id, action_type, reason)
  VALUES (auth.uid(), p_target_user_id,
    CASE WHEN p_ban THEN 'ban' ELSE 'unban' END,
    COALESCE(p_reason, CASE WHEN p_ban THEN 'Banned' ELSE 'Unbanned' END)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Support: resolve/dismiss report
CREATE OR REPLACE FUNCTION staff_resolve_report(p_report_id UUID, p_status report_status, p_reason TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role IN ('admin', 'support')) THEN
    RAISE EXCEPTION 'Unauthorized: admin or support only';
  END IF;

  IF p_status NOT IN ('reviewed', 'actioned', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE reports SET
    status = p_status,
    reviewed_at = NOW()
  WHERE id = p_report_id;

  INSERT INTO moderation_actions (moderator_id, target_report_id, action_type, reason)
  VALUES (auth.uid(), p_report_id,
    CASE WHEN p_status = 'dismissed' THEN 'dismiss_report' ELSE 'resolve_report' END,
    p_reason
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin: assign/remove manager for a creator
CREATE OR REPLACE FUNCTION admin_set_managed(p_creator_id UUID, p_is_managed BOOLEAN, p_manager_id UUID DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  UPDATE profiles SET
    is_managed = p_is_managed,
    managed_by = CASE WHEN p_is_managed THEN COALESCE(p_manager_id, auth.uid()) ELSE NULL END,
    management_split = CASE WHEN p_is_managed THEN 60.00 ELSE 60.00 END
  WHERE id = p_creator_id;

  INSERT INTO moderation_actions (moderator_id, target_user_id, action_type, reason, metadata)
  VALUES (auth.uid(), p_creator_id,
    CASE WHEN p_is_managed THEN 'assign_manager' ELSE 'remove_manager' END,
    CASE WHEN p_is_managed THEN 'Assigned management' ELSE 'Removed management' END,
    jsonb_build_object('manager_id', p_manager_id, 'split', 60.00)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin: set system role
CREATE OR REPLACE FUNCTION admin_set_role(p_target_user_id UUID, p_role system_role)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  UPDATE profiles SET system_role = p_role WHERE id = p_target_user_id;

  INSERT INTO moderation_actions (moderator_id, target_user_id, action_type, reason, metadata)
  VALUES (auth.uid(), p_target_user_id, 'set_role', 'Role assigned', jsonb_build_object('role', p_role));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin: remove system role
CREATE OR REPLACE FUNCTION admin_remove_role(p_target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  UPDATE profiles SET system_role = NULL WHERE id = p_target_user_id;

  INSERT INTO moderation_actions (moderator_id, target_user_id, action_type, reason)
  VALUES (auth.uid(), p_target_user_id, 'remove_role', 'Role removed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 11. STORAGE BUCKET FOR CONTENT UPLOADS
-- ============================================================================
-- Note: content-uploads bucket should be created via Supabase Dashboard
-- It should be private with RLS matching content_uploads table policies

-- ============================================================================
-- 12. AUTO-SET sender_system_role ON MESSAGE INSERT
-- ============================================================================
CREATE OR REPLACE FUNCTION set_message_system_role()
RETURNS TRIGGER AS $$
DECLARE
  sender_role system_role;
BEGIN
  SELECT p.system_role INTO sender_role
  FROM profiles p WHERE p.id = NEW.sender_id;

  IF sender_role IS NOT NULL THEN
    NEW.sender_system_role := sender_role;
    NEW.is_system_message := TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_set_message_system_role
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION set_message_system_role();

-- ============================================================================
-- 13. PUBLISH SCHEDULED POSTS (RPC — called by cron or client-side timer)
-- ============================================================================
CREATE OR REPLACE FUNCTION publish_scheduled_posts()
RETURNS INT AS $$
DECLARE
  published_count INT := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM scheduled_posts
    WHERE status = 'scheduled'
    AND scheduled_for <= NOW()
    ORDER BY scheduled_for ASC
    LIMIT 50
  LOOP
    BEGIN
      -- Create the actual post
      INSERT INTO posts (author_id, content, post_type, visibility, price)
      VALUES (rec.author_id, rec.content, rec.post_type, rec.visibility, rec.price)
      RETURNING id INTO rec.id;

      -- Mark as published
      UPDATE scheduled_posts SET
        status = 'published',
        published_post_id = rec.id,
        updated_at = NOW()
      WHERE id = rec.id;

      published_count := published_count + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE scheduled_posts SET status = 'failed', updated_at = NOW()
      WHERE id = rec.id;
    END;
  END LOOP;

  RETURN published_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 14. TRANSACTIONS: Allow staff to view all transactions
-- ============================================================================
CREATE POLICY "Staff can view all transactions"
  ON transactions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'admin')
  );
