import { supabase } from './supabase'

const BUCKET = {
  avatars: 'avatars',
  banners: 'banners',
  posts: 'posts',
  messages: 'messages',
}

export async function uploadFile(bucket, filePath, file) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
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
