-- =============================================================================
-- WIPE ALL DATA FROM DATABASE EXCEPT @ceo_steve_b
-- =============================================================================
-- This migration removes ALL users, posts, messages, and mock data from the
-- database while preserving the ceo_steve_b account and its profile.
-- Uses replica mode to bypass triggers and FK constraints for clean deletion.
-- =============================================================================

DO $$
DECLARE
  v_ceo_id UUID;
  v_table TEXT;
BEGIN
  -- 1. Find the CEO account to preserve
  SELECT id INTO v_ceo_id FROM public.profiles WHERE username = 'ceo_steve_b';

  IF v_ceo_id IS NULL THEN
    RAISE EXCEPTION 'ceo_steve_b not found — aborting wipe to avoid losing all data';
  END IF;

  RAISE NOTICE 'Preserving ceo_steve_b (%), wiping everything else...', v_ceo_id;

  -- 2. Disable triggers and FK constraint checks
  SET session_replication_role = 'replica';

  -- =========================================================================
  -- 3. NULLIFY REFERENCES that would block deletion (non-CASCADE FKs)
  -- =========================================================================
  UPDATE public.profiles SET suspended_by = NULL WHERE suspended_by IS NOT NULL;
  UPDATE public.profiles SET banned_by = NULL WHERE banned_by IS NOT NULL;
  UPDATE public.profiles SET verified_by = NULL WHERE verified_by IS NOT NULL;
  UPDATE public.profiles SET managed_by = NULL WHERE managed_by IS NOT NULL;

  -- =========================================================================
  -- 4. TRUNCATE ALL LEAF TABLES (safe delete, skip if table doesn't exist)
  -- =========================================================================

  -- Tables to fully wipe (no CEO data to preserve)
  FOR v_table IN
    SELECT unnest(ARRAY[
      'post_impressions', 'user_topic_affinities', 'user_content_preferences',
      'user_affinities', 'affinity_events',
      'experiment_metrics', 'experiment_assignments',
      'search_history', 'login_history', 'user_sessions',
      'audit_log', 'rate_limit_log',
      'email_queue', 'notifications',
      'ad_impressions', 'promo_code_redemptions', 'tax_documents',
      'referrals',
      'dedicated_partner_support', 'monthly_subscriber_snapshots',
      'auto_moderation_log', 'moderation_actions', 'reports', 'auto_moderation_rules',
      'custom_requests', 'scheduled_messages', 'creator_promotions',
      'content_promotions', 'promo_codes', 'affiliate_ads',
      'livestreams',
      'crypto_payments', 'payment_sessions', 'payout_requests',
      'wallet_transactions', 'transactions',
      'poll_votes', 'poll_options', 'polls',
      'likes', 'comments', 'bookmarks', 'purchases', 'hidden_posts', 'reel_views',
      'post_hashtags', 'media', 'content_uploads', 'scheduled_posts',
      'posts', 'hashtags',
      'message_reactions', 'messages', 'conversation_participants', 'conversations',
      'follows', 'subscriptions', 'blocks'
    ])
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v_table) THEN
      EXECUTE format('DELETE FROM public.%I', v_table);
      RAISE NOTICE 'Cleared: %', v_table;
    ELSE
      RAISE NOTICE 'Skipped (not found): %', v_table;
    END IF;
  END LOOP;

  -- Tables where we preserve CEO rows
  DELETE FROM public.push_subscriptions WHERE user_id != v_ceo_id;
  DELETE FROM public.tax_info WHERE user_id != v_ceo_id;
  DELETE FROM public.staff_online_status WHERE staff_id != v_ceo_id;
  DELETE FROM public.platform_subscriptions WHERE user_id != v_ceo_id;
  DELETE FROM public.wallets WHERE creator_id != v_ceo_id;

  -- =========================================================================
  -- 5. DELETE ALL OTHER PROFILES AND AUTH RECORDS (except CEO)
  -- =========================================================================
  DELETE FROM public.profiles WHERE id != v_ceo_id;
  DELETE FROM auth.users WHERE id != v_ceo_id;

  -- =========================================================================
  -- 6. RESET CEO PROFILE COUNTERS (followers/following now gone)
  -- =========================================================================
  UPDATE public.profiles SET
    follower_count = 0,
    following_count = 0
  WHERE id = v_ceo_id;

  -- =========================================================================
  -- 7. RE-ENABLE TRIGGERS AND FK CONSTRAINTS
  -- =========================================================================
  SET session_replication_role = 'origin';

  RAISE NOTICE 'Database wiped successfully. Only ceo_steve_b (%) remains.', v_ceo_id;
END $$;

-- =========================================================================
-- 8. REFRESH MATERIALIZED VIEWS (must be outside DO block)
-- =========================================================================
REFRESH MATERIALIZED VIEW public.trending_posts;
REFRESH MATERIALIZED VIEW public.trending_creators;
