-- ============================================================================
-- OPTIMIZE RLS POLICIES FOR SCALABILITY (100k DAU)
-- ============================================================================
-- By using STABLE SECURITY DEFINER functions, PostgreSQL can cache the result
-- of these checks per statement. If a user views a feed with 50 posts from
-- 5 creators, the subscription check is only executed 5 times instead of 50.

-- 1. Helper Functions
CREATE OR REPLACE FUNCTION is_subscribed_to(creator_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE subscriber_id = auth.uid()
    AND creator_id = creator_uuid
    AND status = 'active'
    AND expires_at > NOW()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_following(creator_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM follows
    WHERE follower_id = auth.uid()
    AND following_id = creator_uuid
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION has_purchased_post(p_post_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM purchases
    WHERE buyer_id = auth.uid()
    AND post_id = p_post_id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 2. Optimize Posts RLS
DROP POLICY IF EXISTS "Users can view public posts" ON posts;

CREATE POLICY "Users can view public posts"
  ON posts FOR SELECT
  USING (
    visibility = 'public'
    OR author_id = auth.uid()
    OR (visibility = 'followers_only' AND is_following(author_id))
    OR (visibility = 'subscribers_only' AND is_subscribed_to(author_id))
  );

-- 3. Optimize Media RLS
DROP POLICY IF EXISTS "Media access with content protection" ON media;
DROP POLICY IF EXISTS "Media follows post visibility" ON media;

CREATE POLICY "Media access with content protection"
  ON media FOR SELECT
  USING (
    -- Author always sees own media
    auth.uid() = uploader_id
    OR
    -- Preview media is always visible (for set teasers / thumbnails)
    is_preview = true
    OR
    EXISTS (
      SELECT 1 FROM posts p WHERE p.id = post_id AND (
        -- Case 1: Public post with no price — anyone can see
        (p.visibility = 'public' AND (p.price IS NULL OR p.price = 0))
        OR
        -- Case 2: PPV post — only if purchased
        (p.price IS NOT NULL AND p.price > 0 AND has_purchased_post(p.id))
        OR
        -- Case 3: Followers-only (non-PPV)
        (p.visibility = 'followers_only' AND (p.price IS NULL OR p.price = 0) AND is_following(p.author_id))
        OR
        -- Case 4: Subscribers-only (non-PPV)
        (p.visibility = 'subscribers_only' AND (p.price IS NULL OR p.price = 0) AND is_subscribed_to(p.author_id))
        OR
        -- Case 5: Subscribers-only + PPV — need subscription AND purchase
        (p.visibility = 'subscribers_only' AND p.price IS NOT NULL AND p.price > 0 AND is_subscribed_to(p.author_id) AND has_purchased_post(p.id))
      )
    )
  );
