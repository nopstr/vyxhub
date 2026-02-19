-- ============================================================================
-- CONTENT PROTECTION: Prevent unauthorized access to paid media URLs
-- ============================================================================

-- Drop and recreate the media RLS policy to account for PPV posts and previews
DROP POLICY IF EXISTS "Media follows post visibility" ON media;

-- New comprehensive media access policy:
-- 1. Author always sees their own media
-- 2. Preview media (is_preview = true) is always visible (for set teasers)
-- 3. Public posts WITHOUT a price: media visible to everyone
-- 4. Public posts WITH a price (PPV): media only visible if purchased by the user
-- 5. Subscribers-only posts: media only visible if subscribed (or purchased for PPV)
-- 6. Followers-only posts: media only visible if following
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
        (p.price IS NOT NULL AND p.price > 0 AND EXISTS (
          SELECT 1 FROM purchases pu
          WHERE pu.post_id = p.id
          AND pu.buyer_id = auth.uid()
        ))
        OR
        -- Case 3: Followers-only (non-PPV)
        (p.visibility = 'followers_only' AND (p.price IS NULL OR p.price = 0) AND EXISTS (
          SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id
        ))
        OR
        -- Case 4: Subscribers-only (non-PPV)
        (p.visibility = 'subscribers_only' AND (p.price IS NULL OR p.price = 0) AND EXISTS (
          SELECT 1 FROM subscriptions
          WHERE subscriber_id = auth.uid()
          AND creator_id = p.author_id
          AND status = 'active'
          AND expires_at > NOW()
        ))
        OR
        -- Case 5: Subscribers-only + PPV — need subscription AND purchase
        (p.visibility = 'subscribers_only' AND p.price IS NOT NULL AND p.price > 0 AND EXISTS (
          SELECT 1 FROM subscriptions
          WHERE subscriber_id = auth.uid()
          AND creator_id = p.author_id
          AND status = 'active'
          AND expires_at > NOW()
        ) AND EXISTS (
          SELECT 1 FROM purchases pu
          WHERE pu.post_id = p.id
          AND pu.buyer_id = auth.uid()
        ))
      )
    )
  );

-- Also make sure Storage objects for post media are protected.
-- The Supabase Storage RLS is on the storage.objects table.
-- We already use authenticated upload. For download/read, we need to
-- ensure URLs are only accessible via signed URLs (short-lived).
-- This is handled by switching from public URLs to signed URLs on the client.

-- Create an index to speed up purchase lookups in the RLS policy
CREATE INDEX IF NOT EXISTS idx_purchases_buyer_post_quick
  ON purchases(buyer_id, post_id);

-- Create an index to speed up subscription lookups in the RLS policy
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_active
  ON subscriptions(subscriber_id, creator_id) WHERE status = 'active';
