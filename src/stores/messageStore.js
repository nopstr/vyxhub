import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useMessageStore = create((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  loading: false,

  fetchConversations: async (userId) => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('conversation_participants')
      .select(`
        conversation_id,
        last_read_at,
        conversation:conversations(
          id,
          updated_at
        )
      `)
      .eq('user_id', userId)
      .order('last_read_at', { ascending: false })

    if (error) {
      set({ loading: false })
      return
    }

    // Get other participants and last messages
    const enriched = await Promise.all(
      (data || []).map(async (cp) => {
        const { data: participants } = await supabase
          .from('conversation_participants')
          .select('user:profiles!user_id(id, username, display_name, avatar_url, is_verified)')
          .eq('conversation_id', cp.conversation_id)
          .neq('user_id', userId)

        const { data: lastMessage } = await supabase
          .from('messages')
          .select('content, created_at, sender_id')
          .eq('conversation_id', cp.conversation_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', cp.conversation_id)
          .eq('is_read', false)
          .neq('sender_id', userId)

        return {
          id: cp.conversation_id,
          otherUser: participants?.[0]?.user,
          lastMessage,
          unreadCount: count || 0,
          lastReadAt: cp.last_read_at,
        }
      })
    )

    set({ conversations: enriched, loading: false })
  },

  fetchMessages: async (conversationId) => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!sender_id(id, username, display_name, avatar_url)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (!error) {
      set({ messages: data || [], activeConversation: conversationId, loading: false })
    }
  },

  sendMessage: async (conversationId, senderId, content) => {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content,
      })
      .select(`
        *,
        sender:profiles!sender_id(id, username, display_name, avatar_url)
      `)
      .single()

    if (!error && data) {
      set({ messages: [...get().messages, data] })
    }
    return data
  },

  startConversation: async (userId, otherUserId) => {
    // Check for existing conversation
    const { data: existing } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', userId)

    if (existing) {
      for (const cp of existing) {
        const { data: other } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', cp.conversation_id)
          .eq('user_id', otherUserId)
          .single()

        if (other) return cp.conversation_id
      }
    }

    // Create new conversation
    const { data: conv } = await supabase
      .from('conversations')
      .insert({})
      .select()
      .single()

    if (conv) {
      await supabase.from('conversation_participants').insert([
        { conversation_id: conv.id, user_id: userId },
        { conversation_id: conv.id, user_id: otherUserId },
      ])
    }

    return conv?.id
  },

  subscribeToMessages: (conversationId) => {
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .eq('id', payload.new.sender_id)
            .single()

          const newMsg = { ...payload.new, sender: data }
          const msgs = get().messages
          if (!msgs.find(m => m.id === newMsg.id)) {
            set({ messages: [...msgs, newMsg] })
          }
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  },
}))
