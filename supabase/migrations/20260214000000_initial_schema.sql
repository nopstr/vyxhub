-- VyxHub Database Schema
-- Adult content platform with photo/video uploads, reels, livestreams, and paywall

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- PROFILES (Extended user data)
-- ============================================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  is_creator BOOLEAN DEFAULT FALSE,
  is_verified BOOLEAN DEFAULT FALSE,
  subscription_price DECIMAL(10,2) DEFAULT 0, -- Monthly subscription price (0 = free)
  total_earnings DECIMAL(12,2) DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- ============================================================================
-- FOLLOWS (Social graph)
-- ============================================================================
CREATE TABLE follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  following_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view follows"
  ON follows FOR SELECT USING (true);

CREATE POLICY "Users can follow others"
  ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow"
  ON follows FOR DELETE USING (auth.uid() = follower_id);

-- ============================================================================
-- SUBSCRIPTIONS (Paid subscriptions to creators)
-- ============================================================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  price_paid DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(subscriber_id, creator_id)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscriptions"
  ON subscriptions FOR SELECT 
  USING (auth.uid() = subscriber_id OR auth.uid() = creator_id);

CREATE POLICY "Users can subscribe"
  ON subscriptions FOR INSERT WITH CHECK (auth.uid() = subscriber_id);

-- ============================================================================
-- POSTS (Main content - text, photos, videos)
-- ============================================================================
CREATE TYPE post_type AS ENUM ('post', 'reel', 'story');
CREATE TYPE visibility_type AS ENUM ('public', 'subscribers_only', 'followers_only');

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT,
  post_type post_type DEFAULT 'post',
  visibility visibility_type DEFAULT 'public',
  is_pinned BOOLEAN DEFAULT FALSE,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  repost_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  tip_amount DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Complex policy for post visibility
CREATE POLICY "Users can view public posts"
  ON posts FOR SELECT
  USING (
    visibility = 'public'
    OR author_id = auth.uid()
    OR (visibility = 'followers_only' AND EXISTS (
      SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = author_id
    ))
    OR (visibility = 'subscribers_only' AND EXISTS (
      SELECT 1 FROM subscriptions 
      WHERE subscriber_id = auth.uid() 
      AND creator_id = author_id 
      AND status = 'active'
      AND expires_at > NOW()
    ))
  );

CREATE POLICY "Users can create posts"
  ON posts FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their posts"
  ON posts FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Users can delete their posts"
  ON posts FOR DELETE USING (auth.uid() = author_id);

-- ============================================================================
-- MEDIA (Photos and videos attached to posts)
-- ============================================================================
CREATE TYPE media_type AS ENUM ('image', 'video', 'gif');

CREATE TABLE media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  uploader_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  media_type media_type NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  blur_hash TEXT, -- For blurred preview of locked content
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER, -- For videos
  file_size_bytes BIGINT,
  is_nsfw BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Media follows post visibility"
  ON media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM posts p WHERE p.id = post_id AND (
        p.visibility = 'public'
        OR p.author_id = auth.uid()
        OR (p.visibility = 'followers_only' AND EXISTS (
          SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = p.author_id
        ))
        OR (p.visibility = 'subscribers_only' AND EXISTS (
          SELECT 1 FROM subscriptions 
          WHERE subscriber_id = auth.uid() 
          AND creator_id = p.author_id 
          AND status = 'active'
          AND expires_at > NOW()
        ))
      )
    )
  );

CREATE POLICY "Users can add media to their posts"
  ON media FOR INSERT WITH CHECK (auth.uid() = uploader_id);

CREATE POLICY "Users can delete their media"
  ON media FOR DELETE USING (auth.uid() = uploader_id);

-- ============================================================================
-- LIKES
-- ============================================================================
CREATE TABLE likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view likes"
  ON likes FOR SELECT USING (true);

CREATE POLICY "Users can like posts"
  ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike"
  ON likes FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE, -- For replies
  content TEXT NOT NULL,
  like_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view comments"
  ON comments FOR SELECT USING (true);

CREATE POLICY "Users can create comments"
  ON comments FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their comments"
  ON comments FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Users can delete their comments"
  ON comments FOR DELETE USING (auth.uid() = author_id);

-- ============================================================================
-- MESSAGES (DMs)
-- ============================================================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  last_read_at TIMESTAMPTZ,
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT,
  media_url TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  tip_amount DECIMAL(10,2) DEFAULT 0, -- Tips for PPV messages
  price DECIMAL(10,2) DEFAULT 0, -- PPV message price
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their conversations"
  ON conversations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM conversation_participants WHERE conversation_id = id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can view their participation"
  ON conversation_participants FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM conversation_participants cp 
    WHERE cp.conversation_id = conversation_id AND cp.user_id = auth.uid()
  ));

CREATE POLICY "Users can view messages in their conversations"
  ON messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM conversation_participants 
    WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
  ));

CREATE POLICY "Users can send messages"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- ============================================================================
-- LIVESTREAMS
-- ============================================================================
CREATE TYPE stream_status AS ENUM ('scheduled', 'live', 'ended');

CREATE TABLE livestreams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  stream_key TEXT UNIQUE, -- For OBS/streaming software
  playback_url TEXT,
  status stream_status DEFAULT 'scheduled',
  visibility visibility_type DEFAULT 'public',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  viewer_count INTEGER DEFAULT 0,
  peak_viewers INTEGER DEFAULT 0,
  total_tips DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE livestreams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Livestream visibility"
  ON livestreams FOR SELECT
  USING (
    visibility = 'public'
    OR host_id = auth.uid()
    OR (visibility = 'followers_only' AND EXISTS (
      SELECT 1 FROM follows WHERE follower_id = auth.uid() AND following_id = host_id
    ))
    OR (visibility = 'subscribers_only' AND EXISTS (
      SELECT 1 FROM subscriptions 
      WHERE subscriber_id = auth.uid() 
      AND creator_id = host_id 
      AND status = 'active'
      AND expires_at > NOW()
    ))
  );

CREATE POLICY "Users can create livestreams"
  ON livestreams FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Users can update their livestreams"
  ON livestreams FOR UPDATE USING (auth.uid() = host_id);

-- ============================================================================
-- TRANSACTIONS (For payments tracking)
-- ============================================================================
CREATE TYPE transaction_type AS ENUM ('subscription', 'tip', 'ppv_message', 'ppv_post', 'withdrawal');

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID REFERENCES profiles(id),
  to_user_id UUID REFERENCES profiles(id),
  transaction_type transaction_type NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  platform_fee DECIMAL(12,2) DEFAULT 0,
  net_amount DECIMAL(12,2) NOT NULL,
  reference_id UUID, -- post_id, subscription_id, etc.
  status TEXT DEFAULT 'completed',
  stripe_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their transactions"
  ON transactions FOR SELECT
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
CREATE TYPE notification_type AS ENUM (
  'follow', 'like', 'comment', 'mention', 'subscription', 
  'tip', 'message', 'livestream_started', 'new_post'
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type notification_type NOT NULL,
  reference_id UUID, -- post_id, comment_id, etc.
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Notifications can be created"
  ON notifications FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their notifications"
  ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- BOOKMARKS
-- ============================================================================
CREATE TABLE bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their bookmarks"
  ON bookmarks FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can bookmark"
  ON bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove bookmarks"
  ON bookmarks FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || LEFT(NEW.id::text, 8)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'New User')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update follower counts
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET follower_count = follower_count + 1 WHERE id = NEW.following_id;
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET follower_count = follower_count - 1 WHERE id = OLD.following_id;
    UPDATE profiles SET following_count = following_count - 1 WHERE id = OLD.follower_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_follow_change
  AFTER INSERT OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- Update post counts
CREATE OR REPLACE FUNCTION update_post_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET post_count = post_count + 1 WHERE id = NEW.author_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET post_count = post_count - 1 WHERE id = OLD.author_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_post_change
  AFTER INSERT OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_post_counts();

-- Update like counts
CREATE OR REPLACE FUNCTION update_like_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET like_count = like_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_like_change
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION update_like_counts();

-- Update comment counts
CREATE OR REPLACE FUNCTION update_comment_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_comment_change
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_comment_counts();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- INDEXES for performance
-- ============================================================================
CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_created ON posts(created_at DESC);
CREATE INDEX idx_posts_type ON posts(post_type);
CREATE INDEX idx_media_post ON media(post_id);
CREATE INDEX idx_likes_post ON likes(post_id);
CREATE INDEX idx_likes_user ON likes(user_id);
CREATE INDEX idx_comments_post ON comments(post_id);
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
CREATE INDEX idx_subscriptions_subscriber ON subscriptions(subscriber_id);
CREATE INDEX idx_subscriptions_creator ON subscriptions(creator_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_livestreams_host ON livestreams(host_id);
CREATE INDEX idx_livestreams_status ON livestreams(status);

-- ============================================================================
-- STORAGE BUCKETS (run this via Supabase Dashboard or separate migration)
-- ============================================================================
-- Note: Storage buckets need to be created via Supabase Dashboard or API
-- Buckets needed:
-- - avatars (public)
-- - banners (public)
-- - posts (private, with RLS)
-- - messages (private)
-- - livestream-thumbnails (public)
