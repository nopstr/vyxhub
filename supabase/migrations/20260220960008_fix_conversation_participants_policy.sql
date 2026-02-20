-- Fix conversation_participants SELECT policy to allow seeing other participants
-- in conversations you belong to. The previous policy (user_id = auth.uid()) was
-- too restrictive — it prevented loading the other user's info in conversations.
--
-- To avoid the infinite recursion that occurred with a subquery on the same table,
-- we use a SECURITY DEFINER helper function that bypasses RLS.

-- Helper function: returns conversation IDs the calling user belongs to
CREATE OR REPLACE FUNCTION get_my_conversation_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT conversation_id 
  FROM conversation_participants 
  WHERE user_id = auth.uid();
$$;

-- Replace the overly restrictive policy
DROP POLICY IF EXISTS "Users can view their participation" ON conversation_participants;

CREATE POLICY "Users can view their participation"
  ON conversation_participants FOR SELECT
  USING (
    conversation_id IN (SELECT get_my_conversation_ids())
  );
