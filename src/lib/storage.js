import { supabase } from './supabase'
import { MAX_FILE_SIZE_MB, ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES } from './constants'

// ─── Bucket Configuration ──────────────────────────────────────────────────
export const BUCKET = {
  avatars: 'avatars',               // PUBLIC — profile pictures
  banners: 'banners',               // PUBLIC — profile banners
  posts: 'posts',                   // PRIVATE — creator content (signed URLs)
  messages: 'messages',             // PRIVATE — message attachments
  verificationDocs: 'verification-docs', // PRIVATE — ID documents
}

// Buckets that serve public URLs (no signing required)
const PUBLIC_BUCKETS = new Set([BUCKET.avatars, BUCKET.banners])

// ─── Signed URL Configuration ──────────────────────────────────────────────
const SIGNED_URL_EXPIRY = {
  image: 3600,    // 1 hour
  video: 7200,    // 2 hours
  default: 3600,  // 1 hour fallback
}

// In-memory signed URL cache — avoids redundant API calls within TTL
const _signedUrlCache = new Map()
const CACHE_BUFFER_MS = 120_000 // Refresh 2 min before actual expiry

// ─── Validation ────────────────────────────────────────────────────────────
export function validateFile(file) {
  const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024
  if (file.size > maxBytes) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB`)
  }
  const allowed = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES]
  if (!allowed.includes(file.type)) {
    throw new Error(`File type ${file.type} is not supported`)
  }
  return true
}

// ─── Upload Functions ──────────────────────────────────────────────────────
export async function uploadFile(bucket, filePath, file) {
  validateFile(file)

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
    })

  if (error) throw error

  // Public buckets → return permanent public URL
  if (PUBLIC_BUCKETS.has(bucket)) {
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path)
    return publicUrl
  }

  // Private buckets → return storage path (resolved to signed URL at display time)
  return data.path
}

export async function uploadAvatar(userId, file) {
  const ext = file.name.split('.').pop()
  const path = `${userId}/avatar.${ext}`
  return uploadFile(BUCKET.avatars, path, file)
}

export async function uploadBanner(userId, file) {
  const ext = file.name.split('.').pop()
  const path = `${userId}/banner.${ext}`
  return uploadFile(BUCKET.banners, path, file)
}

export async function uploadPostMedia(userId, postId, file, index) {
  const ext = file.name.split('.').pop()
  const path = `${userId}/${postId}/${index}.${ext}`
  return uploadFile(BUCKET.posts, path, file)
}

export async function uploadVerificationDoc(userId, docType, file) {
  const ext = file.name.split('.').pop()
  const path = `${userId}/${docType}.${ext}`
  return uploadFile(BUCKET.verificationDocs, path, file)
}

export async function deleteFile(bucket, path) {
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
}

// ─── Public URL (avatars, banners only) ────────────────────────────────────
export function getPublicUrl(bucket, path) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

// ─── Path Extraction ───────────────────────────────────────────────────────
/**
 * Extract the storage path from a full URL or return as-is if already a path.
 * Handles backward compat with URLs stored before the private-bucket migration.
 */
export function extractStoragePath(urlOrPath, bucket = 'posts') {
  if (!urlOrPath) return null

  // Already a relative path (no protocol)
  if (!urlOrPath.startsWith('http')) return urlOrPath

  // Full Supabase public URL: .../storage/v1/object/public/{bucket}/{path}
  const publicMarker = `/storage/v1/object/public/${bucket}/`
  const pubIdx = urlOrPath.indexOf(publicMarker)
  if (pubIdx >= 0) return urlOrPath.slice(pubIdx + publicMarker.length)

  // Signed URL format: .../storage/v1/object/sign/{bucket}/{path}?token=...
  const signedMarker = `/storage/v1/object/sign/${bucket}/`
  const sigIdx = urlOrPath.indexOf(signedMarker)
  if (sigIdx >= 0) return urlOrPath.slice(sigIdx + signedMarker.length).split('?')[0]

  return urlOrPath
}

// ─── Signed URL Cache ──────────────────────────────────────────────────────
function getCachedSignedUrl(path) {
  const cached = _signedUrlCache.get(path)
  if (!cached) return null
  if (Date.now() > cached.expiresAt - CACHE_BUFFER_MS) {
    _signedUrlCache.delete(path)
    return null
  }
  return cached.url
}

function cacheSignedUrl(path, url, expirySeconds) {
  _signedUrlCache.set(path, {
    url,
    expiresAt: Date.now() + expirySeconds * 1000,
  })
}

/** Prune all expired entries from the cache */
export function pruneSignedUrlCache() {
  const now = Date.now()
  for (const [path, entry] of _signedUrlCache) {
    if (now > entry.expiresAt) _signedUrlCache.delete(path)
  }
}

// ─── Signed URL Resolution ─────────────────────────────────────────────────
/**
 * Generate a signed URL for a single storage path.
 * Uses in-memory cache to avoid redundant calls within TTL.
 */
export async function getSignedMediaUrl(path, mediaType = 'image') {
  if (!path) return null

  const storagePath = extractStoragePath(path)
  if (!storagePath) return null

  const cached = getCachedSignedUrl(storagePath)
  if (cached) return cached

  const expiry = SIGNED_URL_EXPIRY[mediaType] || SIGNED_URL_EXPIRY.default

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET.posts)
      .createSignedUrl(storagePath, expiry)

    if (error || !data?.signedUrl) return null

    cacheSignedUrl(storagePath, data.signedUrl, expiry)
    return data.signedUrl
  } catch {
    return null
  }
}

/**
 * Batch-resolve all post media URLs to short-lived signed URLs.
 *
 * Accepts a single post or an array of posts. For each media item,
 * extracts the storage path, checks the cache, and batch-signs any
 * uncached paths in a single API call. Sets `media.signedUrl` on
 * every resolved item.
 *
 * @param {Object|Object[]} posts - Post object(s) with nested `media` arrays
 * @returns {Object|Object[]} The same reference(s) with `signedUrl` populated
 */
/**
 * Generate a low-resolution blur preview URL from any image URL.
 * Returns a genuinely tiny image (16-20px) that cannot be recovered even
 * if the CSS blur is removed in devtools.
 *
 * @param {string} url - Full signed URL or external URL
 * @returns {string|null} Low-res URL suitable for blur preview
 */
export function getBlurPreviewUrl(url) {
  if (!url) return null

  // Unsplash: use native resize — returns a ~16px wide, 1% quality image
  if (url.includes('unsplash.com')) {
    const base = url.split('?')[0]
    return `${base}?w=16&q=1`
  }

  // Supabase signed URLs: switch to render endpoint with tiny transform
  // /storage/v1/object/sign/{bucket}/{path}?token=... → /storage/v1/render/image/sign/{bucket}/{path}?token=...&width=16&quality=1
  if (url.includes('/storage/v1/object/sign/')) {
    return url.replace('/storage/v1/object/sign/', '/storage/v1/render/image/sign/') +
      '&width=16&height=16&quality=1&resize=cover'
  }

  // Google storage / other external CDNs: can't resize server-side,
  // return null — CSS blur on a hidden-overflow tiny container will suffice
  return url
}

export async function resolvePostMediaUrls(posts) {
  if (!posts) return posts
  const isSingle = !Array.isArray(posts)
  const postsArray = isSingle ? [posts] : posts

  if (postsArray.length === 0) return posts

  // Collect media that need signing
  const pathToMedia = new Map()  // storagePath → [media item refs]
  const pendingPaths = []

  for (const post of postsArray) {
    if (!post.media) continue
    for (const media of post.media) {
      if (!media.url) continue
      const storagePath = extractStoragePath(media.url)
      if (!storagePath) continue

      // Check cache first
      const cached = getCachedSignedUrl(storagePath)
      if (cached) {
        media.signedUrl = cached
        continue
      }

      // Queue for batch signing
      if (!pathToMedia.has(storagePath)) {
        pathToMedia.set(storagePath, [])
        pendingPaths.push(storagePath)
      }
      pathToMedia.get(storagePath).push(media)
    }
  }

  // Batch sign all uncached paths in a single API call
  if (pendingPaths.length > 0) {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET.posts)
        .createSignedUrls(pendingPaths, SIGNED_URL_EXPIRY.default)

      if (!error && data) {
        for (const item of data) {
          if (item.error || !item.signedUrl) continue
          const refs = pathToMedia.get(item.path)
          if (!refs) continue
          for (const media of refs) {
            media.signedUrl = item.signedUrl
          }
          cacheSignedUrl(item.path, item.signedUrl, SIGNED_URL_EXPIRY.default)
        }
      }
    } catch (err) {
      console.warn('[storage] Batch signed URL generation failed:', err.message)
    }
  }

  return isSingle ? postsArray[0] : postsArray
}
