-- ============================================================================
-- SECURITY HARDENING — Tier 0 fixes
-- S1: Make posts bucket PRIVATE (defeats entire monetization if public)
-- S5: Create verification-docs bucket (IDs must never be public)
-- Storage RLS updates for signed-URL access model
-- Subscription index for expiry-aware lookups
-- ============================================================================

-- ─── S1: Make "posts" storage bucket PRIVATE ───────────────────────────────
-- This is the single most critical security fix. Previously, anyone with a
-- raw Supabase storage URL could download ALL "premium" content. After this,
-- all post media is served via short-lived signed URLs with access checks.
UPDATE storage.buckets
SET public = false
WHERE id = 'posts';

-- ─── S5: Create PRIVATE "verification-docs" bucket ────────────────────────
-- Government-issued IDs were previously uploaded to the PUBLIC "avatars"
-- bucket — a catastrophic privacy violation. This dedicated private bucket
-- ensures verification documents are only accessible to the owner and admins.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-docs',
  'verification-docs',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- STORAGE RLS: Update posts bucket policies for private access
-- ============================================================================

-- Remove the old "anyone can read" policy — incompatible with private bucket
DROP POLICY IF EXISTS "Post media is publicly accessible" ON storage.objects;

-- Authenticated users can request signed URLs for post media.
-- Defense-in-depth layers:
--   1. Media table RLS controls which storage paths a user can see
--   2. Signed URLs expire (1h images, 2h video)
--   3. Bucket is private — no permanent unauthenticated URLs
CREATE POLICY "Authenticated users can access post media via signed URLs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'posts' AND auth.uid() IS NOT NULL);


-- ============================================================================
-- STORAGE RLS: verification-docs bucket
-- ============================================================================

-- Only the document owner can read their own verification docs
CREATE POLICY "Users can read own verification docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'verification-docs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can upload their own verification docs
CREATE POLICY "Users can upload verification docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'verification-docs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can re-upload (update) their own verification docs
CREATE POLICY "Users can update own verification docs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'verification-docs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own verification docs
CREATE POLICY "Users can delete own verification docs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'verification-docs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================================
-- INDEX: Subscription lookups with expiry awareness
-- ============================================================================
-- The subscription cache and RLS policies should always check expires_at.
-- Partial index on status = 'active' — expiry filtering done at query time
-- (NOW() is not IMMUTABLE so cannot appear in an index predicate).
CREATE INDEX IF NOT EXISTS idx_subscriptions_active
  ON subscriptions(subscriber_id, creator_id)
  WHERE status = 'active';
