import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useMessageStore } from '../../stores/messageStore'
import Avatar from '../../components/ui/Avatar'
import { PageLoader } from '../../components/ui/Spinner'
import { Send, ArrowLeft, ShieldCheck } from 'lucide-react'
import { formatMessageTime, cn } from '../../lib/utils'

function ConversationList({ conversations, activeId, onSelect }) {
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
      {conversations.map(conv => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className={cn(
            'w-full flex items-center gap-3 p-4 hover:bg-zinc-900/40 transition-colors text-left cursor-pointer',
            activeId === conv.id && 'bg-zinc-900/40'
          )}
        >
          <Avatar
            src={conv.otherUser?.avatar_url}
            alt={conv.otherUser?.display_name}
            size="lg"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-sm text-white truncate">
                  {conv.otherUser?.display_name || 'Unknown'}
                </span>
                {conv.otherUser?.is_verified && <ShieldCheck size={13} className="text-indigo-400" />}
              </div>
              <span className="text-[11px] text-zinc-600">
                {formatMessageTime(conv.lastMessage?.created_at)}
              </span>
            </div>
            <p className="text-xs text-zinc-500 truncate mt-0.5">
              {conv.lastMessage?.content || 'No messages'}
            </p>
          </div>
          {conv.unreadCount > 0 && (
            <div className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-white">{conv.unreadCount}</span>
            </div>
          )}
        </button>
      ))}
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
          return (
            <div key={msg.id} className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
              <div className="flex items-end gap-2 max-w-[75%]">
                {!isOwn && (
                  <Avatar src={msg.sender?.avatar_url} alt={msg.sender?.display_name} size="sm" />
                )}
                <div
                  className={cn(
                    'px-4 py-2.5 rounded-2xl text-sm',
                    isOwn
                      ? 'bg-indigo-600 text-white rounded-br-md'
                      : 'bg-zinc-800 text-zinc-200 rounded-bl-md'
                  )}
                >
                  <p className="break-words">{msg.content}</p>
                  <p className={cn('text-[10px] mt-1', isOwn ? 'text-indigo-200' : 'text-zinc-500')}>
                    {formatMessageTime(msg.created_at)}
                  </p>
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
  const { conversations, loading, fetchConversations, activeConversation } = useMessageStore()
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    if (user) fetchConversations(user.id)
  }, [user])

  if (loading) return <PageLoader />

  return (
    <div className="flex h-[calc(100vh-0px)] md:h-screen">
      {/* Conversation List */}
      <div className={cn(
        'w-full md:w-80 border-r border-zinc-800/50 flex flex-col',
        selectedId && 'hidden md:flex'
      )}>
        <header className="sticky top-0 z-10 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
          <h1 className="text-xl font-bold text-white">Messages</h1>
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
                return conv?.otherUser ? (
                  <div className="flex items-center gap-3">
                    <Avatar src={conv.otherUser.avatar_url} alt={conv.otherUser.display_name} size="md" />
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-sm">{conv.otherUser.display_name}</span>
                        {conv.otherUser.is_verified && <ShieldCheck size={13} className="text-indigo-400" />}
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
