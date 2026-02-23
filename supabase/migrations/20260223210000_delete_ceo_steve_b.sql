-- Delete ceo_steve_b account from the database (will be recreated with a fresh account)
-- Uses replica mode to bypass triggers and FK constraints for clean deletion.

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM public.profiles WHERE username = 'ceo_steve_b';
  
  IF v_user_id IS NOT NULL THEN
    -- Disable triggers and FK constraint checks
    SET session_replication_role = 'replica';

    -- Nullify admin references on other profiles
    UPDATE public.profiles SET suspended_by = NULL WHERE suspended_by = v_user_id;
    UPDATE public.profiles SET banned_by = NULL WHERE banned_by = v_user_id;
    UPDATE public.profiles SET verified_by = NULL WHERE verified_by = v_user_id;
    UPDATE public.profiles SET managed_by = NULL WHERE managed_by = v_user_id;
    UPDATE public.transactions SET from_user_id = NULL WHERE from_user_id = v_user_id;
    UPDATE public.transactions SET to_user_id = NULL WHERE to_user_id = v_user_id;

    -- Delete user profile (would normally cascade, but triggers are off)
    DELETE FROM public.profiles WHERE id = v_user_id;
    -- Delete auth record
    DELETE FROM auth.users WHERE id = v_user_id;

    -- Re-enable triggers and FK constraints
    SET session_replication_role = 'origin';

    RAISE NOTICE 'Deleted ceo_steve_b account (%)', v_user_id;
  ELSE
    RAISE NOTICE 'ceo_steve_b not found, nothing to delete';
  END IF;
END $$;
