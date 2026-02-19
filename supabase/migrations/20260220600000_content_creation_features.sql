-- Add is_draft to posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT FALSE;

-- Add is_nsfw to posts (for content warnings)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_nsfw BOOLEAN DEFAULT FALSE;

-- Add is_edited to posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;

-- Create polls table
CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  question TEXT NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create poll_options table
CREATE TABLE IF NOT EXISTS poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID REFERENCES polls(id) ON DELETE CASCADE NOT NULL,
  option_text TEXT NOT NULL,
  votes_count INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- Create poll_votes table
CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID REFERENCES polls(id) ON DELETE CASCADE NOT NULL,
  option_id UUID REFERENCES poll_options(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(poll_id, user_id)
);

-- Enable RLS
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

-- Policies for polls
CREATE POLICY "Polls follow post visibility"
  ON polls FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM posts WHERE posts.id = polls.post_id
      AND (
        posts.visibility = 'public'
        OR posts.author_id = auth.uid()
        OR (posts.visibility = 'followers_only' AND EXISTS (
          SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = posts.author_id
        ))
        OR (posts.visibility = 'subscribers_only' AND EXISTS (
          SELECT 1 FROM subscriptions 
          WHERE subscriber_id = auth.uid() 
          AND creator_id = posts.author_id 
          AND status = 'active' 
          AND expires_at > NOW()
        ))
      )
    )
  );

CREATE POLICY "Authors can manage their polls"
  ON polls FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM posts WHERE posts.id = polls.post_id AND posts.author_id = auth.uid()
    )
  );

-- Policies for poll_options
CREATE POLICY "Poll options follow poll visibility"
  ON poll_options FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM polls WHERE polls.id = poll_options.poll_id
    )
  );

CREATE POLICY "Authors can manage their poll options"
  ON poll_options FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM polls 
      JOIN posts ON posts.id = polls.post_id
      WHERE polls.id = poll_options.poll_id AND posts.author_id = auth.uid()
    )
  );

-- Policies for poll_votes
CREATE POLICY "Users can view poll votes if they can view the poll"
  ON poll_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM polls WHERE polls.id = poll_votes.poll_id
    )
  );

CREATE POLICY "Users can vote on polls"
  ON poll_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM polls WHERE polls.id = poll_votes.poll_id AND polls.ends_at > NOW()
    )
  );

-- Function to increment vote count
CREATE OR REPLACE FUNCTION increment_poll_vote()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE poll_options
  SET votes_count = votes_count + 1
  WHERE id = NEW.option_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_poll_vote
  AFTER INSERT ON poll_votes
  FOR EACH ROW
  EXECUTE FUNCTION increment_poll_vote();
