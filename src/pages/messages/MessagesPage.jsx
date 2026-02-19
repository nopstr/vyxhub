import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useMessageStore } from '../../stores/messageStore'
import { supabase } from '../../lib/supabase'
import Avatar from '../../components/ui/Avatar'
import { PageLoader } from '../../components/ui/Spinner'
import { Send, ArrowLeft, ShieldCheck, PenSquare, Search, X, Crown, Shield } from 'lucide-react'
import { formatMessageTime, cn } from '../../lib/utils'
import { CEO_USERNAME, SYSTEM_ROLES } from '../../lib/constants'

function NewMessageModal({ onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const { user } = useAuthStore()
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }

    const timer = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_verified')
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .neq('id', user.id)
        .limit(10)
      setResults(data || [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-zinc-800">
          <Search size={18} className="text-zinc-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search users..."
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
          />
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 cursor-pointer">
            <X size={18} className="text-zinc-500" />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {searching && (
            <div className="p-4 text-center text-sm text-zinc-500">Searching...</div>
          )}
          {!searching && query.length >= 2 && results.length === 0 && (
            <div className="p-4 text-center text-sm text-zinc-500">No users found</div>
          )}
          {results.map(u => (
            <button
              key={u.id}
              onClick={() => onSelect(u)}
              className="w-full flex items-center gap-3 p-4 hover:bg-zinc-800/50 transition-colors text-left cursor-pointer"
            >
              <Avatar src={u.avatar_url} alt={u.display_name} size="md" />
              <div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-semibold text-white">{u.display_name}</span>
                  {u.is_verified && <ShieldCheck size={13} className="text-indigo-400" />}
                </div>
                <span className="text-xs text-zinc-500">@{u.username}</span>
              </div>
            </button>
          ))}
          {!searching && query.length < 2 && (
            <div className="p-4 text-center text-sm text-zinc-500">Type at least 2 characters to search</div>
          )}
        </div>
      </div>

      {/* New Message Modal */}
      {showNewMessage && (
        <NewMessageModal
          onClose={() => setShowNewMessage(false)}
          onSelect={handleNewMessage}
        />
      )}
    </div>
  )
}function ConversationList({ conversations, activeId, onSelect }) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-16 h-16 bg-zinc-800/50 rounded-3xl flex items-center justify-center mb-4">
          <Send size={28} className="text-zinc-600" />
        </div>
        <h3 className="text-lg font-bold text-zinc-300 mb-1">No messages yet</h3>
        <p className="text-sm text-zinc-500">Start a conversation from a creator's profile</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-zinc-800/50">
      {conversations.map(conv => {
        const isCeo = conv.otherUser?.username === CEO_USERNAME
        const isStaff = !!conv.otherUser?.system_role
        const hasStaffMessage = conv.lastMessage?.sender_system_role

        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={cn(
              'w-full flex items-center gap-3 p-4 hover:bg-zinc-900/40 transition-colors text-left cursor-pointer',
              activeId === conv.id && 'bg-zinc-900/40',
              isCeo && conv.unreadCount > 0 && 'bg-amber-500/5 hover:bg-amber-500/10',
              isStaff && !isCeo && conv.unreadCount > 0 && 'bg-purple-500/5 hover:bg-purple-500/10'
            )}
          >
            <div className="relative">
              <Avatar
                src={conv.otherUser?.avatar_url}
                alt={conv.otherUser?.display_name}
                size="lg"
              />
              {isCeo && (
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center border-2 border-[#050505]">
                  <Crown size={10} className="text-black" />
                </div>
              )}
              {isStaff && !isCeo && (
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center border-2 border-[#050505]">
                  <Shield size={10} className="text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className={cn(
                    'font-semibold text-sm truncate',
                    isCeo ? 'text-amber-400' : isStaff ? 'text-purple-400' : 'text-white'
                  )}>
                    {conv.otherUser?.display_name || 'Unknown'}
                  </span>
                  {conv.otherUser?.is_verified && <ShieldCheck size={13} className="text-indigo-400" />}
                  {isCeo && <span className="text-[9px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full ml-1">CEO</span>}
                  {isStaff && !isCeo && <span className="text-[9px] font-bold bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full ml-1">STAFF</span>}
                </div>
                <span className="text-[11px] text-zinc-600">
                  {formatMessageTime(conv.lastMessage?.created_at)}
                </span>
              </div>
              <p className={cn(
                'text-xs truncate mt-0.5',
                hasStaffMessage ? 'text-purple-400' : 'text-zinc-500'
              )}>
                {conv.lastMessage?.content || 'No messages'}
              </p>
            </div>
            {conv.unreadCount > 0 && (
              <div className={cn(
                'min-w-[20px] h-5 rounded-full flex items-center justify-center flex-shrink-0 px-1',
                isCeo ? 'bg-amber-500' : isStaff ? 'bg-purple-500' : 'bg-indigo-500'
              )}>
                <span className="text-[10px] font-bold text-white">
                  {isCeo ? 'CEO' : conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                </span>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

function MessageThread({ conversationId, userId }) {
  const { messages, fetchMessages, sendMessage, subscribeToMessages } = useMessageStore()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    fetchMessages(conversationId)
    const unsub = subscribeToMessages(conversationId)
    return unsub
  }, [conversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await sendMessage(conversationId, userId, text.trim())
      setText('')
    } catch {
      // Error handled by store
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => {
          const isOwn = msg.sender_id === userId
          const senderRole = msg.sender_system_role || msg.sender?.system_role
          const isCeoMsg = msg.sender?.username === CEO_USERNAME
          const isStaffMsg = !!senderRole && !isCeoMsg
          return (
            <div key={msg.id} className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
              <div className="flex items-end gap-2 max-w-[75%]">
                {!isOwn && (
                  <div className="relative">
                    <Avatar src={msg.sender?.avatar_url} alt={msg.sender?.display_name} size="sm" />
                    {isCeoMsg && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center">
                        <Crown size={7} className="text-black" />
                      </div>
                    )}
                  </div>
                )}
                <div>
                  {/* Staff label above bubble */}
                  {!isOwn && (isCeoMsg || isStaffMsg) && (
                    <p className={cn(
                      'text-[10px] font-bold mb-0.5 ml-1',
                      isCeoMsg ? 'text-amber-400' : 'text-purple-400'
                    )}>
                      {isCeoMsg ? 'CEO' : senderRole.toUpperCase()}
                    </p>
                  )}
                  <div
                    className={cn(
                      'px-4 py-2.5 rounded-2xl text-sm',
                      isOwn
                        ? 'bg-indigo-600 text-white rounded-br-md'
                        : isCeoMsg
                          ? 'bg-amber-500/15 text-amber-100 border border-amber-500/30 rounded-bl-md'
                          : isStaffMsg
                            ? 'bg-purple-500/15 text-purple-100 border border-purple-500/30 rounded-bl-md'
                            : 'bg-zinc-800 text-zinc-200 rounded-bl-md'
                    )}
                  >
                    <p className="break-words">{msg.content}</p>
                    <p className={cn(
                      'text-[10px] mt-1',
                      isOwn ? 'text-indigo-200' :
                      isCeoMsg ? 'text-amber-400/60' :
                      isStaffMsg ? 'text-purple-400/60' : 'text-zinc-500'
                    )}>
                      {formatMessageTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-4 border-t border-zinc-800/50">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-indigo-500/50"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="p-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Send size={18} />
          </button>
        </div>
      </form>
    </div>
  )
}

export default function MessagesPage() {
  const { user } = useAuthStore()
  const { conversations, loading, fetchConversations, startConversation } = useMessageStore()
  const [selectedId, setSelectedId] = useState(null)
  const [showNewMessage, setShowNewMessage] = useState(false)
  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (user) fetchConversations(user.id)
  }, [user])

  // Auto-select conversation from URL query param (e.g. from ProfilePage DM button)
  useEffect(() => {
    const convId = searchParams.get('conv')
    if (convId) setSelectedId(convId)
  }, [searchParams])

  const handleNewMessage = async (selectedUser) => {
    if (!user) return
    setShowNewMessage(false)
    try {
      const convId = await startConversation(user.id, selectedUser.id)
      if (convId) {
        await fetchConversations(user.id)
        setSelectedId(convId)
      }
    } catch {
      // Silently fail — conversation list will reload
    }
  }

  if (loading) return <PageLoader />

  return (
    <div className="flex h-[calc(100vh-0px)] md:h-screen">
      {/* Conversation List */}
      <div className={cn(
        'w-full md:w-80 border-r border-zinc-800/50 flex flex-col',
        selectedId && 'hidden md:flex'
      )}>
        <header className="sticky top-0 z-10 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Messages</h1>
          <button
            onClick={() => setShowNewMessage(true)}
            className="p-2 rounded-xl hover:bg-zinc-800/50 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            title="New message"
          >
            <PenSquare size={20} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          <ConversationList
            conversations={conversations}
            activeId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      </div>

      {/* Thread */}
      <div className={cn(
        'flex-1 flex flex-col',
        !selectedId && 'hidden md:flex'
      )}>
        {selectedId ? (
          <>
            <header className="sticky top-0 z-10 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-3 flex items-center gap-3">
              <button
                onClick={() => setSelectedId(null)}
                className="md:hidden p-1 hover:bg-zinc-800 rounded-lg"
              >
                <ArrowLeft size={20} />
              </button>
              {(() => {
                const conv = conversations.find(c => c.id === selectedId)
                const isCeo = conv?.otherUser?.username === CEO_USERNAME
                const isStaff = !!conv?.otherUser?.system_role
                return conv?.otherUser ? (
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar src={conv.otherUser.avatar_url} alt={conv.otherUser.display_name} size="md" />
                      {isCeo && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center border border-[#050505]">
                          <Crown size={8} className="text-black" />
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className={cn('font-bold text-sm', isCeo ? 'text-amber-400' : isStaff ? 'text-purple-400' : '')}>
                          {conv.otherUser.display_name}
                        </span>
                        {conv.otherUser.is_verified && <ShieldCheck size={13} className="text-indigo-400" />}
                        {isCeo && <span className="text-[9px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">CEO</span>}
                        {isStaff && !isCeo && <span className="text-[9px] font-bold bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">STAFF</span>}
                      </div>
                      <span className="text-xs text-zinc-500">@{conv.otherUser.username}</span>
                    </div>
                  </div>
                ) : null
              })()}
            </header>
            <MessageThread conversationId={selectedId} userId={user.id} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Send size={48} className="text-zinc-700 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-zinc-400">Select a conversation</h3>
              <p className="text-sm text-zinc-600 mt-1">Choose a conversation to start chatting</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
