import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useNotificationStore = create((set, get) => ({
  notifications: [],
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
      .limit(50)

    if (error) {
      set({ loading: false })
      return
    }

    set({
      notifications: data || [],
      unreadCount: data?.filter(n => !n.is_read).length || 0,
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
    const channel = supabase
      .channel('notifications')
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
