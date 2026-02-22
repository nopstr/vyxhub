import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { MESSAGES_PAGE_SIZE } from '../lib/constants'

// Throttle guard for sendMessage — prevents accidental double-sends
let _lastSendTime = 0
const SEND_THROTTLE_MS = 800

export const useMessageStore = create((set, get) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  loading: false,
  messagesLoading: false,
  hasMoreMessages: false,
  messageAccess: null, // { allowed, reason, price }
  typingUsers: {}, // { [conversationId]: { [userId]: timestamp } }
  searchResults: [],
  searching: false,

  // ─── Conversations ─────────────────────────────────────────────────────

  fetchConversations: async (userId) => {
    set({ loading: true })

    const { data: myParticipations, error } = await supabase
      .from('conversation_participants')
      .select(`
        conversation_id,
        last_read_at,
        voice_video_approved,
        conversation:conversations(id, updated_at)
      `)
      .eq('user_id', userId)

    if (error || !myParticipations?.length) {
      set({ conversations: [], loading: false })
      return
    }

    const conversationIds = myParticipations.map(cp => cp.conversation_id)

    // Batch: fetch all other participants
    const { data: allParticipants } = await supabase
      .from('conversation_participants')
      .select('conversation_id, voice_video_approved, user:profiles!user_id(id, username, display_name, avatar_url, is_verified, is_creator, system_role, read_receipts_enabled)')
      .in('conversation_id', conversationIds)
      .neq('user_id', userId)

    // Batch: fetch last message per conversation
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('conversation_id, content, created_at, sender_id, sender_system_role, is_system_message, message_type')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })

    // Batch: fetch unread counts
    const { data: unreadRows } = await supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', conversationIds)
      .eq('is_read', false)
      .neq('sender_id', userId)

    // Index participants
    const participantsByConv = {}
    allParticipants?.forEach(p => {
      if (!participantsByConv[p.conversation_id]) {
        participantsByConv[p.conversation_id] = []
      }
      participantsByConv[p.conversation_id].push({ ...p.user, voice_video_approved: p.voice_video_approved })
    })

    // Index last message
    const lastMessageByConv = {}
    recentMessages?.forEach(m => {
      if (!lastMessageByConv[m.conversation_id]) {
        lastMessageByConv[m.conversation_id] = m
      }
    })

    // Count unread
    const unreadByConv = {}
    unreadRows?.forEach(m => {
      unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] || 0) + 1
    })

    const enriched = myParticipations
      .map(cp => ({
        id: cp.conversation_id,
        otherUser: participantsByConv[cp.conversation_id]?.[0] || null,
        lastMessage: lastMessageByConv[cp.conversation_id] || null,
        unreadCount: unreadByConv[cp.conversation_id] || 0,
        lastReadAt: cp.last_read_at,
        updatedAt: cp.conversation?.updated_at,
        myVoiceVideoApproved: cp.voice_video_approved,
      }))
      .sort((a, b) => {
        const aTime = a.lastMessage?.created_at || a.updatedAt || ''
        const bTime = b.lastMessage?.created_at || b.updatedAt || ''
        return bTime.localeCompare(aTime)
      })

    set({ conversations: enriched, loading: false })
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

  // ─── Messages (Paginated) ─────────────────────────────────────────────

  fetchMessages: async (conversationId) => {
    set({ messagesLoading: true })
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!sender_id(id, username, display_name, avatar_url, system_role),
        reactions:message_reactions(id, emoji, user_id)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_PAGE_SIZE)

    if (!error) {
      const msgs = (data || []).reverse()
      set({
        messages: msgs,
        activeConversation: conversationId,
        messagesLoading: false,
        hasMoreMessages: (data?.length || 0) >= MESSAGES_PAGE_SIZE,
      })
    } else {
      set({ messagesLoading: false })
    }
  },

  fetchOlderMessages: async (conversationId) => {
    const { messages: currentMessages } = get()
    if (!currentMessages.length) return

    const oldestCreatedAt = currentMessages[0]?.created_at
    if (!oldestCreatedAt) return

    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!sender_id(id, username, display_name, avatar_url, system_role),
        reactions:message_reactions(id, emoji, user_id)
      `)
      .eq('conversation_id', conversationId)
      .lt('created_at', oldestCreatedAt)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_PAGE_SIZE)

    if (!error && data?.length) {
      const olderMsgs = data.reverse()
      set({
        messages: [...olderMsgs, ...currentMessages],
        hasMoreMessages: data.length >= MESSAGES_PAGE_SIZE,
      })
    } else {
      set({ hasMoreMessages: false })
    }
  },

  // ─── Send Messages ────────────────────────────────────────────────────

  sendMessage: async (conversationId, senderId, content) => {
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
        sender:profiles!sender_id(id, username, display_name, avatar_url, system_role),
        reactions:message_reactions(id, emoji, user_id)
      `)
      .single()

    if (!error && data) {
      set({ messages: [...get().messages, data] })
    }
    return data
  },

  sendMediaMessage: async (conversationId, senderId, files, caption) => {
    const now = Date.now()
    if (now - _lastSendTime < SEND_THROTTLE_MS) return null
    _lastSendTime = now

    // Upload files to messages bucket
    const mediaUrls = []
    for (const file of files) {
      const ext = file.name?.split('.').pop() || 'bin'
      const path = `${senderId}/${conversationId}/${crypto.randomUUID()}.${ext}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('messages')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (uploadError) throw uploadError
      mediaUrls.push({
        path: uploadData.path,
        type: file.type,
        name: file.name,
      })
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content: caption || null,
        message_type: 'media',
        media_urls: mediaUrls,
      })
      .select(`
        *,
        sender:profiles!sender_id(id, username, display_name, avatar_url, system_role),
        reactions:message_reactions(id, emoji, user_id)
      `)
      .single()

    if (!error && data) {
      set({ messages: [...get().messages, data] })
    }
    return data
  },

  sendVoiceMessage: async (conversationId, senderId, audioBlob, duration) => {
    const now = Date.now()
    if (now - _lastSendTime < SEND_THROTTLE_MS) return null
    _lastSendTime = now

    const ext = audioBlob.type?.includes('mp4') ? 'mp4' : 'webm'
    const path = `${senderId}/${conversationId}/${crypto.randomUUID()}.${ext}`
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('messages')
      .upload(path, audioBlob, { cacheControl: '3600', upsert: false, contentType: audioBlob.type })
    if (uploadError) throw uploadError

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content: 'Voice message',
        message_type: 'voice',
        media_urls: [{ path: uploadData.path, type: audioBlob.type, name: `voice.${ext}` }],
        media_duration: Math.round(duration),
      })
      .select(`
        *,
        sender:profiles!sender_id(id, username, display_name, avatar_url, system_role),
        reactions:message_reactions(id, emoji, user_id)
      `)
      .single()

    if (!error && data) {
      set({ messages: [...get().messages, data] })
    }
    return data
  },

  // ─── Payment Requests ─────────────────────────────────────────────────

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
      reactions: [],
    }
    set({ messages: [...get().messages, msg] })
    return msg
  },

  // ─── Read Receipts ────────────────────────────────────────────────────

  markAsRead: async (conversationId, userId) => {
    await supabase.rpc('mark_messages_read', {
      p_conversation_id: conversationId,
      p_user_id: userId,
    })
    set({
      conversations: get().conversations.map(c =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      ),
    })
  },

  // ─── Reactions ────────────────────────────────────────────────────────

  toggleReaction: async (messageId, userId, emoji) => {
    const { data, error } = await supabase.rpc('toggle_message_reaction', {
      p_message_id: messageId,
      p_user_id: userId,
      p_emoji: emoji,
    })
    if (error) throw error

    if (data?.action === 'added') {
      set({
        messages: get().messages.map(m =>
          m.id === messageId
            ? { ...m, reactions: [...(m.reactions || []), { id: crypto.randomUUID(), emoji, user_id: userId }] }
            : m
        ),
      })
    } else if (data?.action === 'removed') {
      set({
        messages: get().messages.map(m =>
          m.id === messageId
            ? { ...m, reactions: (m.reactions || []).filter(r => !(r.emoji === emoji && r.user_id === userId)) }
            : m
        ),
      })
    }
    return data
  },

  // ─── Search ───────────────────────────────────────────────────────────

  searchMessages: async (userId, query, conversationId = null) => {
    set({ searching: true })
    const { data, error } = await supabase.rpc('search_messages', {
      p_user_id: userId,
      p_query: query,
      ...(conversationId ? { p_conversation_id: conversationId } : {}),
    })
    set({ searchResults: error ? [] : (data || []), searching: false })
    return data || []
  },

  clearSearch: () => set({ searchResults: [], searching: false }),

  // ─── Typing Indicators ────────────────────────────────────────────────

  broadcastTyping: (conversationId, userId) => {
    const channelName = `typing-${conversationId}`
    // Re-use existing or create channel
    let channel = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`)
    if (!channel) {
      channel = supabase.channel(channelName)
      channel.subscribe()
    }
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, timestamp: Date.now() },
    })
  },

  subscribeToTyping: (conversationId, userId) => {
    const channelName = `typing-${conversationId}`
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`)
    if (existing) supabase.removeChannel(existing)

    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId === userId) return
        set(state => ({
          typingUsers: {
            ...state.typingUsers,
            [conversationId]: {
              ...state.typingUsers[conversationId],
              [payload.userId]: payload.timestamp,
            },
          },
        }))
        setTimeout(() => {
          set(state => {
            const convTyping = { ...state.typingUsers[conversationId] }
            if (convTyping[payload.userId] === payload.timestamp) {
              delete convTyping[payload.userId]
            }
            return { typingUsers: { ...state.typingUsers, [conversationId]: convTyping } }
          })
        }, 3000)
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  },

  // ─── Voice/Video Approval ─────────────────────────────────────────────

  approveVoiceVideo: async (conversationId, targetUserId, approved = true) => {
    const { data, error } = await supabase.rpc('approve_voice_video', {
      p_conversation_id: conversationId,
      p_target_user_id: targetUserId,
      p_approved: approved,
    })
    if (error) throw error
    if (!data?.success) throw new Error(data?.error || 'Failed')

    set({
      conversations: get().conversations.map(c =>
        c.id === conversationId
          ? { ...c, otherUser: c.otherUser ? { ...c.otherUser, voice_video_approved: approved } : c.otherUser }
          : c
      ),
    })
    return data
  },

  // ─── Realtime Subscriptions ───────────────────────────────────────────

  subscribeToMessages: (conversationId) => {
    const channelName = `messages-${conversationId}`
    const existingChannel = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`)
    if (existingChannel) supabase.removeChannel(existingChannel)

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
              .select('id, username, display_name, avatar_url, system_role')
              .eq('id', payload.new.sender_id)
              .single()

            const newMsg = { ...payload.new, sender: data, reactions: [] }
            const msgs = get().messages
            if (!msgs.find(m => m.id === newMsg.id)) {
              set({ messages: [...msgs, newMsg] })
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        async (payload) => {
          const messageId = payload.new?.message_id || payload.old?.message_id
          if (!messageId) return

          const { data: reactions } = await supabase
            .from('message_reactions')
            .select('id, emoji, user_id')
            .eq('message_id', messageId)

          set({
            messages: get().messages.map(m =>
              m.id === messageId ? { ...m, reactions: reactions || [] } : m
            ),
          })
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  },

  // ─── Message Access (Paywall) ─────────────────────────────────────────

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

  // ─── Media URL Resolution ─────────────────────────────────────────────

  getSignedMediaUrl: async (path) => {
    if (!path) return null
    const { data, error } = await supabase.storage
      .from('messages')
      .createSignedUrl(path, 3600)
    if (error) return null
    return data?.signedUrl || null
  },
}))
