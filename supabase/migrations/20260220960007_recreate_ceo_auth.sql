-- Create a helper function to diagnose and fix ceo_steve_b auth.
-- This runs as SECURITY DEFINER (superuser-level) to access auth schema.

CREATE OR REPLACE FUNCTION fix_ceo_auth()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_has_password BOOLEAN;
  v_confirmed BOOLEAN;
  v_identity_count INT;
  v_result JSONB;
BEGIN
  -- Get profile ID
  SELECT id INTO v_user_id FROM public.profiles WHERE username = 'ceo_steve_b';
  IF v_user_id IS NULL THEN
    RETURN '{"error": "profile not found"}'::jsonb;
  END IF;

  -- Check auth.users state
  SELECT 
    email,
    encrypted_password IS NOT NULL AND encrypted_password != '',
    email_confirmed_at IS NOT NULL
  INTO v_email, v_has_password, v_confirmed
  FROM auth.users WHERE id = v_user_id;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('error', 'auth.users record not found', 'profile_id', v_user_id);
  END IF;

  -- Count identities
  SELECT count(*) INTO v_identity_count FROM auth.identities WHERE user_id = v_user_id;

  -- Fix: update password, ensure email confirmed, ensure identity exists
  UPDATE auth.users SET
    encrypted_password = crypt('Steve123!', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW(),
    email = 'steve@vyxhub.com'
  WHERE id = v_user_id;

  -- Ensure at least one identity exists
  IF v_identity_count = 0 THEN
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id, v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', 'steve@vyxhub.com', 'email_verified', true),
      'email', NOW(), NOW(), NOW()
    );
    v_identity_count := 1;
  END IF;

  v_result := jsonb_build_object(
    'user_id', v_user_id,
    'email_was', v_email,
    'had_password', v_has_password,
    'was_confirmed', v_confirmed,
    'identities', v_identity_count,
    'status', 'fixed'
  );

  -- Ensure admin role
  UPDATE public.profiles
  SET system_role = 'admin', is_verified = TRUE, is_creator = TRUE
  WHERE id = v_user_id;

  RETURN v_result;
END;
$$;

-- Execute the fix
SELECT fix_ceo_auth();

-- Clean up the helper function
DROP FUNCTION fix_ceo_auth();
