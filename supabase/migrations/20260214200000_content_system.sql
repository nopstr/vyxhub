-- Content system: PPV pricing, set previews, video thumbnails

-- Add price column to posts for pay-per-view content
ALTER TABLE posts ADD COLUMN IF NOT EXISTS price DECIMAL(10,2) DEFAULT NULL;

-- Add cover_image_url for video thumbnails / set covers
ALTER TABLE posts ADD COLUMN IF NOT EXISTS cover_image_url TEXT DEFAULT NULL;

-- Add is_preview to media table (marks which images in a set are unblurred previews)
ALTER TABLE media ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT false;

-- Purchases table for PPV content
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(buyer_id, post_id)
);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Users can see their own purchases
CREATE POLICY "Users can view own purchases"
  ON purchases FOR SELECT
  USING (auth.uid() = buyer_id);

-- Users can create purchases
CREATE POLICY "Users can create purchases"
  ON purchases FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

-- Creators can see purchases of their content
CREATE POLICY "Creators can view purchases of their posts"
  ON purchases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM posts WHERE posts.id = purchases.post_id AND posts.author_id = auth.uid()
    )
  );
