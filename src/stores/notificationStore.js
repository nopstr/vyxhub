import { create } from 'zustand'
import { supabase } from '../lib/supabase'

// A7: Group notifications by type + reference within a time window
function groupNotifications(notifications) {
  const groups = []
  const grouped = new Map()

  for (const notif of notifications) {
    // Group like + comment notifications by reference_id within 1 hour
    const canGroup = ['like', 'comment'].includes(notif.notification_type) && notif.reference_id
    if (!canGroup) {
      groups.push({ ...notif, grouped: null })
      continue
    }

    const key = `${notif.notification_type}:${notif.reference_id}`
    if (!grouped.has(key)) {
      grouped.set(key, { ...notif, grouped: { actors: [notif.actor], count: 1 } })
      groups.push(grouped.get(key))
    } else {
      const existing = grouped.get(key)
      // Only group within 1 hour window
      const timeDiff = Math.abs(new Date(existing.created_at) - new Date(notif.created_at))
      if (timeDiff < 3600000) {
        existing.grouped.actors.push(notif.actor)
        existing.grouped.count++
        // Keep unread if any in group is unread
        if (!notif.is_read) existing.is_read = false
      } else {
        groups.push({ ...notif, grouped: null })
      }
    }
  }
  return groups
}

// A7: Priority sort order
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  groupedNotifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async (userId) => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('notifications')
      .select(`
        *,
        actor:profiles!actor_id(id, username, display_name, avatar_url)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      set({ loading: false })
      return
    }

    // A7: Sort by priority then recency
    const sorted = (data || []).sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 1
      const pb = PRIORITY_ORDER[b.priority] ?? 1
      if (pa !== pb) return pa - pb
      return new Date(b.created_at) - new Date(a.created_at)
    })

    set({
      notifications: sorted,
      groupedNotifications: groupNotifications(sorted),
      unreadCount: sorted.filter(n => !n.is_read).length || 0,
      loading: false,
    })
  },

  markAsRead: async (notificationId) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)

    set({
      notifications: get().notifications.map(n =>
        n.id === notificationId ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, get().unreadCount - 1),
    })
  },

  markAllAsRead: async (userId) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    set({
      notifications: get().notifications.map(n => ({ ...n, is_read: true })),
      unreadCount: 0,
    })
  },

  subscribeToNotifications: (userId) => {
    const channelName = `notifications-${userId}`
    const existingChannel = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`)
    if (existingChannel) {
      supabase.removeChannel(existingChannel)
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .eq('id', payload.new.actor_id)
            .single()

          const newNotification = { ...payload.new, actor: data }
          set({
            notifications: [newNotification, ...get().notifications],
            unreadCount: get().unreadCount + 1,
          })
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  },
}))
