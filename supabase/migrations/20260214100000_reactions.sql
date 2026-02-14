-- ============================================================================
-- REACTIONS (replaces simple likes with typed reactions)
-- ============================================================================

-- Add reaction_type column to likes table
ALTER TABLE likes ADD COLUMN reaction_type TEXT NOT NULL DEFAULT 'heart';

-- Drop the old unique constraint and add a new one that includes reaction_type
ALTER TABLE likes DROP CONSTRAINT likes_user_id_post_id_key;
ALTER TABLE likes ADD CONSTRAINT likes_user_id_post_id_reaction_key UNIQUE(user_id, post_id, reaction_type);

-- Add a reaction_count column to posts for total reactions
-- (like_count already exists, we'll repurpose it as total reaction count)

-- Create index for fast reaction lookups
CREATE INDEX IF NOT EXISTS idx_likes_reaction_type ON likes(post_id, reaction_type);
