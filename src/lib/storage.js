import { supabase } from './supabase'
import { MAX_FILE_SIZE_MB, ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES } from './constants'

const BUCKET = {
  avatars: 'avatars',
  banners: 'banners',
  posts: 'posts',
  messages: 'messages',
}

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

export async function uploadFile(bucket, filePath, file) {
  validateFile(file)

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
    })

  if (error) throw error

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path)

  return publicUrl
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

export async function deleteFile(bucket, path) {
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
}

export function getPublicUrl(bucket, path) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}
