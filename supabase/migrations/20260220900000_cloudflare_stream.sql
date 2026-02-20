-- Add Cloudflare Stream specific columns to media table
ALTER TABLE media ADD COLUMN IF NOT EXISTS cloudflare_uid TEXT DEFAULT NULL;
ALTER TABLE media ADD COLUMN IF NOT EXISTS cloudflare_ready_to_stream BOOLEAN DEFAULT false;
ALTER TABLE media ADD COLUMN IF NOT EXISTS cloudflare_playback_url TEXT DEFAULT NULL;
ALTER TABLE media ADD COLUMN IF NOT EXISTS cloudflare_thumbnail_url TEXT DEFAULT NULL;
