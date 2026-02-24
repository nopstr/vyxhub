-- =============================================================================
-- FIX: check_post_rate_limit used NEW.user_id instead of NEW.author_id
-- FIX: CEO auth identity may be missing after database wipe
-- =============================================================================

-- 1. Fix the rate limit trigger function (posts table uses author_id, not user_id)
CREATE OR REPLACE FUNCTION check_post_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  recent_posts_count INT;
  daily_posts_count INT;
BEGIN
  -- Check for posts in the last 10 seconds (spam prevention)
  SELECT COUNT(*) INTO recent_posts_count
  FROM posts
  WHERE author_id = NEW.author_id
    AND created_at > NOW() - INTERVAL '10 seconds';

  IF recent_posts_count > 0 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Please wait before posting again.';
  END IF;

  -- Check for posts in the last 24 hours (abuse prevention)
  SELECT COUNT(*) INTO daily_posts_count
  FROM posts
  WHERE author_id = NEW.author_id
    AND created_at > NOW() - INTERVAL '24 hours';

  IF daily_posts_count >= 100 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Daily post limit reached.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Fix CEO auth: ensure auth.identities exists for ceo_steve_b
DO $$
DECLARE
  v_ceo_id UUID;
  v_identity_exists BOOLEAN;
BEGIN
  SELECT id INTO v_ceo_id FROM public.profiles WHERE username = 'ceo_steve_b';

  IF v_ceo_id IS NULL THEN
    RAISE NOTICE 'ceo_steve_b not found, skipping auth fix';
    RETURN;
  END IF;

  -- Ensure auth.users record has correct email and password
  UPDATE auth.users SET
    encrypted_password = extensions.crypt('Steve123!', extensions.gen_salt('bf')),
    email = 'steve@vyxhub.com',
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
  WHERE id = v_ceo_id;

  -- Check if identity exists
  SELECT EXISTS(
    SELECT 1 FROM auth.identities WHERE user_id = v_ceo_id AND provider = 'email'
  ) INTO v_identity_exists;

  IF NOT v_identity_exists THEN
    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_ceo_id, v_ceo_id::text,
      jsonb_build_object('sub', v_ceo_id::text, 'email', 'steve@vyxhub.com'),
      'email', NOW(), NOW(), NOW()
    );
    RAISE NOTICE 'Created missing identity for ceo_steve_b (%)' , v_ceo_id;
  ELSE
    RAISE NOTICE 'Identity already exists for ceo_steve_b (%)' , v_ceo_id;
  END IF;

  RAISE NOTICE 'CEO auth fixed for ceo_steve_b (%)' , v_ceo_id;
END $$;
