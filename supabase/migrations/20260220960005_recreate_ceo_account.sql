-- Re-create the ceo_steve_b account that was accidentally deleted by earlier migrations.
-- The profile may still exist but the auth.users record may be gone.

DO $$
DECLARE
  v_user_id UUID;
  v_auth_exists BOOLEAN;
BEGIN
  -- Check if ceo_steve_b profile exists
  SELECT id INTO v_user_id FROM public.profiles WHERE username = 'ceo_steve_b';
  
  IF v_user_id IS NOT NULL THEN
    -- Check if auth.users record exists for this profile
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = v_user_id) INTO v_auth_exists;
    
    IF v_auth_exists THEN
      -- Auth record exists, just update password and ensure it's confirmed
      UPDATE auth.users SET
        encrypted_password = crypt('Steve123!', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        updated_at = NOW()
      WHERE id = v_user_id;
      RAISE NOTICE 'Updated auth credentials for existing ceo_steve_b (%)', v_user_id;
    ELSE
      -- Auth record is missing, recreate it for the existing profile ID
      INSERT INTO auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
        created_at, updated_at, confirmation_token, recovery_token
      ) VALUES (
        v_user_id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated',
        'steve@vyxhub.com',
        crypt('Steve123!', gen_salt('bf')),
        NOW(),
        jsonb_build_object('username', 'ceo_steve_b', 'display_name', 'Steve B.'),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        NOW(), NOW(), '', ''
      );
      -- Add identity record
      INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), v_user_id, v_user_id::text,
        jsonb_build_object('sub', v_user_id::text, 'email', 'steve@vyxhub.com'),
        'email', NOW(), NOW(), NOW()
      );
      RAISE NOTICE 'Recreated auth record for existing ceo_steve_b profile (%)', v_user_id;
    END IF;

    -- Ensure admin privileges
    UPDATE public.profiles
    SET system_role = 'admin', is_verified = TRUE, is_creator = TRUE
    WHERE id = v_user_id;
    
  ELSE
    -- No profile exists at all, create everything fresh
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_user_meta_data, raw_app_meta_data,
      created_at, updated_at, confirmation_token, recovery_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'steve@vyxhub.com',
      crypt('Steve123!', gen_salt('bf')),
      NOW(),
      jsonb_build_object('username', 'ceo_steve_b', 'display_name', 'Steve B.'),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      NOW(), NOW(), '', ''
    );

    -- Trigger creates profile; update it
    UPDATE public.profiles
    SET system_role = 'admin', is_verified = TRUE, is_creator = TRUE,
        bio = 'CEO @ VyxHub', display_name = 'Steve B.'
    WHERE id = v_user_id;

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id, v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', 'steve@vyxhub.com'),
      'email', NOW(), NOW(), NOW()
    );
    RAISE NOTICE 'Created fresh ceo_steve_b account (%)', v_user_id;
  END IF;
END $$;
