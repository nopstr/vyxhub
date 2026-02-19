-- ============================================================================
-- ASSESSMENT v2 FIXES — February 19, 2026
-- BUG-3: publish_scheduled_posts variable collision (infinite duplicates)
-- BUG-5: calculate_hot_score incorrectly marked IMMUTABLE (uses NOW())
-- ============================================================================

-- BUG-5 FIX: Change IMMUTABLE to STABLE since function uses NOW()
-- IMMUTABLE tells PG to cache results for same inputs, but NOW() changes
-- every call, so cached results are stale and feed rankings become incorrect.
CREATE OR REPLACE FUNCTION calculate_hot_score(
  p_like_count INTEGER,
  p_comment_count INTEGER,
  p_view_count INTEGER,
  p_created_at TIMESTAMPTZ
) RETURNS FLOAT AS $$
DECLARE
  engagement FLOAT;
  age_hours FLOAT;
BEGIN
  engagement := (COALESCE(p_like_count, 0) * 2.0) +
                (COALESCE(p_comment_count, 0) * 3.0) +
                (COALESCE(p_view_count, 0) * 0.1);
  age_hours := EXTRACT(EPOCH FROM (NOW() - p_created_at)) / 3600.0;
  RETURN engagement / POWER(age_hours + 2.0, 1.5);
END;
$$ LANGUAGE plpgsql STABLE;

-- BUG-3 FIX: publish_scheduled_posts was overwriting rec.id with the new
-- post's ID via RETURNING id INTO rec.id, then using rec.id in the WHERE
-- clause to update scheduled_posts — which targeted the wrong row.
-- The scheduled post was never marked as published, causing infinite
-- duplicate post creation on every cron run.
CREATE OR REPLACE FUNCTION publish_scheduled_posts()
RETURNS INT AS $$
DECLARE
  published_count INT := 0;
  rec RECORD;
  new_post_id UUID;
BEGIN
  FOR rec IN
    SELECT * FROM scheduled_posts
    WHERE status = 'scheduled'
    AND scheduled_for <= NOW()
    ORDER BY scheduled_for ASC
    LIMIT 50
  LOOP
    BEGIN
      -- Create the actual post (store new ID separately to preserve rec.id)
      INSERT INTO posts (author_id, content, post_type, visibility, price)
      VALUES (rec.author_id, rec.content, rec.post_type, rec.visibility, rec.price)
      RETURNING id INTO new_post_id;

      -- Mark as published using rec.id (the scheduled_post's original ID)
      UPDATE scheduled_posts SET
        status = 'published',
        published_post_id = new_post_id,
        updated_at = NOW()
      WHERE id = rec.id;

      published_count := published_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Mark as failed using rec.id (not the overwritten value)
      UPDATE scheduled_posts SET status = 'failed', updated_at = NOW()
      WHERE id = rec.id;
    END;
  END LOOP;

  RETURN published_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
