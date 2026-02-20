-- Fix infinite recursion in conversation_participants policy
DROP POLICY IF EXISTS "Users can view their participation" ON conversation_participants;

CREATE POLICY "Users can view their participation"
  ON conversation_participants FOR SELECT
  USING (
    user_id = auth.uid() 
  );
