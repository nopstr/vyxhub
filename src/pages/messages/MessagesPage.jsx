import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useMessageStore } from '../../stores/messageStore'
import { supabase } from '../../lib/supabase'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import { PageLoader } from '../../components/ui/Spinner'
import { Send, ArrowLeft, ShieldCheck, PenSquare, Search, X, Crown, Shield, DollarSign, Lock, CheckCircle, CreditCard } from 'lucide-react'
import { formatMessageTime, cn, formatCurrency } from '../../lib/utils'
import { CEO_USERNAME, PLATFORM_FEE_PERCENT } from '../../lib/constants'
import { toast } from 'sonner'

function NewMessageModal({ onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [defaultUsers, setDefaultUsers] = useState([])
  const [unlockedIds, setUnlockedIds] = useState([])
  const [searching, setSearching] = useState(false)
  const [loadingDefaults, setLoadingDefaults] = useState(true)
  const { user, profile } = useAuthStore()
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    async function loadDefaults() {
      setLoadingDefaults(true)
      try {
        const [followsRes, subsRes, unlocksRes] = await Promise.all([
          supabase.from('follows').select('following_id').eq('follower_id', user.id),
          supabase.from('subscriptions').select('creator_id').eq('subscriber_id', user.id).eq('status', 'active'),
          supabase.from('transactions').select('to_user_id').eq('from_user_id', user.id).eq('transaction_type', 'message_unlock').eq('status', 'completed')
        ])

        const followIds = followsRes.data?.map(f => f.following_id) || []
        const subIds = subsRes.data?.map(s => s.creator_id) || []
        const unlockIds = unlocksRes.data?.map(u => u.to_user_id) || []
        setUnlockedIds(unlockIds)

        const targetIds = [...new Set([...followIds, ...subIds, ...unlockIds])]

        if (targetIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url, is_verified, is_creator, message_price, allow_free_messages')
            .in('id', targetIds)
          
          // Mark subscribed users so we know they don't have to pay
          const profilesWithSub = profiles?.map(p => ({
            ...p,
            isSubscribed: subIds.includes(p.id)
          })) || []
          
          setDefaultUsers(profilesWithSub)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingDefaults(false)
      }
    }
    loadDefaults()
  }, [user.id])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }

    const timer = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_verified, is_creator, message_price, allow_free_messages')
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .neq('id', user.id)
        .limit(10)
      setResults(data || [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, user.id])

  const displayUsers = query.length >= 2 ? results : defaultUsers

  const renderUser = (u) => {
    // Determine if there's a paywall
    // If sender is creator, it's free. If receiver is not creator, it's free.
    // If subscribed, it's free. If allow_free_messages, it's free.
    const isUnlocked = unlockedIds.includes(u.id)
    const isFree = profile?.is_creator || !u.is_creator || u.isSubscribed || isUnlocked || u.allow_free_messages || !u.message_price || u.message_price <= 0
    const showPaywall = !isFree

    return (
      <button
        key={u.id}
        onClick={() => onSelect({ ...u, isFree })}
        className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <Avatar src={u.avatar_url} alt={u.display_name} size="md" />
          <div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-white">{u.display_name}</span>
              {u.is_verified && <ShieldCheck size={13} className="text-indigo-400" />}
            </div>
            <span className="text-xs text-zinc-500">@{u.username}</span>
          </div>
        </div>
        {showPaywall && (
          <div className="flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">
            <Lock size={12} />
            {formatCurrency(u.message_price)}
          </div>
        )}
      </button>
    )
  }

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
          {!searching && query.length < 2 && loadingDefaults && (
            <div className="p-4 text-center text-sm text-zinc-500">Loading...</div>
          )}
          {!searching && query.length < 2 && !loadingDefaults && defaultUsers.length === 0 && (
            <div className="p-4 text-center text-sm text-zinc-500">Type at least 2 characters to search</div>
          )}
          {displayUsers.map(renderUser)}
        </div>
      </div>
    </div>
  )
}
import EmptyState from '../../components/ui/EmptyState'
import { MessageSquare } from 'lucide-react'

function ConversationList({ conversations, activeId, onSelect }) {
  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No messages yet"
        description="Start a conversation with a creator or friend."
        className="h-full"
      />
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

function PaymentRequestBubble({ msg, isOwn, userId }) {
  const { payMessageRequest } = useMessageStore()
  const [paying, setPaying] = useState(false)
  const isPaid = msg.payment_status === 'paid'
  const canPay = !isOwn && !isPaid

  const handlePay = async () => {
    if (paying) return
    setPaying(true)
    try {
      await payMessageRequest(userId, msg.id)
      toast.success(`Paid $${parseFloat(msg.payment_amount).toFixed(2)}!`)
    } catch (err) {
      toast.error(err.message || 'Payment failed')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className={cn(
      'rounded-2xl overflow-hidden border min-w-[220px] max-w-[300px]',
      isPaid
        ? 'border-emerald-500/40 bg-emerald-500/10'
        : 'border-indigo-500/30 bg-zinc-900/80',
      isOwn ? 'rounded-br-md' : 'rounded-bl-md'
    )}>
      {/* Header */}
      <div className={cn(
        'px-4 py-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider',
        isPaid ? 'bg-emerald-500/15 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'
      )}>
        {isPaid ? <CheckCircle size={13} /> : <DollarSign size={13} />}
        {isPaid ? 'Payment Complete' : 'Payment Request'}
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {msg.payment_note && (
          <p className="text-sm text-zinc-300 mb-2">{msg.payment_note}</p>
        )}
        <p className={cn(
          'text-2xl font-bold',
          isPaid ? 'text-emerald-400' : 'text-white'
        )}>
          ${parseFloat(msg.payment_amount).toFixed(2)}
        </p>
        {!isPaid && !isOwn && (
          <p className="text-[10px] text-zinc-500 mt-1">
            Platform fee: {PLATFORM_FEE_PERCENT}%
          </p>
        )}
      </div>

      {/* Action */}
      {canPay && (
        <div className="px-4 pb-3">
          <button
            onClick={handlePay}
            disabled={paying}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {paying ? (
              <span>Processing...</span>
            ) : (
              <>
                <CreditCard size={15} />
                Pay ${parseFloat(msg.payment_amount).toFixed(2)}
              </>
            )}
          </button>
        </div>
      )}

      {isPaid && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
            <CheckCircle size={13} />
            {isOwn ? 'Payment received' : 'You paid this request'}
          </div>
        </div>
      )}

      {/* Pending for sender */}
      {isOwn && !isPaid && (
        <div className="px-4 pb-3">
          <p className="text-xs text-zinc-500 flex items-center gap-1">
            <Lock size={11} /> Waiting for payment
          </p>
        </div>
      )}

      <div className="px-4 pb-2">
        <p className="text-[10px] text-zinc-600">{formatMessageTime(msg.created_at)}</p>
      </div>
    </div>
  )
}

function PaymentRequestModal({ onClose, onSend }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const parsed = parseFloat(amount)
    if (!parsed || parsed < 1 || parsed > 5000) {
      toast.error('Amount must be between $1 and $5,000')
      return
    }
    setLoading(true)
    try {
      await onSend(parsed, note.trim())
      onClose()
    } catch {
      toast.error('Failed to send payment request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="font-bold text-white flex items-center gap-2">
            <DollarSign size={18} className="text-indigo-400" />
            Send Payment Request
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 cursor-pointer">
            <X size={18} className="text-zinc-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Amount</label>
            <div className="relative">
              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="number"
                min="1"
                max="5000"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25.00"
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                autoFocus
              />
            </div>
            {amount && parseFloat(amount) > 0 && (
              <p className="text-xs text-zinc-500 mt-1">
                You earn <span className="text-emerald-400">${(parseFloat(amount) * (100 - PLATFORM_FEE_PERCENT) / 100).toFixed(2)}</span> after {PLATFORM_FEE_PERCENT}% fee
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Custom photo set request"
              maxLength={200}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
          <Button type="submit" loading={loading} className="w-full" disabled={!amount || parseFloat(amount) < 1}>
            Send Request
          </Button>
        </form>
      </div>
    </div>
  )
}

function MessageThread({ conversationId, userId, otherUser }) {
  const {
    messages, fetchMessages, sendMessage, subscribeToMessages,
    checkMessageAccess, payMessageUnlock, sendPaymentRequest,
    messageAccess,
  } = useMessageStore()
  const { profile } = useAuthStore()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const bottomRef = useRef(null)
  const isCreator = profile?.is_creator

  useEffect(() => {
    fetchMessages(conversationId)
    const unsub = subscribeToMessages(conversationId)
    // Check message access for this conversation partner
    if (otherUser?.id) {
      checkMessageAccess(userId, otherUser.id)
    }
    return unsub
  }, [conversationId, otherUser?.id])

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

  const handleUnlockMessages = async () => {
    setUnlocking(true)
    try {
      await payMessageUnlock(userId, otherUser.id, conversationId)
      toast.success('Messages unlocked!')
    } catch (err) {
      toast.error(err.message || 'Failed to unlock')
    } finally {
      setUnlocking(false)
    }
  }

  const handleSendPaymentRequest = async (amount, note) => {
    await sendPaymentRequest(conversationId, userId, amount, note)
    toast.success('Payment request sent!')
  }

  const needsPaywall = messageAccess && !messageAccess.allowed && messageAccess.reason === 'paywall'
  const paywallPrice = messageAccess?.price || 0

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map(msg => {
          const isOwn = msg.sender_id === userId
          const senderRole = msg.sender_system_role || msg.sender?.system_role
          const isCeoMsg = msg.sender?.username === CEO_USERNAME
          const isStaffMsg = !!senderRole && !isCeoMsg
          const isPaymentRequest = msg.message_type === 'payment_request'

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

                  {/* Payment request embed */}
                  {isPaymentRequest ? (
                    <PaymentRequestBubble msg={msg} isOwn={isOwn} userId={userId} />
                  ) : (
                    /* Regular message bubble */
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
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Paywall gate */}
      {needsPaywall ? (
        <div className="p-4 border-t border-zinc-800/50">
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 text-center">
            <Lock size={24} className="text-indigo-400 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-white mb-1">Message Locked</h4>
            <p className="text-xs text-zinc-500 mb-4">
              Pay <span className="text-white font-semibold">${parseFloat(paywallPrice).toFixed(2)}</span> to unlock messaging with this creator
            </p>
            <button
              onClick={handleUnlockMessages}
              disabled={unlocking}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
            >
              {unlocking ? 'Processing...' : (
                <>
                  <CreditCard size={16} />
                  Unlock for ${parseFloat(paywallPrice).toFixed(2)}
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Normal input + creator payment request button */
        <form onSubmit={handleSend} className="p-4 border-t border-zinc-800/50">
          <div className="flex items-center gap-2">
            {/* Creator: payment request button */}
            {isCreator && (
              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                className="p-3 rounded-xl text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer flex-shrink-0"
                title="Send payment request"
              >
                <DollarSign size={18} />
              </button>
            )}
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
      )}

      {/* Payment Request Modal */}
      {showPaymentModal && (
        <PaymentRequestModal
          onClose={() => setShowPaymentModal(false)}
          onSend={handleSendPaymentRequest}
        />
      )}
    </div>
  )
}

export default function MessagesPage() {
  const { user, profile } = useAuthStore()
  const { conversations, loading, fetchConversations, startConversation } = useMessageStore()
  const [selectedId, setSelectedId] = useState(null)
  const [showNewMessage, setShowNewMessage] = useState(false)
  const [paywallUser, setPaywallUser] = useState(null)
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
            <MessageThread
              conversationId={selectedId}
              userId={user.id}
              otherUser={conversations.find(c => c.id === selectedId)?.otherUser}
            />
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

      {/* New Message Modal */}
      {showNewMessage && (
        <NewMessageModal
          onClose={() => setShowNewMessage(false)}
          onSelect={(u) => {
            if (!u.isFree) {
              setPaywallUser(u)
              setShowNewMessage(false)
            } else {
              handleNewMessage(u)
            }
          }}
        />
      )}

      {/* Paywall Modal */}
      {paywallUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setPaywallUser(null)} />
          <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 text-center">
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock size={32} className="text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Unlock Messages</h3>
            <p className="text-zinc-400 mb-6">
              Pay a one-time fee of <span className="text-white font-bold">{formatCurrency(paywallUser.message_price)}</span> to start a conversation with @{paywallUser.username}.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setPaywallUser(null)}>Cancel</Button>
              <Button variant="primary" className="flex-1" onClick={async () => {
                try {
                  const { data, error } = await supabase.rpc('pay_message_unlock', {
                    p_sender_id: user.id,
                    p_receiver_id: paywallUser.id,
                    p_conversation_id: null // Will be linked later if needed
                  })
                  if (error) throw error
                  toast.success('Messages unlocked!')
                  handleNewMessage(paywallUser)
                  setPaywallUser(null)
                } catch (err) {
                  toast.error(err.message || 'Payment failed')
                }
              }}>
                Pay {formatCurrency(paywallUser.message_price)}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
