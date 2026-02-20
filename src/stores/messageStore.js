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
  messagesLoading: false,
  messageAccess: null, // { allowed, reason, price }

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
    set({ messagesLoading: true })
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!sender_id(id, username, display_name, avatar_url, system_role)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (!error) {
      set({ messages: data || [], activeConversation: conversationId, messagesLoading: false })
    } else {
      set({ messagesLoading: false })
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
    const { data, error } = await supabase.rpc('start_or_get_conversation', {
      p_user_id: userId,
      p_other_user_id: otherUserId,
    })
    if (error) {
      console.error('Error starting conversation:', error)
      return null
    }
    return data
  },

  subscribeToMessages: (conversationId) => {
    // Clean up existing subscription for this conversation if it exists
    const channelName = `messages-${conversationId}`
    const existingChannel = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`)
    if (existingChannel) {
      supabase.removeChannel(existingChannel)
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          if (payload.eventType === 'UPDATE') {
            // Handle payment_status updates (payment request paid)
            set({
              messages: get().messages.map(m =>
                m.id === payload.new.id ? { ...m, ...payload.new } : m
              ),
            })
            return
          }

          if (payload.eventType === 'INSERT') {
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
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  },

  // Check if user can message another user (paywall check)
  checkMessageAccess: async (senderId, receiverId) => {
    const { data, error } = await supabase.rpc('check_message_access', {
      p_sender_id: senderId,
      p_receiver_id: receiverId,
    })
    if (error) {
      set({ messageAccess: { allowed: true, reason: 'error_fallback', price: 0 } })
      return { allowed: true, reason: 'error_fallback', price: 0 }
    }
    set({ messageAccess: data })
    return data
  },

  // Pay the message unlock fee (paywall)
  payMessageUnlock: async (senderId, receiverId, conversationId) => {
    const { data, error } = await supabase.rpc('pay_message_unlock', {
      p_sender_id: senderId,
      p_receiver_id: receiverId,
      p_conversation_id: conversationId,
    })
    if (error) throw error
    // After paying, recheck access
    await get().checkMessageAccess(senderId, receiverId)
    return data
  },

  // Creator sends a payment request
  sendPaymentRequest: async (conversationId, senderId, amount, note) => {
    const now = Date.now()
    if (now - _lastSendTime < SEND_THROTTLE_MS) return null
    _lastSendTime = now

    const { data, error } = await supabase.rpc('send_payment_request', {
      p_conversation_id: conversationId,
      p_sender_id: senderId,
      p_amount: amount,
      p_note: note || null,
    })

    if (error) throw error
    if (!data?.success) throw new Error(data?.error || 'Failed to send payment request')

    // Build optimistic message from RPC response
    const msg = {
      id: data.message_id,
      conversation_id: data.conversation_id,
      sender_id: data.sender_id,
      content: data.content,
      message_type: data.message_type,
      payment_status: data.payment_status,
      payment_amount: data.payment_amount,
      payment_note: data.payment_note,
      created_at: data.created_at,
    }
    set({ messages: [...get().messages, msg] })
    return msg
  },

  // User pays a payment request
  payMessageRequest: async (payerId, messageId) => {
    const { data, error } = await supabase.rpc('pay_message_request', {
      p_payer_id: payerId,
      p_message_id: messageId,
    })
    if (error) throw error
    if (!data?.success) throw new Error(data?.error || 'Payment failed')

    // Optimistically update the message status locally
    set({
      messages: get().messages.map(m =>
        m.id === messageId ? { ...m, payment_status: 'paid' } : m
      ),
    })
    return data
  },
}))
