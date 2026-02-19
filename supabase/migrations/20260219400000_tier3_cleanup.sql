-- ============================================================================
-- TIER 3: Cleanup, performance, and schema improvements
-- ============================================================================

-- M4: Drop duplicate indexes that waste storage and slow writes
-- idx_purchases_buyer_post_quick duplicates idx_purchases_buyer_post (same cols)
DROP INDEX IF EXISTS idx_purchases_buyer_post_quick;

-- idx_subscriptions_status_active duplicates idx_subscriptions_active (same cols + predicate)
DROP INDEX IF EXISTS idx_subscriptions_status_active;

-- idx_subscriptions_active_lookup is redundant: adds status col to an index
-- that already has WHERE status = 'active' partial predicate
DROP INDEX IF EXISTS idx_subscriptions_active_lookup;

-- M12: Add notification_preferences JSONB column to profiles
-- Stores per-type toggles: { likes: true, comments: true, ... }
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB
  DEFAULT '{"likes":true,"comments":true,"follows":true,"messages":true,"subscriptions":true,"tips":true,"mentions":true,"promotions":false}'::jsonb;

-- Allow users to update their own notification_preferences
-- (Already covered by existing "Users can update own profile" policy)
