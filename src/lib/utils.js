import { formatDistanceToNowStrict, format, isToday, isYesterday } from 'date-fns'

export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function formatRelativeTime(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  return formatDistanceToNowStrict(date, { addSuffix: true })
}

export function formatMessageTime(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (isToday(date)) return format(date, 'h:mm a')
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMM d')
}

export function formatNumber(num) {
  if (!num) return '0'
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toString()
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text
  return text.slice(0, maxLength) + '…'
}

export function generateUsername(email) {
  if (!email) return `user_${Math.random().toString(36).slice(2, 8)}`
  return email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
}

export function getInitials(name) {
  if (!name) return '?'
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function validateUsername(username) {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username)
}

export function getMediaType(file) {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return null
}

export function debounce(fn, delay) {
  let timeout
  return (...args) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), delay)
  }
}
