-- ============================================================================
-- TIER 2 FIXES: Triggers, functions, and schema additions
-- H7:  subscriber_count trigger (profiles.subscriber_count always 0)
-- H8:  Fix like_count inflation (count distinct users, not reactions)
-- H9:  Batch view count RPC (replace 20 individual RPCs per page load)
-- H11: Add verification_status + legal_name columns to profiles
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  H7: subscriber_count trigger                                          ║
-- ║  Mirrors the existing update_follow_counts() pattern.                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION update_subscriber_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles
    SET subscriber_count = subscriber_count + 1
    WHERE id = NEW.creator_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles
    SET subscriber_count = GREATEST(subscriber_count - 1, 0)
    WHERE id = OLD.creator_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_update_subscriber_count
  AFTER INSERT OR DELETE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriber_count();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  H8: Fix like_count inflation                                          ║
-- ║  Replace the naive +1/-1 trigger with a COUNT(DISTINCT user_id).       ║
-- ║  This correctly handles multiple reaction types per user.              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Drop the old trigger first so we can replace the function
DROP TRIGGER IF EXISTS on_like_change ON likes;

CREATE OR REPLACE FUNCTION update_like_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id UUID;
BEGIN
  -- Get the relevant post_id
  IF TG_OP = 'DELETE' THEN
    v_post_id := OLD.post_id;
  ELSE
    v_post_id := NEW.post_id;
  END IF;

  -- Recount distinct users who have reacted (any reaction type)
  UPDATE posts
  SET like_count = (
    SELECT COUNT(DISTINCT user_id) FROM likes WHERE post_id = v_post_id
  )
  WHERE id = v_post_id;

  RETURN NULL;
END;
$$;

-- Recreate the trigger with the corrected function
CREATE TRIGGER on_like_change
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW
  EXECUTE FUNCTION update_like_counts();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  H9: Batch view count RPC                                              ║
-- ║  Replaces 20 individual increment_view_count() RPCs per feed load      ║
-- ║  with a single batch call.                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION increment_view_counts(p_post_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE posts
  SET view_count = view_count + 1
  WHERE id = ANY(p_post_ids);
END;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  H11: Add verification columns to profiles                             ║
-- ║  Required by BecomeCreatorPage.jsx for creator verification workflow.  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected'));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS legal_name TEXT;

-- Index for admin queries filtering by verification status
CREATE INDEX IF NOT EXISTS idx_profiles_verification_status
  ON profiles(verification_status)
  WHERE verification_status <> 'unverified';


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Additional: Transaction INSERT policy                                  ║
-- ║  The transactions table needs an INSERT policy so the frontend          ║
-- ║  can write transaction records on subscribe/purchase.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transactions' AND policyname = 'Users can insert their own transactions'
  ) THEN
    CREATE POLICY "Users can insert their own transactions"
      ON transactions FOR INSERT
      WITH CHECK (auth.uid() = from_user_id);
  END IF;
END $$;
