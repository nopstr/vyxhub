import { useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Heart, MessageCircle, UserPlus, DollarSign, Video, Bell,
  ShieldCheck, Star, AtSign, Image, Film, Grid3x3, Loader2, Filter
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import { PageLoader } from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import { formatRelativeTime, cn } from '../../lib/utils'

const notifIcons = {
  like: { icon: Heart, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  comment: { icon: MessageCircle, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  follow: { icon: UserPlus, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  subscription: { icon: DollarSign, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  tip: { icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  mention: { icon: AtSign, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  livestream_started: { icon: Video, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  new_post: { icon: Star, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  message: { icon: MessageCircle, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
}

// A7: Priority-based border styling
const priorityStyles = {
  high: 'border-l-2 border-l-amber-500/60',
  medium: '',
  low: 'opacity-75',
}

// Filter tabs
const FILTER_TABS = [
  { key: null, label: 'All' },
  { key: 'like', label: 'Likes', icon: Heart },
  { key: 'comment', label: 'Comments', icon: MessageCircle },
  { key: 'follow', label: 'Follows', icon: UserPlus },
  { key: 'subscription', label: 'Subs', icon: DollarSign },
  { key: 'tip', label: 'Tips', icon: DollarSign },
  { key: 'mention', label: 'Mentions', icon: AtSign },
]

const postTypeIcons = {
  image: Image,
  video: Film,
  set: Grid3x3,
  text: MessageCircle,
}

function RichPreview({ preview, referenceId }) {
  if (!preview) return null

  const PostTypeIcon = postTypeIcons[preview.type] || MessageCircle

  return (
    <Link
      to={`/post/${referenceId}`}
      className="mt-2 flex items-center gap-2.5 px-3 py-2 bg-zinc-800/40 rounded-xl border border-zinc-800/50 hover:border-zinc-700/50 transition-colors group/preview"
      onClick={(e) => e.stopPropagation()}
    >
      {preview.media ? (
        <img
          src={preview.media}
          alt=""
          className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-zinc-700/50 flex items-center justify-center flex-shrink-0">
          <PostTypeIcon size={16} className="text-zinc-500" />
        </div>
      )}
      <p className="text-xs text-zinc-500 truncate flex-1 group-hover/preview:text-zinc-400 transition-colors">
        {preview.text || `[${preview.type}]`}
      </p>
    </Link>
  )
}

function NotificationItem({ notification, onRead }) {
  const config = notifIcons[notification.notification_type] || notifIcons.follow
  const Icon = config.icon
  const grouped = notification.grouped

  const getNotifLink = () => {
    switch (notification.notification_type) {
      case 'like':
      case 'comment':
      case 'new_post':
        return notification.reference_id ? `/post/${notification.reference_id}` : null
      case 'follow':
        return notification.actor ? `/@${notification.actor.username}` : null
      case 'message':
        return '/messages'
      case 'subscription':
      case 'tip':
        return notification.actor ? `/@${notification.actor.username}` : null
      default:
        return null
    }
  }

  // A7: Build grouped display text
  const getGroupedText = () => {
    if (!grouped || grouped.count <= 1) {
      return (
        <>
          {notification.actor && (
            <Link to={`/@${notification.actor.username}`} className="font-bold hover:underline" onClick={e => e.stopPropagation()}>
              {notification.actor.display_name}
            </Link>
          )}{' '}
          <span className="text-zinc-400">{notification.message || getNotifMessage(notification.notification_type)}</span>
        </>
      )
    }

    const firstActor = grouped.actors[0]
    const othersCount = grouped.count - 1
    return (
      <>
        {firstActor && (
          <Link to={`/@${firstActor.username}`} className="font-bold hover:underline" onClick={e => e.stopPropagation()}>
            {firstActor.display_name}
          </Link>
        )}
        <span className="text-zinc-400">
          {' '}and {othersCount} other{othersCount > 1 ? 's' : ''} {getNotifMessage(notification.notification_type)}
        </span>
      </>
    )
  }

  const link = getNotifLink()
  const Wrapper = link ? Link : 'div'
  const wrapperProps = link ? { to: link } : {}

  return (
    <Wrapper
      {...wrapperProps}
      onClick={() => !notification.is_read && onRead(notification.id)}
      className={cn(
        'flex items-start gap-4 px-5 py-4 border-b border-zinc-800/50 hover:bg-zinc-900/20 transition-colors cursor-pointer block',
        !notification.is_read && 'bg-indigo-500/[0.03]',
        priorityStyles[notification.priority] || ''
      )}
    >
      <div className={cn('p-2.5 rounded-xl flex-shrink-0', config.bg)}>
        <Icon size={18} className={config.color} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          {/* Show stacked avatars for grouped notifications */}
          {grouped && grouped.count > 1 ? (
            <div className="flex -space-x-2 flex-shrink-0">
              {grouped.actors.slice(0, 3).map((actor, i) => (
                actor && <Link key={actor.id || i} to={`/@${actor.username}`} onClick={e => e.stopPropagation()}>
                  <Avatar src={actor.avatar_url} alt={actor.display_name} size="sm" className="ring-2 ring-[#050505]" />
                </Link>
              ))}
              {grouped.count > 3 && (
                <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-400 ring-2 ring-[#050505]">
                  +{grouped.count - 3}
                </div>
              )}
            </div>
          ) : notification.actor ? (
            <Link to={`/@${notification.actor.username}`} className="flex-shrink-0" onClick={e => e.stopPropagation()}>
              <Avatar src={notification.actor.avatar_url} alt={notification.actor.display_name} size="sm" />
            </Link>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-200">
              {getGroupedText()}
            </p>
            <span className="text-xs text-zinc-600 mt-1 block">
              {formatRelativeTime(notification.created_at)}
            </span>

            {/* Rich preview for post-related notifications */}
            {notification.post_preview && (
              <RichPreview preview={notification.post_preview} referenceId={notification.reference_id} />
            )}
          </div>
        </div>
      </div>

      {!notification.is_read && (
        <div className={cn(
          'w-2 h-2 rounded-full mt-2 flex-shrink-0',
          notification.priority === 'high' ? 'bg-amber-500' : 'bg-indigo-500'
        )} />
      )}
    </Wrapper>
  )
}

function getNotifMessage(type) {
  const messages = {
    like: 'liked your post',
    comment: 'commented on your post',
    follow: 'started following you',
    subscription: 'subscribed to you',
    tip: 'sent you a tip',
    mention: 'mentioned you',
    livestream_started: 'went live',
    new_post: 'posted something new',
    message: 'sent you a message',
  }
  return messages[type] || 'interacted with you'
}

export default function NotificationsPage() {
  const { user } = useAuthStore()
  const {
    groupedNotifications, loading, unreadCount, hasMore, typeCounts, activeFilter,
    fetchNotifications, fetchTypeCounts, markAsRead, markAllAsRead,
    subscribeToNotifications, setFilter,
  } = useNotificationStore()

  const observerRef = useRef(null)
  const loadMoreRef = useRef(null)

  useEffect(() => {
    if (user) {
      fetchNotifications(user.id, true)
      fetchTypeCounts(user.id)
      const unsub = subscribeToNotifications(user.id)
      return unsub
    }
  }, [user])

  // Re-fetch when filter changes
  useEffect(() => {
    if (user) {
      fetchNotifications(user.id, true)
    }
  }, [activeFilter])

  // Infinite scroll observer
  const lastItemRef = useCallback(node => {
    if (loading) return
    if (observerRef.current) observerRef.current.disconnect()

    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && user) {
        fetchNotifications(user.id)
      }
    }, { threshold: 0.1 })

    if (node) observerRef.current.observe(node)
  }, [loading, hasMore, user])

  if (loading && groupedNotifications.length === 0) return <PageLoader />

  return (
    <div>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50">
        <div className="px-5 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Notifications</h1>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAllAsRead(user.id)}>
              Mark all as read
            </Button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-5 pb-3 overflow-x-auto no-scrollbar">
          {FILTER_TABS.map(tab => {
            const count = tab.key ? (typeCounts[tab.key]?.unread || 0) : unreadCount
            return (
              <button
                key={tab.key ?? 'all'}
                onClick={() => setFilter(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer',
                  activeFilter === tab.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300 border border-zinc-800/50'
                )}
              >
                {tab.icon && <tab.icon size={12} />}
                {tab.label}
                {count > 0 && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full ml-0.5',
                    activeFilter === tab.key ? 'bg-white/20' : 'bg-indigo-500/20 text-indigo-400'
                  )}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </header>

      {groupedNotifications.length > 0 ? (
        <div>
          {groupedNotifications.map((notif, i) => (
            <div
              key={notif.id}
              ref={i === groupedNotifications.length - 1 ? lastItemRef : null}
            >
              <NotificationItem
                notification={notif}
                onRead={markAsRead}
              />
            </div>
          ))}

          {/* Loading more indicator */}
          {loading && (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin text-zinc-500" size={20} />
            </div>
          )}

          {!hasMore && groupedNotifications.length > 5 && (
            <p className="text-center text-xs text-zinc-700 py-6">No more notifications</p>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description={activeFilter
            ? `No ${activeFilter} notifications yet.`
            : "When someone interacts with you, it'll show up here."}
        />
      )}
    </div>
  )
}
