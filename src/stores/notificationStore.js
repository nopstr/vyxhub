import { create } from 'zustand'
import { supabase } from '../lib/supabase'

const PAGE_SIZE = 30

// A7/A9: Group notifications by type + reference within a time window
// Enhanced grouping with "X and N others" pattern
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
        // Keep highest priority_score in group
        if ((notif.priority_score || 0) > (existing.priority_score || 0)) {
          existing.priority_score = notif.priority_score
        }
      } else {
        groups.push({ ...notif, grouped: null })
      }
    }
  }

  // Sort grouped results by priority_score (engagement-weighted) then by time
  groups.sort((a, b) => {
    // Unread first
    if (a.is_read !== b.is_read) return a.is_read ? 1 : -1
    // Then by priority_score (higher = more important)
    const scoreA = a.priority_score || 0
    const scoreB = b.priority_score || 0
    if (scoreB !== scoreA) return scoreB - scoreA
    // Then by recency
    return new Date(b.created_at) - new Date(a.created_at)
  })

  return groups
}

// A7: Priority sort order
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

// Transform RPC row into notification object with actor sub-object
function transformRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    actor_id: row.actor_id,
    notification_type: row.notification_type,
    reference_id: row.reference_id,
    message: row.message,
    is_read: row.is_read,
    priority: row.priority,
    priority_score: row.priority_score || 0,
    created_at: row.created_at,
    actor: row.actor_username ? {
      id: row.actor_id,
      username: row.actor_username,
      display_name: row.actor_display_name,
      avatar_url: row.actor_avatar_url,
    } : null,
    // Rich preview data
    post_preview: row.post_content ? {
      text: row.post_content,
      media: row.post_thumbnail,
    } : null,
  }
}

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  groupedNotifications: [],
  unreadCount: 0,
  typeCounts: {},
  loading: false,
  hasMore: true,
  cursor: null,
  activeFilter: null, // null = all, or a notification_type string

  fetchNotifications: async (userId, reset = false) => {
    if (get().loading) return
    if (!reset && !get().hasMore) return

    const cursor = reset ? null : get().cursor
    const filter = get().activeFilter
    set({ loading: true })

    try {
      const { data, error } = await supabase.rpc('get_notifications_paginated', {
        p_user_id: userId,
        p_cursor: cursor,
        p_limit: PAGE_SIZE,
        p_type: filter,
      })

      if (error) throw error

      const transformed = (data || []).map(transformRow)
      const newNotifs = reset ? transformed : [...get().notifications, ...transformed]

      // Calculate unread from full list
      const unreadCount = newNotifs.filter(n => !n.is_read).length

      set({
        notifications: newNotifs,
        groupedNotifications: groupNotifications(newNotifs),
        unreadCount,
        loading: false,
        hasMore: (data || []).length === PAGE_SIZE,
        cursor: transformed.length > 0 ? transformed[transformed.length - 1].created_at : cursor,
      })

      return data
    } catch (error) {
      console.error('Notification fetch error:', error)
      set({ loading: false })
    }
  },

  fetchTypeCounts: async (userId) => {
    try {
      const { data } = await supabase.rpc('get_notification_counts', { p_user_id: userId })
      if (data) {
        const counts = {}
        let totalUnread = 0
        for (const row of data) {
          counts[row.notification_type] = { total: row.total, unread: row.unread }
          totalUnread += Number(row.unread)
        }
        set({ typeCounts: counts, unreadCount: totalUnread })
      }
    } catch (e) {
      console.error('Failed to fetch notification counts:', e)
    }
  },

  setFilter: (filter) => {
    set({ activeFilter: filter, cursor: null, hasMore: true, notifications: [], groupedNotifications: [] })
  },

  markAsRead: async (notificationId) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)

    const notifs = get().notifications.map(n =>
      n.id === notificationId ? { ...n, is_read: true } : n
    )
    set({
      notifications: notifs,
      groupedNotifications: groupNotifications(notifs),
      unreadCount: Math.max(0, get().unreadCount - 1),
    })
  },

  markAllAsRead: async (userId) => {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false)

    const notifs = get().notifications.map(n => ({ ...n, is_read: true }))
    set({
      notifications: notifs,
      groupedNotifications: groupNotifications(notifs),
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
          const { data: actor } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .eq('id', payload.new.actor_id)
            .single()

          const newNotification = {
            ...payload.new,
            actor,
            post_preview: null, // Realtime doesn't need to fetch preview
          }

          const notifs = [newNotification, ...get().notifications]
          set({
            notifications: notifs,
            groupedNotifications: groupNotifications(notifs),
            unreadCount: get().unreadCount + 1,
          })

          // Show browser notification if permitted
          if (Notification.permission === 'granted' && document.hidden) {
            const title = actor?.display_name || 'VyxHub'
            const body = payload.new.message || getDefaultMessage(payload.new.notification_type)
            new Notification(title, {
              body,
              icon: actor?.avatar_url || '/vite.svg',
              tag: payload.new.id,
              data: { url: '/notifications' },
            })
          }
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  },

  // Push notification subscription management
  subscribeToPush: async (userId) => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return { error: 'Push notifications not supported' }
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        return { error: 'Permission denied' }
      }

      const registration = await navigator.serviceWorker.ready
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        return { error: 'VAPID key not configured' }
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey,
      })

      const sub = subscription.toJSON()

      // Save to DB
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: navigator.userAgent,
      }, {
        onConflict: 'user_id,endpoint',
      })

      if (error) throw error
      return { success: true }
    } catch (err) {
      console.error('Push subscription failed:', err)
      return { error: err.message }
    }
  },

  unsubscribeFromPush: async (userId) => {
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
        await supabase.from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', subscription.endpoint)
      }
      return { success: true }
    } catch (err) {
      return { error: err.message }
    }
  },
}))

function getDefaultMessage(type) {
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
