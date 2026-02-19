import { create } from 'zustand'
import { supabase } from '../lib/supabase'

// Throttle guard for sendMessage — prevents accidental double-sends
let _lastSendTime = 0
const SEND_THROTTLE_MS = 800

export const useMessageStore = create((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  loading: false,

  fetchConversations: async (userId) => {
    set({ loading: true })

    // Single query: get all conversations with participants and last message
    // This replaces the N+1 pattern (3 queries per conversation)
    const { data: myParticipations, error } = await supabase
      .from('conversation_participants')
      .select(`
        conversation_id,
        last_read_at,
        conversation:conversations(id, updated_at)
      `)
      .eq('user_id', userId)

    if (error || !myParticipations?.length) {
      set({ conversations: [], loading: false })
      return
    }

    const conversationIds = myParticipations.map(cp => cp.conversation_id)

    // Batch: fetch all other participants for all conversations at once
    const { data: allParticipants } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user:profiles!user_id(id, username, display_name, avatar_url, is_verified, system_role)')
      .in('conversation_id', conversationIds)
      .neq('user_id', userId)

    // Batch: fetch last message per conversation using a single query
    // We get recent messages for all conversations, then pick the latest per conv
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('conversation_id, content, created_at, sender_id, sender_system_role, is_system_message')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })

    // Batch: fetch unread counts for all conversations at once
    const { data: unreadRows } = await supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', conversationIds)
      .eq('is_read', false)
      .neq('sender_id', userId)

    // Index participants by conversation_id
    const participantsByConv = {}
    allParticipants?.forEach(p => {
      if (!participantsByConv[p.conversation_id]) {
        participantsByConv[p.conversation_id] = []
      }
      participantsByConv[p.conversation_id].push(p.user)
    })

    // Index last message by conversation_id (first occurrence = latest due to ORDER BY)
    const lastMessageByConv = {}
    recentMessages?.forEach(m => {
      if (!lastMessageByConv[m.conversation_id]) {
        lastMessageByConv[m.conversation_id] = m
      }
    })

    // Count unread per conversation
    const unreadByConv = {}
    unreadRows?.forEach(m => {
      unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] || 0) + 1
    })

    // Assemble enriched conversation list
    const enriched = myParticipations
      .map(cp => ({
        id: cp.conversation_id,
        otherUser: participantsByConv[cp.conversation_id]?.[0] || null,
        lastMessage: lastMessageByConv[cp.conversation_id] || null,
        unreadCount: unreadByConv[cp.conversation_id] || 0,
        lastReadAt: cp.last_read_at,
        updatedAt: cp.conversation?.updated_at,
      }))
      .sort((a, b) => {
        // Sort by last message time descending, falling back to updatedAt
        const aTime = a.lastMessage?.created_at || a.updatedAt || ''
        const bTime = b.lastMessage?.created_at || b.updatedAt || ''
        return bTime.localeCompare(aTime)
      })

    set({ conversations: enriched, loading: false })
  },

  fetchMessages: async (conversationId) => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!sender_id(id, username, display_name, avatar_url, system_role)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (!error) {
      set({ messages: data || [], activeConversation: conversationId, loading: false })
    }
  },

  sendMessage: async (conversationId, senderId, content) => {
    // Throttle: prevent double-sends within 800ms
    const now = Date.now()
    if (now - _lastSendTime < SEND_THROTTLE_MS) return null
    _lastSendTime = now

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content,
      })
      .select(`
        *,
        sender:profiles!sender_id(id, username, display_name, avatar_url, system_role)
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
