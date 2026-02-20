-- ============================================================================
-- GRANULAR MESSAGING SETTINGS FOR CREATORS
-- ============================================================================
-- Adds per-creator media permission controls:
--   - allow_media_from_subscribers: subscribers can send images/videos
--   - allow_media_from_users: non-subscribers can send images/videos  
--   - allow_voice_from_subscribers: subscribers can send voice messages
--   - allow_voice_from_users: non-subscribers can send voice messages
-- ============================================================================

-- New profile columns for media permissions
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allow_media_from_subscribers BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allow_media_from_users BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allow_voice_from_subscribers BOOLEAN DEFAULT TRUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allow_voice_from_users BOOLEAN DEFAULT FALSE;
