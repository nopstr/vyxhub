-- =============================================================================
-- Allow all users (including anonymous) to see all posts in SELECT queries.
-- The actual media content is still protected by media RLS policies
-- (signed URLs, is_preview flag, subscription/purchase checks).
-- This lets the frontend show locked/blurred previews of subscriber-only
-- content to entice sign-ups and subscriptions.
-- =============================================================================

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Users can view public posts" ON posts;

-- Create an open SELECT policy — all non-draft posts visible to everyone
CREATE POLICY "Anyone can view all posts"
  ON posts FOR SELECT
  USING (
    is_draft IS NULL OR is_draft = FALSE
  );
