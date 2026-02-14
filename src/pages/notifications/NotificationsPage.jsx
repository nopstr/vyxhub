import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Heart, MessageCircle, UserPlus, DollarSign, Video, Bell,
  ShieldCheck, Star, AtSign
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import { PageLoader } from '../../components/ui/Spinner'
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

function NotificationItem({ notification, onRead }) {
  const config = notifIcons[notification.notification_type] || notifIcons.follow
  const Icon = config.icon

  return (
    <div
      onClick={() => !notification.is_read && onRead(notification.id)}
      className={cn(
        'flex items-start gap-4 px-5 py-4 border-b border-zinc-800/50 hover:bg-zinc-900/20 transition-colors cursor-pointer',
        !notification.is_read && 'bg-indigo-500/[0.03]'
      )}
    >
      <div className={cn('p-2.5 rounded-xl flex-shrink-0', config.bg)}>
        <Icon size={18} className={config.color} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          {notification.actor && (
            <Link to={`/@${notification.actor.username}`}>
              <Avatar src={notification.actor.avatar_url} alt={notification.actor.display_name} size="sm" />
            </Link>
          )}
          <div className="min-w-0">
            <p className="text-sm text-zinc-200">
              {notification.actor && (
                <Link to={`/@${notification.actor.username}`} className="font-bold hover:underline">
                  {notification.actor.display_name}
                </Link>
              )}{' '}
              <span className="text-zinc-400">{notification.message || getNotifMessage(notification.notification_type)}</span>
            </p>
            <span className="text-xs text-zinc-600 mt-1 block">
              {formatRelativeTime(notification.created_at)}
            </span>
          </div>
        </div>
      </div>

      {!notification.is_read && (
        <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2 flex-shrink-0" />
      )}
    </div>
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
  const { notifications, loading, unreadCount, fetchNotifications, markAsRead, markAllAsRead, subscribeToNotifications } = useNotificationStore()

  useEffect(() => {
    if (user) {
      fetchNotifications(user.id)
      const unsub = subscribeToNotifications(user.id)
      return unsub
    }
  }, [user])

  if (loading) return <PageLoader />

  return (
    <div>
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Notifications</h1>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => markAllAsRead(user.id)}>
            Mark all as read
          </Button>
        )}
      </header>

      {notifications.length > 0 ? (
        <div>
          {notifications.map(notif => (
            <NotificationItem
              key={notif.id}
              notification={notif}
              onRead={markAsRead}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-zinc-800/50 rounded-3xl flex items-center justify-center mb-4">
            <Bell size={28} className="text-zinc-600" />
          </div>
          <h3 className="text-lg font-bold text-zinc-300 mb-1">No notifications</h3>
          <p className="text-sm text-zinc-500">When someone interacts with you, it'll show up here</p>
        </div>
      )}
    </div>
  )
}
