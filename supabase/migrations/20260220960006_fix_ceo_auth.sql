-- Fix ceo_steve_b auth credentials: profile exists but auth.users record may
-- be missing or password may be wrong after delete migrations.

-- Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
  v_user_id UUID;
  v_auth_exists BOOLEAN;
BEGIN
  SELECT id INTO v_user_id FROM public.profiles WHERE username = 'ceo_steve_b';
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'ceo_steve_b profile not found';
  END IF;

  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = v_user_id) INTO v_auth_exists;

  IF v_auth_exists THEN
    -- Auth record exists - reset password and ensure email is confirmed
    UPDATE auth.users SET
      encrypted_password = extensions.crypt('Steve123!', extensions.gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      updated_at = NOW()
    WHERE id = v_user_id;
    RAISE NOTICE 'Reset password for ceo_steve_b (%), auth record existed', v_user_id;
  ELSE
    -- Auth record missing - recreate it
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
      created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'steve@vyxhub.com',
      extensions.crypt('Steve123!', extensions.gen_salt('bf')),
      NOW(),
      jsonb_build_object('username', 'ceo_steve_b', 'display_name', 'Steve B.'),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      NOW(), NOW(), '', ''
    );
    -- Add identity
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id, v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', 'steve@vyxhub.com'),
      'email', NOW(), NOW(), NOW()
    );
    RAISE NOTICE 'Recreated auth record for ceo_steve_b (%)', v_user_id;
  END IF;

  -- Ensure admin privileges
  UPDATE public.profiles
  SET system_role = 'admin', is_verified = TRUE, is_creator = TRUE
  WHERE id = v_user_id;
END $$;
