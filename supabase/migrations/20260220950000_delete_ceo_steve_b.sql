-- Delete ceo_steve_b entirely from the database

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Find the user ID for ceo_steve_b
  SELECT id INTO v_user_id FROM public.profiles WHERE username = 'ceo_steve_b';
  
  IF v_user_id IS NOT NULL THEN
    -- 1. Delete moderation actions where the user is the moderator or target
    DELETE FROM public.moderation_actions WHERE moderator_id = v_user_id OR target_user_id = v_user_id;
    
    -- 2. Set NULL in transactions where the user is the sender or receiver
    UPDATE public.transactions SET from_user_id = NULL WHERE from_user_id = v_user_id;
    UPDATE public.transactions SET to_user_id = NULL WHERE to_user_id = v_user_id;
    
    -- 3. Set NULL in profiles where the user is the admin who performed an action
    UPDATE public.profiles SET suspended_by = NULL WHERE suspended_by = v_user_id;
    UPDATE public.profiles SET banned_by = NULL WHERE banned_by = v_user_id;
    UPDATE public.profiles SET verified_by = NULL WHERE verified_by = v_user_id;
    UPDATE public.profiles SET managed_by = NULL WHERE managed_by = v_user_id;
    
    -- 4. Set NULL in verification_requests where the user is the reviewer
    -- UPDATE public.verification_requests SET reviewed_by = NULL WHERE reviewed_by = v_user_id;
    
    -- 5. Delete scheduled posts where the user is the scheduler
    DELETE FROM public.scheduled_posts WHERE scheduled_by = v_user_id;
    
    -- 6. Delete reports where the user is the reporter (due to ON DELETE SET NULL NOT NULL constraint)
    DELETE FROM public.reports WHERE reporter_id = v_user_id;
    
    -- 7. Delete from auth.users (this will cascade to public.profiles and all other tables with ON DELETE CASCADE)
    DELETE FROM auth.users WHERE id = v_user_id;
  END IF;
END $$;
