-- Fix infinite recursion in conversation_participants policy
DROP POLICY IF EXISTS "Users can view their participation" ON conversation_participants;

CREATE POLICY "Users can view their participation"
  ON conversation_participants FOR SELECT
  USING (
    user_id = auth.uid() 
    OR conversation_id IN (
      SELECT cp.conversation_id 
      FROM conversation_participants cp
      WHERE cp.user_id = auth.uid()
    )
  );
