import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useMessageStore } from '../../stores/messageStore'
import { supabase } from '../../lib/supabase'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import ProtectedImage from '../../components/ui/ProtectedImage'
import { PageLoader } from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import {
  Send, ArrowLeft, ShieldCheck, PenSquare, Search, X, Crown, Shield,
  DollarSign, Lock, CheckCircle, CreditCard, MessageSquare, Image as ImageIcon,
  Mic, MicOff, Play, Pause, Square, Smile, Paperclip, ChevronUp, Check,
  CheckCheck, Video, Settings2, Volume2
} from 'lucide-react'
import { formatMessageTime, cn, formatCurrency } from '../../lib/utils'
import { CEO_USERNAME, PLATFORM_FEE_PERCENT, ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES } from '../../lib/constants'
import { toast } from 'sonner'
import PaymentModal from '../../components/PaymentModal'

// ─── Quick Emoji Reactions ──────────────────────────────────────────────────
const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👍']

// ─── Voice Recorder Hook ────────────────────────────────────────────────────
function useVoiceRecorder() {
  const [recording, setRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const streamRef = useRef(null)

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/mp4'
      const recorder = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.start(100)
      mediaRecorderRef.current = recorder
      setRecording(true)
      setDuration(0)
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    } catch {
      toast.error('Microphone access denied')
    }
  }, [])

  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        resolve(null)
        return
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        const dur = duration
        setRecording(false)
        clearInterval(timerRef.current)
        streamRef.current?.getTracks().forEach(t => t.stop())
        resolve({ blob, duration: dur })
      }
      recorder.stop()
    })
  }, [duration])

  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    setRecording(false)
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    chunksRef.current = []
  }, [])

  return { recording, duration, start, stop, cancel }
}

// ─── Signed URL Hook ────────────────────────────────────────────────────────
function useSignedUrl(path) {
  const [url, setUrl] = useState(null)
  const { getSignedMediaUrl } = useMessageStore()
  useEffect(() => {
    if (!path) return
    getSignedMediaUrl(path).then(setUrl)
  }, [path])
  return url
}

// ─── Voice Player Component ─────────────────────────────────────────────────
function VoicePlayer({ mediaUrls, duration: msgDuration }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const signedUrl = useSignedUrl(mediaUrls?.[0]?.path)

  const toggle = () => {
    if (!audioRef.current) return
    if (playing) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setPlaying(!playing)
  }

  const formatDur = (s) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-3 min-w-[180px]">
      <button onClick={toggle} className="w-9 h-9 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 cursor-pointer hover:bg-red-500/30 transition-colors">
        {playing ? <Pause size={16} className="text-red-400" /> : <Play size={16} className="text-red-400 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-[10px] text-zinc-500 mt-0.5">{formatDur(msgDuration || 0)}</p>
      </div>
      {signedUrl && (
        <audio
          ref={audioRef}
          src={signedUrl}
          onTimeUpdate={() => {
            if (audioRef.current?.duration) {
              setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100)
            }
          }}
          onEnded={() => { setPlaying(false); setProgress(0) }}
          preload="metadata"
        />
      )}
    </div>
  )
}

// ─── Media Display Component ────────────────────────────────────────────────
function MediaContent({ mediaUrls }) {
  if (!mediaUrls?.length) return null

  return (
    <div className={cn('grid gap-1.5', mediaUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
      {mediaUrls.map((media, i) => (
        <MediaItem key={i} media={media} />
      ))}
    </div>
  )
}

function MediaItem({ media }) {
  const url = useSignedUrl(media.path)
  const isVideo = media.type?.startsWith('video/')

  if (!url) {
    return <div className="w-full aspect-square bg-zinc-800 rounded-xl animate-pulse" />
  }

  if (isVideo) {
    return (
      <video
        src={url}
        controls
        controlsList="nodownload"
        disablePictureInPicture
        className="w-full max-h-64 rounded-xl object-cover bg-black"
        preload="metadata"
        onContextMenu={(e) => e.preventDefault()}
        draggable={false}
      />
    )
  }

  return (
    <ProtectedImage
      src={url}
      alt={media.name || 'Media'}
      className="w-full max-h-64 rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity"
      containerClassName="w-full"
    />
  )
}

// ─── Reaction Bar ───────────────────────────────────────────────────────────
function ReactionBar({ reactions, messageId, userId }) {
  const { toggleReaction } = useMessageStore()
  if (!reactions?.length) return null

  // Group reactions by emoji
  const grouped = {}
  reactions.forEach(r => {
    if (!grouped[r.emoji]) grouped[r.emoji] = []
    grouped[r.emoji].push(r.user_id)
  })

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Object.entries(grouped).map(([emoji, users]) => {
        const isMine = users.includes(userId)
        return (
          <button
            key={emoji}
            onClick={() => toggleReaction(messageId, userId, emoji)}
            className={cn(
              'flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition-colors cursor-pointer',
              isMine
                ? 'bg-red-500/20 border-red-500/40 text-red-300'
                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:bg-zinc-700/50'
            )}
          >
            <span>{emoji}</span>
            {users.length > 1 && <span className="text-[10px]">{users.length}</span>}
          </button>
        )
      })}
    </div>
  )
}

// ─── Reaction Picker ────────────────────────────────────────────────────────
function ReactionPicker({ messageId, userId, onClose }) {
  const { toggleReaction } = useMessageStore()
  return (
    <div className="flex items-center gap-0.5 bg-zinc-900 border border-zinc-700 rounded-full px-2 py-1 shadow-xl">
      {QUICK_REACTIONS.map(emoji => (
        <button
          key={emoji}
          onClick={() => { toggleReaction(messageId, userId, emoji); onClose() }}
          className="text-lg hover:scale-125 transition-transform cursor-pointer px-0.5"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

// ─── Read Receipt Indicator ─────────────────────────────────────────────────
function ReadReceipt({ isRead, otherUserReceiptsEnabled }) {
  // Double blue check = read + receipts enabled
  // Single grey check = sent (unread or receipts off)
  if (isRead && otherUserReceiptsEnabled !== false) {
    return <CheckCheck size={14} className="text-blue-400 flex-shrink-0" />
  }
  return <Check size={14} className="text-zinc-600 flex-shrink-0" />
}

// ─── Typing Indicator ───────────────────────────────────────────────────────
function TypingIndicator({ conversationId }) {
  const typingUsers = useMessageStore(s => s.typingUsers[conversationId])
  const hasTyping = typingUsers && Object.keys(typingUsers).length > 0
  if (!hasTyping) return null

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <div className="flex gap-1">
        <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-zinc-500">typing...</span>
    </div>
  )
}

// ─── Message Search Modal ────────────────────────────────────────────────────
function MessageSearchModal({ userId, conversationId, onClose, onJumpToMessage }) {
  const { searchMessages, searchResults, searching, clearSearch } = useMessageStore()
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    return () => clearSearch()
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { clearSearch(); return }
    const timer = setTimeout(() => {
      searchMessages(userId, q, conversationId)
    }, 400)
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
            placeholder="Search messages..."
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
          />
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 cursor-pointer">
            <X size={18} className="text-zinc-500" />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {searching && <div className="p-4 text-center text-sm text-zinc-500">Searching...</div>}
          {!searching && query.length >= 2 && searchResults.length === 0 && (
            <div className="p-4 text-center text-sm text-zinc-500">No messages found</div>
          )}
          {searchResults.map(r => (
            <button
              key={r.id}
              onClick={() => { onJumpToMessage?.(r); onClose() }}
              className="w-full flex items-center gap-3 p-4 hover:bg-zinc-800/50 transition-colors text-left cursor-pointer"
            >
              <Avatar src={r.sender_avatar_url} alt={r.sender_display_name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">{r.sender_display_name}</span>
                  <span className="text-[10px] text-zinc-600">{formatMessageTime(r.created_at)}</span>
                </div>
                <p className="text-xs text-zinc-400 truncate mt-0.5">{r.content}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── New Message Modal ──────────────────────────────────────────────────────

function NewMessageModal({ onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [defaultUsers, setDefaultUsers] = useState([])
  const [unlockedIds, setUnlockedIds] = useState([])
  const [searching, setSearching] = useState(false)
  const [loadingDefaults, setLoadingDefaults] = useState(true)
  const { user, profile } = useAuthStore()
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

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
          setDefaultUsers(profiles?.map(p => ({ ...p, isSubscribed: subIds.includes(p.id) })) || [])
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
    const isUnlocked = unlockedIds.includes(u.id)
    const isFree = profile?.is_creator || !u.is_creator || u.isSubscribed || isUnlocked || u.allow_free_messages || !u.message_price || u.message_price <= 0
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
              {u.is_verified && <ShieldCheck size={13} className="text-red-400" />}
              {u.partner_tier === 'verified' && <ShieldCheck size={12} className="text-emerald-400" />}
              {u.partner_tier === 'blue' && <ShieldCheck size={12} className="text-blue-400" />}
              {u.partner_tier === 'gold' && <ShieldCheck size={12} className="text-amber-400" />}
            </div>
            <span className="text-xs text-zinc-500">@{u.username}</span>
          </div>
        </div>
        {!isFree && (
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
          <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search users..." className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none" />
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 cursor-pointer">
            <X size={18} className="text-zinc-500" />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {searching && <div className="p-4 text-center text-sm text-zinc-500">Searching...</div>}
          {!searching && query.length >= 2 && results.length === 0 && <div className="p-4 text-center text-sm text-zinc-500">No users found</div>}
          {!searching && query.length < 2 && loadingDefaults && <div className="p-4 text-center text-sm text-zinc-500">Loading...</div>}
          {!searching && query.length < 2 && !loadingDefaults && defaultUsers.length === 0 && <div className="p-4 text-center text-sm text-zinc-500">Type at least 2 characters to search</div>}
          {displayUsers.map(renderUser)}
        </div>
      </div>
    </div>
  )
}

// ─── Conversation List ──────────────────────────────────────────────────────

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

  const getLastMessagePreview = (conv) => {
    if (!conv.lastMessage) return 'No messages'
    if (conv.lastMessage.message_type === 'payment_request') return '💰 Payment request'
    if (conv.lastMessage.message_type === 'media') return '📷 Media'
    if (conv.lastMessage.message_type === 'voice') return '🎤 Voice message'
    if (conv.lastMessage.message_type === 'video') return '🎬 Video'
    return conv.lastMessage.content || 'No messages'
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
              <Avatar src={conv.otherUser?.avatar_url} alt={conv.otherUser?.display_name} size="lg" />
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
                  <span className={cn('font-semibold text-sm truncate', isCeo ? 'text-amber-400' : isStaff ? 'text-purple-400' : 'text-white')}>
                    {conv.otherUser?.display_name || 'Unknown'}
                  </span>
                  {conv.otherUser?.is_verified && <ShieldCheck size={13} className="text-red-400" />}
                  {conv.otherUser?.partner_tier === 'verified' && <ShieldCheck size={12} className="text-emerald-400" />}
                  {conv.otherUser?.partner_tier === 'blue' && <ShieldCheck size={12} className="text-blue-400" />}
                  {conv.otherUser?.partner_tier === 'gold' && <ShieldCheck size={12} className="text-amber-400" />}
                  {isCeo && <span className="text-[9px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full ml-1">CEO</span>}
                  {isStaff && !isCeo && <span className="text-[9px] font-bold bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full ml-1">STAFF</span>}
                </div>
                <span className="text-[11px] text-zinc-600">{formatMessageTime(conv.lastMessage?.created_at)}</span>
              </div>
              <p className={cn('text-xs truncate mt-0.5', hasStaffMessage ? 'text-purple-400' : 'text-zinc-500')}>
                {getLastMessagePreview(conv)}
              </p>
            </div>
            {conv.unreadCount > 0 && (
              <div className={cn('min-w-[20px] h-5 rounded-full flex items-center justify-center flex-shrink-0 px-1', isCeo ? 'bg-amber-500' : isStaff ? 'bg-purple-500' : 'bg-red-500')}>
                <span className="text-[10px] font-bold text-white">{isCeo ? 'CEO' : conv.unreadCount > 99 ? '99+' : conv.unreadCount}</span>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Payment Request Bubble ─────────────────────────────────────────────────

function PaymentRequestBubble({ msg, isOwn, userId }) {
  const [paying, setPaying] = useState(false)
  const [showCrypto, setShowCrypto] = useState(false)
  const isPaid = msg.payment_status === 'paid'
  const canPay = !isOwn && !isPaid

  const handlePay = async () => {
    if (paying) return
    setShowCrypto(true)
  }

  return (
    <div className={cn(
      'rounded-2xl overflow-hidden border min-w-[220px] max-w-[300px]',
      isPaid ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-red-500/30 bg-zinc-900/80',
      isOwn ? 'rounded-br-md' : 'rounded-bl-md'
    )}>
      <div className={cn('px-4 py-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider', isPaid ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/10 text-red-400')}>
        {isPaid ? <CheckCircle size={13} /> : <DollarSign size={13} />}
        {isPaid ? 'Payment Complete' : 'Payment Request'}
      </div>
      <div className="px-4 py-3">
        {msg.payment_note && <p className="text-sm text-zinc-300 mb-2">{msg.payment_note}</p>}
        <p className={cn('text-2xl font-bold', isPaid ? 'text-emerald-400' : 'text-white')}>
          ${parseFloat(msg.payment_amount).toFixed(2)}
        </p>
        {!isPaid && !isOwn && <p className="text-[10px] text-zinc-500 mt-1">Platform fee: {PLATFORM_FEE_PERCENT}%</p>}
      </div>
      {canPay && (
        <div className="px-4 pb-3">
          <button onClick={handlePay} disabled={paying}
            className="w-full py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
            {paying ? <PageLoader /> : <>Pay Now <ArrowLeft size={14} className="rotate-180" /></>}
          </button>
        </div>
      )}
      {showCrypto && (
        <PaymentModal
          open={showCrypto}
          onClose={() => setShowCrypto(false)}
          amount={parseFloat(msg.payment_amount)}
          paymentType="payment_request"
          metadata={{ message_id: msg.id, creator_id: msg.sender_id }}
          label={`Pay request from @${msg.sender?.username || 'creator'}`}
          onSuccess={() => {
            toast.success(`Paid $${parseFloat(msg.payment_amount).toFixed(2)}!`)
            setShowCrypto(false)
            // The webhook will update the DB, but we can optimistically update the store
            useMessageStore.setState(s => ({
              messages: s.messages.map(m => m.id === msg.id ? { ...m, payment_status: 'paid' } : m)
            }))
          }}
        />
      )}
    </div>
  )
}

// ─── Payment Request Modal ──────────────────────────────────────────────────

function PaymentRequestModal({ onClose, onSend }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const parsed = parseFloat(amount)
    if (!parsed || parsed < 1 || parsed > 5000) { toast.error('Amount must be between $1 and $5,000'); return }
    setLoading(true)
    try { await onSend(parsed, note.trim()); onClose() }
    catch { toast.error('Failed to send payment request') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="font-bold text-white flex items-center gap-2"><DollarSign size={18} className="text-red-400" /> Send Payment Request</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-800 cursor-pointer"><X size={18} className="text-zinc-500" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Amount</label>
            <div className="relative">
              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="number" min="1" max="5000" step="0.01" value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="25.00" autoFocus
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
            </div>
            {amount && parseFloat(amount) > 0 && (
              <p className="text-xs text-zinc-500 mt-1">
                You earn <span className="text-emerald-400">${(parseFloat(amount) * (100 - PLATFORM_FEE_PERCENT) / 100).toFixed(2)}</span> after {PLATFORM_FEE_PERCENT}% fee
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Note (optional)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Custom photo set request" maxLength={200}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
          </div>
          <Button type="submit" loading={loading} className="w-full" disabled={!amount || parseFloat(amount) < 1}>
            Send Request
          </Button>
        </form>
      </div>
    </div>
  )
}

// ─── Message Bubble ─────────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn, userId, otherUser }) {
  const [showReactions, setShowReactions] = useState(false)
  const senderRole = msg.sender_system_role || msg.sender?.system_role
  const isCeoMsg = msg.sender?.username === CEO_USERNAME
  const isStaffMsg = !!senderRole && !isCeoMsg
  const isPaymentRequest = msg.message_type === 'payment_request'
  const isMedia = msg.message_type === 'media'
  const isVoice = msg.message_type === 'voice'

  const bubbleClass = cn(
    'px-4 py-2.5 rounded-2xl text-sm relative',
    isOwn
      ? 'bg-red-600 text-white rounded-br-md'
      : isCeoMsg
        ? 'bg-amber-500/15 text-amber-100 border border-amber-500/30 rounded-bl-md'
        : isStaffMsg
          ? 'bg-purple-500/15 text-purple-100 border border-purple-500/30 rounded-bl-md'
          : 'bg-zinc-800 text-zinc-200 rounded-bl-md'
  )

  const timeClass = cn(
    'text-[10px] mt-1',
    isOwn ? 'text-red-200' : isCeoMsg ? 'text-amber-400/60' : isStaffMsg ? 'text-purple-400/60' : 'text-zinc-500'
  )

  return (
    <div className={cn('flex group', isOwn ? 'justify-end' : 'justify-start')}>
      <div className="flex items-end gap-2 max-w-[75%]">
        {!isOwn && (
          <div className="relative flex-shrink-0">
            <Avatar src={msg.sender?.avatar_url} alt={msg.sender?.display_name} size="sm" />
            {isCeoMsg && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center">
                <Crown size={7} className="text-black" />
              </div>
            )}
          </div>
        )}
        <div className="relative">
          {/* Staff label */}
          {!isOwn && (isCeoMsg || isStaffMsg) && (
            <p className={cn('text-[10px] font-bold mb-0.5 ml-1', isCeoMsg ? 'text-amber-400' : 'text-purple-400')}>
              {isCeoMsg ? 'CEO' : senderRole?.toUpperCase()}
            </p>
          )}

          {/* Reaction picker toggle (on hover) */}
          <div className="relative">
            {isPaymentRequest ? (
              <PaymentRequestBubble msg={msg} isOwn={isOwn} userId={userId} />
            ) : isVoice ? (
              <div className={bubbleClass}>
                <VoicePlayer mediaUrls={msg.media_urls} duration={msg.media_duration} />
                <div className="flex items-center justify-between gap-3 mt-1">
                  <p className={timeClass}>{formatMessageTime(msg.created_at)}</p>
                  {isOwn && <ReadReceipt isRead={msg.is_read} otherUserReceiptsEnabled={otherUser?.read_receipts_enabled} />}
                </div>
              </div>
            ) : isMedia ? (
              <div className={bubbleClass}>
                <MediaContent mediaUrls={msg.media_urls} />
                {msg.content && msg.content !== 'null' && (
                  <p className="break-words mt-2">{msg.content}</p>
                )}
                <div className="flex items-center justify-between gap-3 mt-1">
                  <p className={timeClass}>{formatMessageTime(msg.created_at)}</p>
                  {isOwn && <ReadReceipt isRead={msg.is_read} otherUserReceiptsEnabled={otherUser?.read_receipts_enabled} />}
                </div>
              </div>
            ) : (
              <div className={bubbleClass}>
                <p className="break-words">{msg.content}</p>
                <div className="flex items-center justify-between gap-3 mt-1">
                  <p className={timeClass}>{formatMessageTime(msg.created_at)}</p>
                  {isOwn && <ReadReceipt isRead={msg.is_read} otherUserReceiptsEnabled={otherUser?.read_receipts_enabled} />}
                </div>
              </div>
            )}

            {/* Hover reaction button */}
            {!isPaymentRequest && (
              <button
                onClick={() => setShowReactions(!showReactions)}
                className={cn(
                  'absolute -top-3 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10',
                  'bg-zinc-800 border border-zinc-700 rounded-full p-1 hover:bg-zinc-700',
                  isOwn ? 'left-0' : 'right-0'
                )}
              >
                <Smile size={14} className="text-zinc-400" />
              </button>
            )}

            {/* Reaction picker popup */}
            {showReactions && (
              <div className={cn('absolute -top-10 z-20', isOwn ? 'right-0' : 'left-0')}>
                <ReactionPicker messageId={msg.id} userId={userId} onClose={() => setShowReactions(false)} />
              </div>
            )}
          </div>

          {/* Reactions bar */}
          <ReactionBar reactions={msg.reactions} messageId={msg.id} userId={userId} />
        </div>
      </div>
    </div>
  )
}

// ─── Message Thread ─────────────────────────────────────────────────────────

function MessageThread({ conversationId, userId, otherUser, conversation }) {
  const {
    messages, fetchMessages, fetchOlderMessages, sendMessage, subscribeToMessages,
    checkMessageAccess, sendPaymentRequest, sendMediaMessage,
    sendVoiceMessage, messageAccess, hasMoreMessages, broadcastTyping,
    subscribeToTyping, markAsRead, approveVoiceVideo,
  } = useMessageStore()
  const { profile } = useAuthStore()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showConvSettings, setShowConvSettings] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [showUnlockCrypto, setShowUnlockCrypto] = useState(false)
  const [mediaFiles, setMediaFiles] = useState([])
  const [mediaPreviews, setMediaPreviews] = useState([])
  const bottomRef = useRef(null)
  const scrollRef = useRef(null)
  const fileInputRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const isCreator = profile?.is_creator

  // Can this user send voice/video?
  const canSendVoiceVideo = isCreator || otherUser?.voice_video_approved || conversation?.myVoiceVideoApproved

  const voiceRecorder = useVoiceRecorder()

  // Init: fetch messages, subscribe, check access, mark as read
  useEffect(() => {
    fetchMessages(conversationId)
    const unsubMsg = subscribeToMessages(conversationId)
    const unsubTyping = subscribeToTyping(conversationId, userId)
    if (otherUser?.id) checkMessageAccess(userId, otherUser.id)
    // Mark as read when opening
    markAsRead(conversationId, userId)
    return () => { unsubMsg(); unsubTyping() }
  }, [conversationId, otherUser?.id])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    // Mark as read when new messages arrive
    markAsRead(conversationId, userId)
  }, [messages])

  // Load more on scroll to top
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || !hasMoreMessages) return
    if (el.scrollTop < 100) {
      const prevHeight = el.scrollHeight
      fetchOlderMessages(conversationId).then(() => {
        // Maintain scroll position after loading older messages
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight - prevHeight
        })
      })
    }
  }, [hasMoreMessages, conversationId])

  // Typing indicator
  const handleTextChange = (e) => {
    setText(e.target.value)
    broadcastTyping(conversationId, userId)
  }

  // Send text message
  const handleSend = async (e) => {
    e.preventDefault()
    if (sending) return

    // If media files are selected, send as media message
    if (mediaFiles.length > 0) {
      setSending(true)
      try {
        await sendMediaMessage(conversationId, userId, mediaFiles, text.trim() || null)
        setText('')
        clearMedia()
      } catch (err) {
        toast.error(err.message || 'Failed to send media')
      } finally {
        setSending(false)
      }
      return
    }

    if (!text.trim()) return
    setSending(true)
    try {
      await sendMessage(conversationId, userId, text.trim())
      setText('')
    } catch { /* handled by store */ }
    finally { setSending(false) }
  }

  // Media handling
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const valid = files.filter(f =>
      [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].includes(f.type)
    )
    if (valid.length === 0) {
      toast.error('Unsupported file type')
      return
    }
    setMediaFiles(prev => [...prev, ...valid].slice(0, 5))
    // Generate previews
    const newPreviews = valid.map(f => ({
      url: URL.createObjectURL(f),
      type: f.type,
      name: f.name,
    }))
    setMediaPreviews(prev => [...prev, ...newPreviews].slice(0, 5))
  }

  const clearMedia = () => {
    mediaPreviews.forEach(p => URL.revokeObjectURL(p.url))
    setMediaFiles([])
    setMediaPreviews([])
  }

  const removeMediaFile = (index) => {
    URL.revokeObjectURL(mediaPreviews[index]?.url)
    setMediaFiles(prev => prev.filter((_, i) => i !== index))
    setMediaPreviews(prev => prev.filter((_, i) => i !== index))
  }

  // Voice message handling
  const handleVoiceStop = async () => {
    const result = await voiceRecorder.stop()
    if (!result) return
    setSending(true)
    try {
      await sendVoiceMessage(conversationId, userId, result.blob, result.duration)
      toast.success('Voice message sent')
    } catch (err) {
      toast.error(err.message || 'Failed to send voice message')
    } finally {
      setSending(false)
    }
  }

  // Unlock messages
  const handleUnlockMessages = async () => {
    if (unlocking) return
    setShowUnlockCrypto(true)
  }

  const handleSendPaymentRequest = async (amount, note) => {
    await sendPaymentRequest(conversationId, userId, amount, note)
    toast.success('Payment request sent!')
  }

  // Voice/video approval
  const handleApproveVoiceVideo = async () => {
    try {
      await approveVoiceVideo(conversationId, otherUser.id, !otherUser?.voice_video_approved)
      toast.success(otherUser?.voice_video_approved ? 'Voice/video disabled for user' : 'Voice/video enabled for user')
    } catch (err) { toast.error(err.message || 'Failed') }
  }

  const needsPaywall = messageAccess && !messageAccess.allowed && messageAccess.reason === 'paywall'
  const paywallPrice = messageAccess?.price || 0

  return (
    <div className="flex flex-col h-full">
      {/* Conversation settings bar (for creators) */}
      {showConvSettings && isCreator && (
        <div className="p-3 bg-zinc-900/80 border-b border-zinc-800/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-zinc-400">Allow voice/video from {otherUser?.display_name}:</span>
              <button
                onClick={handleApproveVoiceVideo}
                className={cn(
                  'w-9 h-5 rounded-full transition-colors relative',
                  otherUser?.voice_video_approved ? 'bg-red-600' : 'bg-zinc-700'
                )}
              >
                <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform', otherUser?.voice_video_approved ? 'translate-x-4.5' : 'translate-x-0.5')} />
              </button>
            </label>
          </div>
          <button onClick={() => setShowConvSettings(false)} className="text-zinc-500 hover:text-zinc-300 cursor-pointer">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Load more indicator */}
        {hasMoreMessages && (
          <div className="flex justify-center py-2">
            <button
              onClick={() => fetchOlderMessages(conversationId)}
              className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 cursor-pointer"
            >
              <ChevronUp size={14} /> Load older messages
            </button>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} isOwn={msg.sender_id === userId} userId={userId} otherUser={otherUser} />
        ))}

        {/* Typing indicator */}
        <TypingIndicator conversationId={conversationId} />

        <div ref={bottomRef} />
      </div>

      {/* Media preview bar */}
      {mediaPreviews.length > 0 && (
        <div className="px-4 pt-3 border-t border-zinc-800/50">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {mediaPreviews.map((p, i) => (
              <div key={i} className="relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-zinc-800">
                {p.type.startsWith('video/') ? (
                  <video src={p.url} className="w-full h-full object-cover" />
                ) : (
                  <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
                )}
                <button onClick={() => removeMediaFile(i)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center cursor-pointer">
                  <X size={12} className="text-white" />
                </button>
              </div>
            ))}
            {mediaPreviews.length < 5 && (
              <button onClick={() => fileInputRef.current?.click()}
                className="w-16 h-16 rounded-xl border border-dashed border-zinc-700 flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 cursor-pointer flex-shrink-0">
                <Paperclip size={20} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Input area */}
      {needsPaywall ? (
        <div className="p-4 border-t border-zinc-800/50">
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 text-center">
            <Lock size={24} className="text-red-400 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-white mb-1">Message Locked</h4>
            <p className="text-xs text-zinc-500 mb-4">
              Pay <span className="text-white font-semibold">${parseFloat(paywallPrice).toFixed(2)}</span> to unlock messaging with this creator
            </p>
            <button onClick={handleUnlockMessages} disabled={unlocking}
              className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
              {unlocking ? 'Processing...' : <><CreditCard size={16} /> Unlock for ${parseFloat(paywallPrice).toFixed(2)}</>}
            </button>
          </div>
        </div>
      ) : voiceRecorder.recording ? (
        /* Voice Recording UI */
        <div className="p-4 border-t border-zinc-800/50">
          <div className="flex items-center gap-3">
            <button onClick={voiceRecorder.cancel}
              className="p-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer" title="Cancel">
              <X size={18} />
            </button>
            <div className="flex-1 flex items-center gap-3">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm text-zinc-300 font-mono">
                {Math.floor(voiceRecorder.duration / 60)}:{(voiceRecorder.duration % 60).toString().padStart(2, '0')}
              </span>
              <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-red-500/50 rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
            </div>
            <button onClick={handleVoiceStop} disabled={sending}
              className="p-3 bg-red-600 hover:bg-red-500 rounded-xl text-white transition-colors cursor-pointer disabled:opacity-40" title="Send voice message">
              <Send size={18} />
            </button>
          </div>
        </div>
      ) : (
        /* Normal input area */
        <form onSubmit={handleSend} className="p-4 border-t border-zinc-800/50">
          <div className="flex items-center gap-2">
            {/* Creator: payment request */}
            {isCreator && (
              <>
                <button type="button" onClick={() => setShowPaymentModal(true)}
                  className="p-2.5 rounded-xl text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer flex-shrink-0" title="Send payment request">
                  <DollarSign size={18} />
                </button>
                <button type="button" onClick={() => setShowConvSettings(!showConvSettings)}
                  className="p-2.5 rounded-xl text-zinc-400 hover:bg-zinc-800 transition-colors cursor-pointer flex-shrink-0" title="Conversation settings">
                  <Settings2 size={18} />
                </button>
              </>
            )}

            {/* Attach media */}
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer flex-shrink-0" title="Attach media">
              <ImageIcon size={18} />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFileSelect} />

            {/* Voice message */}
            {canSendVoiceVideo ? (
              <button type="button" onClick={voiceRecorder.start}
                className="p-2.5 rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer flex-shrink-0" title="Record voice message">
                <Mic size={18} />
              </button>
            ) : (
              <button type="button" disabled
                className="p-2.5 rounded-xl text-zinc-600 cursor-not-allowed flex-shrink-0" title="Voice messages not enabled by creator">
                <MicOff size={18} />
              </button>
            )}

            {/* Text input */}
            <input type="text" value={text} onChange={handleTextChange}
              placeholder="Type a message..."
              className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-red-500/50 min-w-0" />

            {/* Send */}
            <button type="submit" disabled={(!text.trim() && mediaFiles.length === 0) || sending}
              className="p-3 bg-red-600 hover:bg-red-500 rounded-xl text-white disabled:opacity-40 transition-colors cursor-pointer flex-shrink-0">
              <Send size={18} />
            </button>
          </div>
        </form>
      )}

      {/* Payment Request Modal */}
      {showPaymentModal && (
        <PaymentRequestModal onClose={() => setShowPaymentModal(false)} onSend={handleSendPaymentRequest} />
      )}

      {/* Search Modal */}
      {showSearch && (
        <MessageSearchModal userId={userId} conversationId={conversationId} onClose={() => setShowSearch(false)} />
      )}

      {/* Payment Modal for Unlocking */}
      {showUnlockCrypto && (
        <PaymentModal
          open={showUnlockCrypto}
          onClose={() => setShowUnlockCrypto(false)}
          amount={paywallPrice}
          paymentType="message_unlock"
          metadata={{ creator_id: otherUser.id, conversation_id: conversationId }}
          label={`Unlock messages with @${otherUser.username}`}
          onSuccess={() => {
            toast.success('Messages unlocked!')
            setShowUnlockCrypto(false)
            // Optimistically update access
            useMessageStore.setState({ messageAccess: { allowed: true } })
          }}
        />
      )}
    </div>
  )
}

// ─── Main Messages Page ─────────────────────────────────────────────────────

export default function MessagesPage() {
  const { user, profile } = useAuthStore()
  const { conversations, loading, fetchConversations, startConversation } = useMessageStore()
  const [selectedId, setSelectedId] = useState(null)
  const [showNewMessage, setShowNewMessage] = useState(false)
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)
  const [paywallUser, setPaywallUser] = useState(null)
  const [showCryptoModal, setShowCryptoModal] = useState(false)
  const [searchParams] = useSearchParams()

  useEffect(() => {
    if (user) fetchConversations(user.id)
  }, [user])

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
    } catch { /* silently fail */ }
  }

  if (loading) return <PageLoader />

  const selectedConv = conversations.find(c => c.id === selectedId)

  return (
    <div className="flex h-[calc(100vh-0px)] md:h-screen">
      {/* Conversation List */}
      <div className={cn('w-full md:w-80 border-r border-zinc-800/50 flex flex-col', selectedId && 'hidden md:flex')}>
        <header className="sticky top-0 z-10 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Messages</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowGlobalSearch(true)}
              className="p-2 rounded-xl hover:bg-zinc-800/50 text-zinc-400 hover:text-white transition-colors cursor-pointer" title="Search messages">
              <Search size={20} />
            </button>
            <button onClick={() => setShowNewMessage(true)}
              className="p-2 rounded-xl hover:bg-zinc-800/50 text-zinc-400 hover:text-white transition-colors cursor-pointer" title="New message">
              <PenSquare size={20} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <ConversationList conversations={conversations} activeId={selectedId} onSelect={setSelectedId} />
        </div>
      </div>

      {/* Thread */}
      <div className={cn('flex-1 flex flex-col', !selectedId && 'hidden md:flex')}>
        {selectedId && selectedConv ? (
          <>
            <header className="sticky top-0 z-10 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-3 flex items-center gap-3">
              <button onClick={() => setSelectedId(null)} className="md:hidden p-1 hover:bg-zinc-800 rounded-lg cursor-pointer">
                <ArrowLeft size={20} />
              </button>
              {(() => {
                const isCeo = selectedConv.otherUser?.username === CEO_USERNAME
                const isStaff = !!selectedConv.otherUser?.system_role
                return selectedConv.otherUser ? (
                  <div className="flex-1 flex items-center gap-3">
                    <div className="relative">
                      <Avatar src={selectedConv.otherUser.avatar_url} alt={selectedConv.otherUser.display_name} size="md" />
                      {isCeo && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center border border-[#050505]">
                          <Crown size={8} className="text-black" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className={cn('font-bold text-sm', isCeo ? 'text-amber-400' : isStaff ? 'text-purple-400' : '')}>
                          {selectedConv.otherUser.display_name}
                        </span>
                        {selectedConv.otherUser.is_verified && <ShieldCheck size={13} className="text-red-400" />}
                        {selectedConv.otherUser.partner_tier === 'verified' && <ShieldCheck size={12} className="text-emerald-400" />}
                        {selectedConv.otherUser.partner_tier === 'blue' && <ShieldCheck size={12} className="text-blue-400" />}
                        {selectedConv.otherUser.partner_tier === 'gold' && <ShieldCheck size={12} className="text-amber-400" />}
                        {isCeo && <span className="text-[9px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">CEO</span>}
                        {isStaff && !isCeo && <span className="text-[9px] font-bold bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">STAFF</span>}
                      </div>
                      <span className="text-xs text-zinc-500">@{selectedConv.otherUser.username}</span>
                    </div>
                  </div>
                ) : null
              })()}
              {/* Thread search button */}
              <button
                onClick={() => setShowGlobalSearch(true)}
                className="p-2 rounded-xl hover:bg-zinc-800/50 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Search in conversation"
              >
                <Search size={18} />
              </button>
            </header>
            <MessageThread
              conversationId={selectedId}
              userId={user.id}
              otherUser={selectedConv.otherUser}
              conversation={selectedConv}
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
            if (!u.isFree) { setPaywallUser(u); setShowNewMessage(false) }
            else handleNewMessage(u)
          }}
        />
      )}

      {/* Global Search Modal */}
      {showGlobalSearch && (
        <MessageSearchModal
          userId={user.id}
          conversationId={selectedId}
          onClose={() => setShowGlobalSearch(false)}
          onJumpToMessage={(result) => {
            if (result.conversation_id !== selectedId) {
              setSelectedId(result.conversation_id)
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
                  // Try to unlock directly (will succeed if user is Plus, otherwise throws)
                  const { data, error } = await supabase.rpc('pay_message_unlock', {
                    p_sender_id: user.id, p_receiver_id: paywallUser.id, p_conversation_id: null
                  })
                  if (error) throw error
                  
                  if (data?.plus_bypass) {
                    toast.success('Messages unlocked for free with Heatly+!')
                    handleNewMessage(paywallUser)
                    setPaywallUser(null)
                  } else {
                    // Should not happen unless webhook called it, but just in case
                    toast.success('Messages unlocked!')
                    handleNewMessage(paywallUser)
                    setPaywallUser(null)
                  }
                } catch (err) {
                  // If it fails (Payment required), open crypto modal
                  if (err.message?.includes('Payment required')) {
                    setShowCryptoModal(true)
                  } else {
                    toast.error(err.message || 'Payment failed')
                  }
                }
              }}>
                Pay {formatCurrency(paywallUser.message_price)}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showCryptoModal && paywallUser && (
        <PaymentModal
          open={showCryptoModal}
          onClose={() => setShowCryptoModal(false)}
          amount={paywallUser.message_price}
          paymentType="message_unlock"
          metadata={{ creator_id: paywallUser.id, conversation_id: null }}
          label={`Unlock messages with @${paywallUser.username}`}
          onSuccess={() => {
            toast.success('Messages unlocked!')
            handleNewMessage(paywallUser)
            setPaywallUser(null)
            setShowCryptoModal(false)
          }}
        />
      )}
    </div>
  )
}
