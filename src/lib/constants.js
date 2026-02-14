export const APP_NAME = 'VyxHub'
export const APP_DESCRIPTION = 'Premium adult content platform'
export const APP_URL = 'https://vyxhub.vercel.app'

export const PLATFORM_FEE_PERCENT = 20
export const MIN_SUBSCRIPTION_PRICE = 4.99
export const MAX_SUBSCRIPTION_PRICE = 49.99
export const MIN_TIP_AMOUNT = 1
export const MAX_TIP_AMOUNT = 200

export const MAX_POST_LENGTH = 2000
export const MAX_BIO_LENGTH = 500
export const MAX_DISPLAY_NAME_LENGTH = 50
export const MAX_MEDIA_PER_POST = 10
export const MAX_FILE_SIZE_MB = 50
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

export const FEED_PAGE_SIZE = 20
export const MESSAGES_PAGE_SIZE = 50
export const NOTIFICATIONS_PAGE_SIZE = 30

export const NAV_ITEMS = [
  { id: 'home', label: 'Home', path: '/' },
  { id: 'explore', label: 'Explore', path: '/explore' },
  { id: 'notifications', label: 'Notifications', path: '/notifications' },
  { id: 'messages', label: 'Messages', path: '/messages' },
  { id: 'bookmarks', label: 'Bookmarks', path: '/bookmarks' },
  { id: 'profile', label: 'Profile', path: '/profile' },
]

export const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Everyone', description: 'Visible to all users' },
  { value: 'followers_only', label: 'Followers', description: 'Only your followers can see' },
  { value: 'subscribers_only', label: 'Subscribers', description: 'Only paying subscribers' },
]

export const STORAGE_BUCKETS = {
  avatars: 'avatars',
  banners: 'banners',
  posts: 'posts',
  messages: 'messages',
}
