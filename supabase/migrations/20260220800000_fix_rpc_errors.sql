-- Fix missing media_count column in posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_count INTEGER DEFAULT 0;

-- Fix suggest_creators return type mismatch
DROP FUNCTION IF EXISTS suggest_creators(UUID, INT);
CREATE OR REPLACE FUNCTION suggest_creators(
  p_user_id UUID,
  p_limit INT DEFAULT 5
) RETURNS TABLE (
  creator_id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  is_verified BOOLEAN,
  follower_count INTEGER,
  overlap_score BIGINT
) AS $$
BEGIN
  -- Try collaborative filtering first
  RETURN QUERY
  WITH my_follows AS (
    SELECT following_id FROM follows WHERE follower_id = p_user_id
  ),
  similar_users AS (
    SELECT f.follower_id, COUNT(*) AS overlap
    FROM follows f
    INNER JOIN my_follows mf ON f.following_id = mf.following_id
    WHERE f.follower_id != p_user_id
    GROUP BY f.follower_id
    HAVING COUNT(*) >= 2
    ORDER BY overlap DESC
    LIMIT 100
  ),
  candidates AS (
    SELECT f.following_id, SUM(su.overlap) AS score
    FROM follows f
    INNER JOIN similar_users su ON f.follower_id = su.follower_id
    WHERE f.following_id NOT IN (SELECT following_id FROM my_follows)
      AND f.following_id != p_user_id
      AND f.following_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = p_user_id)
      AND EXISTS (SELECT 1 FROM profiles WHERE id = f.following_id AND is_creator = TRUE)
    GROUP BY f.following_id
  )
  SELECT
    pr.id AS creator_id,
    pr.username,
    pr.display_name,
    pr.avatar_url,
    pr.is_verified,
    pr.follower_count,
    c.score::BIGINT AS overlap_score
  FROM candidates c
  JOIN profiles pr ON pr.id = c.following_id
  ORDER BY c.score DESC
  LIMIT p_limit;

  -- Cold start fallback: if no collaborative results, use popularity
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      pr.id AS creator_id,
      pr.username,
      pr.display_name,
      pr.avatar_url,
      pr.is_verified,
      pr.follower_count,
      pr.follower_count::BIGINT AS overlap_score
    FROM profiles pr
    WHERE pr.is_creator = TRUE
      AND pr.id != p_user_id
      AND pr.id NOT IN (SELECT following_id FROM follows WHERE follower_id = p_user_id)
      AND pr.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = p_user_id)
    ORDER BY pr.follower_count DESC
    LIMIT p_limit;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
