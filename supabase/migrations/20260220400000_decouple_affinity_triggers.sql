-- ============================================================================
-- DECOUPLE AFFINITY TRIGGERS FOR SCALABILITY
-- ============================================================================
-- Instead of updating user_affinities synchronously on every like/comment/etc,
-- we log the events to a lightweight table and process them asynchronously.

-- 1. Create the event log table
CREATE TABLE IF NOT EXISTS affinity_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  creator_id UUID NOT NULL,
  delta DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Update the update_user_affinity function to just insert an event
CREATE OR REPLACE FUNCTION update_user_affinity(p_user_id UUID, p_creator_id UUID, p_delta DECIMAL)
RETURNS VOID AS $$
BEGIN
  -- Don't track self-affinity
  IF p_user_id = p_creator_id THEN
    RETURN;
  END IF;

  -- Insert into the event log instead of updating the affinities table directly
  INSERT INTO affinity_events (user_id, creator_id, delta)
  VALUES (p_user_id, p_creator_id, p_delta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create a function to process the events in bulk
CREATE OR REPLACE FUNCTION process_affinity_events()
RETURNS VOID AS $$
DECLARE
  v_processed_count INT;
BEGIN
  -- Lock the rows we are about to process to prevent concurrent processing
  -- We use a CTE to delete and return the rows in one atomic operation
  WITH deleted_events AS (
    DELETE FROM affinity_events
    RETURNING user_id, creator_id, delta
  ),
  aggregated_events AS (
    SELECT 
      user_id, 
      creator_id, 
      SUM(delta) as total_delta,
      COUNT(*) as interaction_count
    FROM deleted_events
    GROUP BY user_id, creator_id
  )
  INSERT INTO user_affinities (user_id, creator_id, affinity_score, interaction_count, last_interaction)
  SELECT 
    user_id, 
    creator_id, 
    GREATEST(total_delta, 0), 
    interaction_count, 
    NOW()
  FROM aggregated_events
  ON CONFLICT (user_id, creator_id) DO UPDATE SET
    affinity_score = GREATEST(user_affinities.affinity_score + EXCLUDED.affinity_score, -100),
    interaction_count = user_affinities.interaction_count + EXCLUDED.interaction_count,
    last_interaction = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Enable pg_cron and schedule the processing job
-- Note: pg_cron must be enabled in the Supabase dashboard.
-- If it's not enabled, this will fail, so we wrap it in a DO block.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Schedule to run every minute
    PERFORM cron.schedule('process-affinity-events', '* * * * *', 'SELECT process_affinity_events();');
  ELSE
    RAISE NOTICE 'pg_cron extension is not enabled. Please enable it to process affinity events automatically.';
  END IF;
END $$;
