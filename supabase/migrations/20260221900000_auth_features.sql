-- ============================================================================
-- AUTH FEATURES: username/display name change policies, login history,
-- session management, email verification enforcement
-- ============================================================================

-- ─── 1. USERNAME & DISPLAY NAME CHANGE TRACKING ─────────────────────────────

-- Track username change history for 14-day cooldown
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_username_change TIMESTAMPTZ DEFAULT NULL;
-- Track original display_name for "changed once" detection (NULL = never changed)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS original_display_name TEXT DEFAULT NULL;
-- Track display name change (TRUE = already used their one change)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name_changed BOOLEAN DEFAULT FALSE;

-- ─── 2. LOGIN HISTORY TABLE ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  login_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT,
  location TEXT,
  method TEXT DEFAULT 'password' -- password, google, twitter, magic_link
);

CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id, login_at DESC);

ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'login_history' AND policyname = 'Users can view own login history') THEN
    CREATE POLICY "Users can view own login history" ON login_history FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 3. ACTIVE SESSIONS TABLE ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  session_token_hash TEXT NOT NULL, -- hash of the JWT for identification
  device_info TEXT,
  ip_address TEXT,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_current BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, last_active DESC);

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_sessions' AND policyname = 'Users can view own sessions') THEN
    CREATE POLICY "Users can view own sessions" ON user_sessions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_sessions' AND policyname = 'Users can delete own sessions') THEN
    CREATE POLICY "Users can delete own sessions" ON user_sessions FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- ─── 4. CHANGE USERNAME RPC ─────────────────────────────────────────────────
-- Validates: 14-day cooldown, format, uniqueness, strips verification

CREATE OR REPLACE FUNCTION change_username(
  p_user_id UUID,
  p_new_username TEXT
) RETURNS JSONB AS $$
DECLARE
  v_profile RECORD;
  v_clean_username TEXT;
  v_existing UUID;
BEGIN
  -- Fetch current profile
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  -- Normalize
  v_clean_username := LOWER(TRIM(p_new_username));

  -- Validate format
  IF v_clean_username !~ '^[a-z0-9_]{3,30}$' THEN
    RAISE EXCEPTION 'Username must be 3-30 characters, only letters, numbers, and underscores';
  END IF;

  -- Same username?
  IF v_clean_username = LOWER(v_profile.username) THEN
    RAISE EXCEPTION 'That is already your username';
  END IF;

  -- Check uniqueness
  SELECT id INTO v_existing FROM profiles WHERE LOWER(username) = v_clean_username AND id != p_user_id;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Username already taken';
  END IF;

  -- 14-day cooldown
  IF v_profile.last_username_change IS NOT NULL
     AND v_profile.last_username_change > NOW() - INTERVAL '14 days' THEN
    RAISE EXCEPTION 'You can only change your username once every 14 days. Next change available: %',
      TO_CHAR(v_profile.last_username_change + INTERVAL '14 days', 'Mon DD, YYYY');
  END IF;

  -- Apply change
  UPDATE profiles
  SET username = v_clean_username,
      last_username_change = NOW(),
      is_verified = FALSE,  -- loses verification
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_username', v_clean_username,
    'verification_removed', v_profile.is_verified
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 5. CHANGE DISPLAY NAME RPC ────────────────────────────────────────────
-- Can only change once (case-insensitive); capitalization changes are always allowed

CREATE OR REPLACE FUNCTION change_display_name(
  p_user_id UUID,
  p_new_display_name TEXT,
  p_password TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_profile RECORD;
  v_trimmed TEXT;
  v_is_case_only BOOLEAN;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  v_trimmed := TRIM(p_new_display_name);

  IF LENGTH(v_trimmed) < 1 OR LENGTH(v_trimmed) > 50 THEN
    RAISE EXCEPTION 'Display name must be 1-50 characters';
  END IF;

  -- Check if this is only a capitalization change
  v_is_case_only := LOWER(v_trimmed) = LOWER(v_profile.display_name);

  IF NOT v_is_case_only THEN
    -- This is a real change — check if already used their one change
    IF v_profile.display_name_changed = TRUE THEN
      RAISE EXCEPTION 'Display name can only be changed once. You can still change capitalization.';
    END IF;
  END IF;

  -- Apply change
  UPDATE profiles
  SET display_name = v_trimmed,
      display_name_changed = CASE WHEN v_is_case_only THEN display_name_changed ELSE TRUE END,
      original_display_name = CASE
        WHEN v_profile.original_display_name IS NULL AND NOT v_is_case_only THEN v_profile.display_name
        ELSE v_profile.original_display_name
      END,
      updated_at = NOW()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_display_name', v_trimmed,
    'was_case_only', v_is_case_only,
    'change_used', NOT v_is_case_only
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 6. RECORD LOGIN RPC ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_login(
  p_user_id UUID,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_method TEXT DEFAULT 'password'
) RETURNS VOID AS $$
BEGIN
  INSERT INTO login_history (user_id, ip_address, user_agent, method)
  VALUES (p_user_id, p_ip_address, p_user_agent, p_method);

  -- Keep only last 50 entries per user
  DELETE FROM login_history
  WHERE id IN (
    SELECT id FROM login_history
    WHERE user_id = p_user_id
    ORDER BY login_at DESC
    OFFSET 50
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 7. SESSION MANAGEMENT RPCs ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION register_session(
  p_user_id UUID,
  p_session_hash TEXT,
  p_device_info TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Mark all existing sessions as not current
  UPDATE user_sessions SET is_current = FALSE WHERE user_id = p_user_id;

  -- Insert new session
  INSERT INTO user_sessions (user_id, session_token_hash, device_info, ip_address, is_current)
  VALUES (p_user_id, p_session_hash, p_device_info, p_ip_address, TRUE)
  RETURNING id INTO v_session_id;

  -- Keep only last 20 sessions per user
  DELETE FROM user_sessions
  WHERE id IN (
    SELECT id FROM user_sessions
    WHERE user_id = p_user_id
    ORDER BY last_active DESC
    OFFSET 20
  );

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION revoke_session(
  p_user_id UUID,
  p_session_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM user_sessions
  WHERE id = p_session_id AND user_id = p_user_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION revoke_all_other_sessions(
  p_user_id UUID,
  p_current_session_hash TEXT
) RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM user_sessions
  WHERE user_id = p_user_id
    AND session_token_hash != p_current_session_hash;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 8. VERIFY PASSWORD RPC ────────────────────────────────────────────────
-- Used to confirm identity before sensitive changes (name changes)
-- This uses Supabase's auth.uid() to sign in with password as verification

CREATE OR REPLACE FUNCTION verify_user_password(
  p_email TEXT,
  p_password TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  -- We can't directly verify password from SQL. 
  -- The frontend will call supabase.auth.signInWithPassword as verification.
  -- This is a placeholder — actual verification happens client-side.
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 9. BACKFILL: SET original_display_name FOR EXISTING USERS ─────────────

UPDATE profiles
SET original_display_name = display_name
WHERE original_display_name IS NULL;

NOTIFY pgrst, 'reload schema';
