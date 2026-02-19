CREATE TABLE IF NOT EXISTS hidden_posts (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

ALTER TABLE hidden_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their hidden posts"
  ON hidden_posts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION personalized_feed(
  p_user_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
) RETURNS TABLE (
  id UUID,
  author_id UUID,
  content TEXT,
  post_type post_type,
  visibility visibility_type,
  is_pinned BOOLEAN,
  like_count INTEGER,
  comment_count INTEGER,
  repost_count INTEGER,
  view_count INTEGER,
  tip_amount DECIMAL,
  price DECIMAL,
  cover_image_url TEXT,
  media_count INTEGER,
  repost_of UUID,
  reposted_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  hot_score FLOAT,
  personal_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.author_id,
    p.content,
    p.post_type,
    p.visibility,
    p.is_pinned,
    p.like_count,
    p.comment_count,
    p.repost_count,
    p.view_count,
    p.tip_amount,
    p.price,
    p.cover_image_url,
    p.media_count,
    p.repost_of,
    p.reposted_by,
    p.created_at,
    p.updated_at,
    calculate_hot_score(p.like_count, p.comment_count, p.view_count, p.created_at) AS hot_score,
    (
      calculate_hot_score(p.like_count, p.comment_count, p.view_count, p.created_at)
      * GREATEST(COALESCE(ua.affinity_score, 1.0), 0.1)
      * CASE
          WHEN p_user_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM follows WHERE follower_id = p_user_id AND following_id = p.author_id
          ) THEN 1.5
          ELSE 1.0
        END
    ) AS personal_score
  FROM posts p
  LEFT JOIN user_affinities ua
    ON ua.user_id = p_user_id AND ua.creator_id = p.author_id
  WHERE p.visibility = 'public'
    -- Block filtering (A6): exclude blocked/muted users bidirectionally
    AND (p_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM blocks
      WHERE (blocker_id = p_user_id AND blocked_id = p.author_id)
         OR (blocker_id = p.author_id AND blocked_id = p_user_id)
    ))
    -- Exclude negative affinity (blocked via affinity system)
    AND (ua.affinity_score IS NULL OR ua.affinity_score > -50)
    -- Exclude hidden posts
    AND (p_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM hidden_posts hp WHERE hp.user_id = p_user_id AND hp.post_id = p.id
    ))
  ORDER BY personal_score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION personalized_reels(
  p_user_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0
) RETURNS TABLE (
  id UUID,
  author_id UUID,
  content TEXT,
  post_type post_type,
  visibility visibility_type,
  is_pinned BOOLEAN,
  like_count INTEGER,
  comment_count INTEGER,
  repost_count INTEGER,
  view_count INTEGER,
  tip_amount DECIMAL,
  price DECIMAL,
  cover_image_url TEXT,
  media_count INTEGER,
  repost_of UUID,
  reposted_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.author_id,
    p.content,
    p.post_type,
    p.visibility,
    p.is_pinned,
    p.like_count,
    p.comment_count,
    p.repost_count,
    p.view_count,
    p.tip_amount,
    p.price,
    p.cover_image_url,
    p.media_count,
    p.repost_of,
    p.reposted_by,
    p.created_at,
    p.updated_at,
    (
      calculate_hot_score(p.like_count, p.comment_count, p.view_count, p.created_at)
      * GREATEST(COALESCE(ua.affinity_score, 1.0), 0.1)
      * CASE
          WHEN rv.post_id IS NOT NULL THEN 0.1  -- Already watched -> heavily downrank
          ELSE 1.0
        END
    ) AS score
  FROM posts p
  LEFT JOIN user_affinities ua
    ON p_user_id IS NOT NULL AND ua.user_id = p_user_id AND ua.creator_id = p.author_id
  LEFT JOIN reel_views rv
    ON p_user_id IS NOT NULL AND rv.user_id = p_user_id AND rv.post_id = p.id
  WHERE p.post_type = 'video'
    AND p.visibility = 'public'
    -- Block filtering
    AND (p_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM blocks
      WHERE (blocker_id = p_user_id AND blocked_id = p.author_id)
         OR (blocker_id = p.author_id AND blocked_id = p_user_id)
    ))
    -- Exclude hidden posts
    AND (p_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM hidden_posts hp WHERE hp.user_id = p_user_id AND hp.post_id = p.id
    ))
  ORDER BY score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

