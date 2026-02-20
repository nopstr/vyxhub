import { useState, useEffect, useCallback, useRef } from 'react'
import {
  DollarSign, TrendingUp, Users, Eye, Heart, Image, MessageCircle,
  ArrowUpRight, ArrowDownRight, Calendar, BarChart3, Send, Download,
  Clock, CheckCircle, XCircle, ChevronDown, Filter, FileText,
  Megaphone, ClipboardList, ArrowLeft, Loader2, Star, Package,
  Tag, Link2, Trash2, Percent, CalendarClock, Gift
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { PageLoader } from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import { cn, formatCurrency, formatNumber, formatMessageTime } from '../../lib/utils'
import { PLATFORM_FEE_PERCENT } from '../../lib/constants'
import { toast } from 'sonner'

// ─── Shared Components ──────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, trend, trendLabel, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-500/10 text-indigo-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400',
    pink: 'bg-pink-500/10 text-pink-400',
    purple: 'bg-purple-500/10 text-purple-400',
  }
  return (
    <div className="bg-zinc-900/30 border border-white/5 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs sm:text-sm text-zinc-500">{label}</span>
        <div className={cn('p-2 rounded-xl', colors[color])}>
          <Icon size={16} />
        </div>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-white">{value}</p>
      {trend !== undefined && trend !== null && (
        <div className="flex items-center gap-1 mt-2">
          {trend >= 0 ? (
            <ArrowUpRight size={14} className="text-emerald-400" />
          ) : (
            <ArrowDownRight size={14} className="text-red-400" />
          )}
          <span className={cn('text-xs font-medium', trend >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {Math.abs(trend)}%
          </span>
          {trendLabel && <span className="text-xs text-zinc-600">{trendLabel}</span>}
        </div>
      )}
    </div>
  )
}

function SectionCard({ title, icon: Icon, children, action }) {
  return (
    <div className="bg-zinc-900/30 border border-white/5 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <h3 className="font-semibold text-white flex items-center gap-2">
          {Icon && <Icon size={16} className="text-indigo-400" />}
          {title}
        </h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
        active ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
      )}
    >
      {Icon && <Icon size={16} />}
      {label}
      {badge > 0 && (
        <span className="ml-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
          {badge}
        </span>
      )}
    </button>
  )
}

// ─── Mini Chart ─────────────────────────────────────────────────────────────

function MiniBarChart({ data, height = 160 }) {
  if (!data || !data.length) {
    return <div style={{ height }} className="flex items-center justify-center text-sm text-zinc-600">No data</div>
  }
  const max = Math.max(...data.map(d => d.amount), 1)
  const showEvery = data.length > 14 ? Math.ceil(data.length / 14) : 1

  return (
    <div className="flex items-end gap-0.5 px-1" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div
            className="w-full bg-indigo-600/50 hover:bg-indigo-500/70 rounded-t-sm transition-colors cursor-default"
            style={{ height: `${(d.amount / max) * 100}%`, minHeight: '2px' }}
            title={`${d.date}: $${Number(d.amount).toFixed(2)}`}
          />
          {i % showEvery === 0 && (
            <span className="text-[9px] text-zinc-600 truncate max-w-full">
              {new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function MiniLineChart({ data, height = 120 }) {
  if (!data || data.length < 2) return <div style={{ height }} className="flex items-center justify-center text-sm text-zinc-600">Not enough data</div>
  const counts = data.map(d => Number(d.count))
  const max = Math.max(...counts, 1)
  const min = Math.min(...counts, 0)
  const range = max - min || 1

  const points = counts.map((c, i) => {
    const x = (i / (counts.length - 1)) * 100
    const y = 100 - ((c - min) / range) * 100
    return `${x},${y}`
  }).join(' ')

  return (
    <div style={{ height }} className="relative">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        <polyline
          points={points}
          fill="none"
          stroke="#6366f1"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={`0,100 ${points} 100,100`}
          fill="url(#gradient)"
          opacity="0.2"
        />
        <defs>
          <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1">
        {data.filter((_, i) => i % Math.ceil(data.length / 5) === 0 || i === data.length - 1).map((d, i) => (
          <span key={i} className="text-[9px] text-zinc-600">
            {new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Overview Tab ───────────────────────────────────────────────────────────

function OverviewTab({ analytics, period, setPeriod }) {
  const s = analytics?.summary || {}
  const earningsByType = analytics?.earnings_by_type || {}
  const topPosts = analytics?.top_posts || []

  const periodOptions = [
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: '90d', label: '90 days' },
    { value: '1y', label: '1 year' },
    { value: 'all', label: 'All time' },
  ]

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {periodOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setPeriod(opt.value)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap',
              period === opt.value ? 'bg-indigo-600 text-white' : 'bg-zinc-800/50 text-zinc-400 hover:text-white'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Earnings"
          value={formatCurrency(s.earnings || 0)}
          icon={DollarSign}
          color="emerald"
          trend={s.earnings_trend}
          trendLabel="vs prev period"
        />
        <StatCard
          label="Subscribers"
          value={formatNumber(s.subscribers || 0)}
          icon={Users}
          color="indigo"
          trend={s.subscribers_prev > 0 ? Math.round(((s.subscribers - s.subscribers_prev) / s.subscribers_prev) * 100) : null}
        />
        <StatCard label="Views" value={formatNumber(s.views || 0)} icon={Eye} color="purple" />
        <StatCard label="Engagement" value={`${analytics?.engagement_rate || 0}%`} icon={TrendingUp} color="amber" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="Earnings" icon={DollarSign}>
          <MiniBarChart data={analytics?.earnings_daily || []} />
        </SectionCard>
        <SectionCard title="Subscriber Growth" icon={Users}>
          <MiniLineChart data={analytics?.subscriber_growth || []} />
        </SectionCard>
      </div>

      {/* Earnings breakdown */}
      <SectionCard title="Revenue Breakdown" icon={BarChart3}>
        {Object.keys(earningsByType).length === 0 ? (
          <p className="text-sm text-zinc-600">No transactions in this period</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(earningsByType).map(([type, amount]) => {
              const total = Object.values(earningsByType).reduce((a, b) => a + Number(b), 0) || 1
              const pct = Math.round((Number(amount) / total) * 100)
              const typeLabels = {
                subscription: 'Subscriptions',
                tip: 'Tips',
                ppv_post: 'PPV Posts',
                ppv_message: 'PPV Messages',
                payment_request: 'Payment Requests',
                message_unlock: 'Message Unlocks',
                custom_request: 'Custom Requests',
              }
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-zinc-300">{typeLabels[type] || type}</span>
                    <span className="text-sm font-medium text-white">{formatCurrency(amount)} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* Top posts */}
      <SectionCard title="Top Performing Posts" icon={Star}>
        {topPosts.length === 0 ? (
          <p className="text-sm text-zinc-600">No posts in this period</p>
        ) : (
          <div className="space-y-3">
            {topPosts.map((post, i) => (
              <div key={post.id} className="flex items-center gap-3 py-2">
                <span className="text-lg font-bold text-zinc-600 w-6 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 truncate">{post.content || `${post.post_type} post`}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                    <span className="flex items-center gap-1"><Heart size={11} /> {formatNumber(post.like_count)}</span>
                    <span className="flex items-center gap-1"><MessageCircle size={11} /> {formatNumber(post.comment_count)}</span>
                    <span className="flex items-center gap-1"><Eye size={11} /> {formatNumber(post.view_count)}</span>
                    {post.revenue > 0 && <span className="flex items-center gap-1 text-emerald-400"><DollarSign size={11} /> {formatCurrency(post.revenue)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ─── Mass Message Tab ───────────────────────────────────────────────────────

function MassMessageTab({ userId }) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [subCount, setSubCount] = useState(null)
  const [history, setHistory] = useState([])
  const [scheduleMode, setScheduleMode] = useState(false)
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [scheduledMessages, setScheduledMessages] = useState([])
  const [cancellingId, setCancellingId] = useState(null)

  useEffect(() => {
    // Get active subscriber count
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', userId)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .then(({ count }) => setSubCount(count || 0))

    // Load recent messages sent by creator
    supabase
      .from('messages')
      .select('id, content, created_at, message_type')
      .eq('sender_id', userId)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => setHistory(data || []))

    // Load scheduled messages
    fetchScheduled()
  }, [userId])

  const fetchScheduled = async () => {
    const { data } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('creator_id', userId)
      .in('status', ['pending', 'sent'])
      .order('scheduled_at', { ascending: true })
    setScheduledMessages(data || [])
  }

  const handleSend = async () => {
    if (!content.trim()) return toast.error('Message cannot be empty')
    if (subCount === 0) return toast.error('No active subscribers to message')

    // If scheduling, validate date/time
    if (scheduleMode) {
      if (!scheduledDate || !scheduledTime) return toast.error('Pick a date and time for scheduling')
      const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`)
      if (scheduledAt <= new Date()) return toast.error('Scheduled time must be in the future')

      setSending(true)
      try {
        const { error } = await supabase.rpc('schedule_mass_message', {
          p_creator_id: userId,
          p_content: content.trim(),
          p_scheduled_at: scheduledAt.toISOString(),
        })
        if (error) throw error
        toast.success(`Message scheduled for ${scheduledAt.toLocaleString()}`)
        setContent('')
        setScheduledDate('')
        setScheduledTime('')
        setScheduleMode(false)
        fetchScheduled()
      } catch (err) {
        toast.error(err.message || 'Failed to schedule message')
      } finally {
        setSending(false)
      }
      return
    }
    
    const confirmed = confirm(`Send this message to ${subCount} active subscriber${subCount !== 1 ? 's' : ''}?`)
    if (!confirmed) return

    setSending(true)
    try {
      const { data, error } = await supabase.rpc('send_mass_message', {
        p_creator_id: userId,
        p_content: content.trim(),
      })
      if (error) throw error
      toast.success(`Message sent to ${data.sent} subscriber${data.sent !== 1 ? 's' : ''}${data.failed > 0 ? ` (${data.failed} failed)` : ''}`)
      setContent('')
    } catch (err) {
      toast.error(err.message || 'Failed to send mass message')
    } finally {
      setSending(false)
    }
  }

  const handleCancelScheduled = async (id) => {
    setCancellingId(id)
    try {
      const { error } = await supabase
        .from('scheduled_messages')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .eq('creator_id', userId)
      if (error) throw error
      toast.success('Scheduled message cancelled')
      fetchScheduled()
    } catch (err) {
      toast.error('Failed to cancel')
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="Mass Message"
        icon={Megaphone}
        action={
          <span className="text-xs text-zinc-500">
            {subCount !== null ? `${subCount} active subscriber${subCount !== 1 ? 's' : ''}` : 'Loading...'}
          </span>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Message</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Type your message to all active subscribers..."
              rows={5}
              maxLength={2000}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-zinc-600">{content.length}/2000</p>
            </div>
          </div>

          {/* Schedule toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setScheduleMode(!scheduleMode)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer border',
                scheduleMode
                  ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                  : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-zinc-200'
              )}
            >
              <CalendarClock size={14} />
              {scheduleMode ? 'Scheduling enabled' : 'Schedule for later'}
            </button>
          </div>

          {/* Schedule date/time */}
          {scheduleMode && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={e => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-violet-500/50 [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Time</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-violet-500/50 [color-scheme:dark]"
                />
              </div>
            </div>
          )}

          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
            <p className="text-xs text-amber-300">
              <strong>Note:</strong> This will create or open a conversation with each subscriber and send them this message. 
              Use sparingly to avoid overwhelming your audience.
            </p>
          </div>

          <Button
            onClick={handleSend}
            loading={sending}
            disabled={!content.trim() || subCount === 0}
            className="w-full"
          >
            {scheduleMode ? <CalendarClock size={16} /> : <Send size={16} />}
            {scheduleMode ? 'Schedule Message' : `Send to ${subCount ?? '...'} Subscriber${subCount !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </SectionCard>

      {/* Scheduled messages queue */}
      {scheduledMessages.filter(m => m.status === 'pending').length > 0 && (
        <SectionCard title="Scheduled Queue" icon={CalendarClock}>
          <div className="space-y-3">
            {scheduledMessages.filter(m => m.status === 'pending').map(msg => (
              <div key={msg.id} className="flex items-start gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                <CalendarClock size={14} className="text-violet-400 mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 line-clamp-2">{msg.content}</p>
                  <p className="text-xs text-violet-400 mt-1">
                    Scheduled for {new Date(msg.scheduled_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleCancelScheduled(msg.id)}
                  disabled={cancellingId === msg.id}
                  className="text-zinc-600 hover:text-red-400 transition-colors cursor-pointer p-1"
                  title="Cancel scheduled message"
                >
                  {cancellingId === msg.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Recent Messages" icon={Clock}>
        {history.length === 0 ? (
          <p className="text-sm text-zinc-600">No recent messages</p>
        ) : (
          <div className="space-y-3">
            {history.map(msg => (
              <div key={msg.id} className="flex items-start gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                <Send size={14} className="text-indigo-400 mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 line-clamp-2">{msg.content}</p>
                  <p className="text-xs text-zinc-600 mt-1">{formatMessageTime(msg.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ─── Custom Requests Tab ────────────────────────────────────────────────────

function CustomRequestsTab({ userId }) {
  const { profile, updateProfile } = useAuthStore()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [respondingId, setRespondingId] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [counterPrice, setCounterPrice] = useState('')

  useEffect(() => {
    fetchRequests()
  }, [filter])

  const fetchRequests = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('custom_requests')
        .select('*, requester:requester_id(display_name, username, avatar_url)')
        .eq('creator_id', userId)
        .order('created_at', { ascending: false })
      
      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data, error } = await query.limit(50)
      if (error) throw error
      setRequests(data || [])
    } catch (err) {
      toast.error('Failed to load requests')
    } finally {
      setLoading(false)
    }
  }

  const handleRespond = async (requestId, action) => {
    try {
      const { error } = await supabase.rpc('respond_to_custom_request', {
        p_request_id: requestId,
        p_action: action,
        p_note: noteText.trim() || null,
        p_price: counterPrice ? parseFloat(counterPrice) : null,
      })
      if (error) throw error
      toast.success(action === 'accept' ? 'Request accepted!' : 'Request declined')
      setRespondingId(null)
      setNoteText('')
      setCounterPrice('')
      fetchRequests()
    } catch (err) {
      toast.error(err.message || 'Failed to respond')
    }
  }

  const handleComplete = async (requestId) => {
    try {
      const { data, error } = await supabase.rpc('complete_custom_request', {
        p_request_id: requestId,
      })
      if (error) throw error
      toast.success(`Request completed! You earned ${formatCurrency(data.net_amount)}`)
      fetchRequests()
    } catch (err) {
      toast.error(err.message || 'Failed to complete')
    }
  }

  const toggleAcceptRequests = async () => {
    try {
      await updateProfile({ accepts_custom_requests: !profile.accepts_custom_requests })
      toast.success(profile.accepts_custom_requests ? 'Custom requests disabled' : 'Custom requests enabled')
    } catch {
      toast.error('Failed to update setting')
    }
  }

  const statusColors = {
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    accepted: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    declined: 'bg-red-500/10 text-red-400 border-red-500/30',
    completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    cancelled: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
  }

  return (
    <div className="space-y-5">
      {/* Settings */}
      <SectionCard title="Custom Request Settings" icon={ClipboardList}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Accept Custom Requests</p>
              <p className="text-xs text-zinc-500 mt-0.5">Allow fans to send you custom content requests</p>
            </div>
            <button
              onClick={toggleAcceptRequests}
              className={cn(
                'w-11 h-6 rounded-full transition-colors relative cursor-pointer',
                profile?.accepts_custom_requests ? 'bg-indigo-600' : 'bg-zinc-700'
              )}
            >
              <div className={cn(
                'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                profile?.accepts_custom_requests ? 'translate-x-5.5' : 'translate-x-0.5'
              )} />
            </button>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Minimum Price</label>
            <div className="relative w-32">
              <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="number"
                min="5"
                max="10000"
                step="1"
                value={profile?.custom_request_min_price || 25}
                onChange={async (e) => {
                  const val = parseFloat(e.target.value)
                  if (val >= 5) await updateProfile({ custom_request_min_price: val })
                }}
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg pl-8 pr-3 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-indigo-500/50"
              />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {['pending', 'accepted', 'completed', 'declined', 'all'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer capitalize whitespace-nowrap',
              filter === f ? 'bg-indigo-600 text-white' : 'bg-zinc-800/50 text-zinc-400 hover:text-white'
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Requests list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-zinc-500" size={24} />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardList size={40} className="text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">No {filter !== 'all' ? filter : ''} requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.id} className="bg-zinc-900/30 border border-white/5 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 flex-shrink-0">
                    {req.requester?.display_name?.[0] || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{req.requester?.display_name || 'User'}</p>
                    <p className="text-xs text-zinc-500">@{req.requester?.username}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{formatCurrency(req.price)}</span>
                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize', statusColors[req.status])}>
                    {req.status}
                  </span>
                </div>
              </div>
              <p className="text-sm text-zinc-300 mt-3">{req.description}</p>
              <p className="text-xs text-zinc-600 mt-2">{formatMessageTime(req.created_at)}</p>

              {req.creator_note && (
                <div className="mt-3 bg-zinc-800/50 rounded-lg p-3">
                  <p className="text-xs text-zinc-500 mb-1">Your note:</p>
                  <p className="text-sm text-zinc-300">{req.creator_note}</p>
                </div>
              )}

              {/* Actions */}
              {req.status === 'pending' && (
                <div className="mt-3">
                  {respondingId === req.id ? (
                    <div className="space-y-3 bg-zinc-800/30 rounded-xl p-3">
                      <textarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Add a note (optional)..."
                        rows={2}
                        className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none outline-none"
                      />
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1">Counter price (optional)</label>
                        <div className="relative w-32">
                          <DollarSign size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                          <input
                            type="number"
                            min="5"
                            step="1"
                            value={counterPrice}
                            onChange={e => setCounterPrice(e.target.value)}
                            placeholder={req.price}
                            className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-lg pl-7 pr-3 py-1.5 text-sm text-zinc-200 outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => handleRespond(req.id, 'accept')}>
                          <CheckCircle size={14} /> Accept
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleRespond(req.id, 'decline')}>
                          <XCircle size={14} /> Decline
                        </Button>
                        <button onClick={() => { setRespondingId(null); setNoteText(''); setCounterPrice('') }}
                          className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer ml-2">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRespondingId(req.id)}
                      className="text-sm text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
                    >
                      Respond →
                    </button>
                  )}
                </div>
              )}

              {req.status === 'accepted' && (
                <div className="mt-3">
                  <Button size="sm" onClick={() => handleComplete(req.id)}>
                    <Package size={14} /> Mark as Completed & Collect Payment
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Earnings Export Tab ────────────────────────────────────────────────────

function EarningsExportTab({ userId }) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [exporting, setExporting] = useState(false)
  const [preview, setPreview] = useState(null)

  const handleExport = async (format = 'csv') => {
    setExporting(true)
    try {
      const { data, error } = await supabase.rpc('export_creator_earnings', {
        p_creator_id: userId,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
      })
      if (error) throw error
      if (!data || data.length === 0) {
        toast.error('No transactions found for this period')
        return
      }

      setPreview(data.slice(0, 5))

      if (format === 'csv') {
        const headers = ['Date', 'Type', 'From', 'Gross Amount', 'Platform Fee', 'Net Amount', 'Status']
        const rows = data.map(t => [
          new Date(t.transaction_date).toLocaleDateString(),
          t.type,
          t.from_user,
          t.gross_amount,
          t.platform_fee,
          t.net_amount,
          t.status,
        ])
        const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `vyxhub-earnings-${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success(`Exported ${data.length} transactions`)
      }
    } catch (err) {
      toast.error(err.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <SectionCard title="Export Earnings" icon={Download}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-500/50 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 outline-none focus:ring-2 focus:ring-indigo-500/50 [color-scheme:dark]"
              />
            </div>
          </div>
          <p className="text-xs text-zinc-500">Leave empty to export all transactions</p>
          <Button onClick={() => handleExport('csv')} loading={exporting}>
            <Download size={16} />
            Export as CSV
          </Button>
        </div>
      </SectionCard>

      {preview && (
        <SectionCard title="Preview" icon={FileText}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">From</th>
                  <th className="pb-2 pr-4 text-right">Gross</th>
                  <th className="pb-2 pr-4 text-right">Fee</th>
                  <th className="pb-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((t, i) => (
                  <tr key={i} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-4 text-zinc-300 whitespace-nowrap">{new Date(t.transaction_date).toLocaleDateString()}</td>
                    <td className="py-2 pr-4 text-zinc-400 capitalize">{t.type.replace('_', ' ')}</td>
                    <td className="py-2 pr-4 text-zinc-400 truncate max-w-[120px]">{t.from_user}</td>
                    <td className="py-2 pr-4 text-right text-zinc-300">{formatCurrency(t.gross_amount)}</td>
                    <td className="py-2 pr-4 text-right text-red-400">-{formatCurrency(t.platform_fee)}</td>
                    <td className="py-2 text-right text-emerald-400 font-medium">{formatCurrency(t.net_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-600 mt-3">Showing first 5 rows of export</p>
        </SectionCard>
      )}
    </div>
  )
}

// ─── Promotions Tab ─────────────────────────────────────────────────────────

function PromotionsTab({ userId }) {
  const { profile } = useAuthStore()
  const [activePromo, setActivePromo] = useState(null)
  const [promoHistory, setPromoHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [discountPercent, setDiscountPercent] = useState(25)
  const [durationDays, setDurationDays] = useState(7)

  useEffect(() => { fetchPromos() }, [userId])

  const fetchPromos = async () => {
    setLoading(true)
    try {
      // Get active promotion
      const { data: active } = await supabase.rpc('get_active_promotion', { p_creator_id: userId })
      setActivePromo(active)

      // Get all promotions for history
      const { data: all } = await supabase
        .from('creator_promotions')
        .select('*')
        .eq('creator_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)
      setPromoHistory(all || [])
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!profile?.subscription_price || parseFloat(profile.subscription_price) <= 0) {
      return toast.error('Set a subscription price in Settings first')
    }
    setCreating(true)
    try {
      const { data, error } = await supabase.rpc('create_promotion', {
        p_creator_id: userId,
        p_discount_percent: discountPercent,
        p_duration_days: durationDays,
      })
      if (error) throw error
      toast.success(`Promotion created! ${discountPercent}% off for ${durationDays} days`)
      fetchPromos()
    } catch (err) {
      toast.error(err.message || 'Failed to create promotion')
    } finally {
      setCreating(false)
    }
  }

  const handleDeactivate = async () => {
    if (!activePromo?.id) return
    if (!confirm('Deactivate this promotion? New subscribers will pay full price.')) return
    setDeactivating(true)
    try {
      const { error } = await supabase.rpc('deactivate_promotion', {
        p_creator_id: userId,
        p_promo_id: activePromo.id,
      })
      if (error) throw error
      toast.success('Promotion deactivated')
      setActivePromo(null)
      fetchPromos()
    } catch (err) {
      toast.error('Failed to deactivate')
    } finally {
      setDeactivating(false)
    }
  }

  const subPrice = parseFloat(profile?.subscription_price) || 0
  const previewPrice = +(subPrice * (100 - discountPercent) / 100).toFixed(2)

  if (loading) return <PageLoader />

  return (
    <div className="space-y-5">
      {/* Active promotion */}
      {activePromo ? (
        <SectionCard title="Active Promotion" icon={Tag}>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl font-bold text-emerald-400">{activePromo.discount_percent}% OFF</span>
                  <span className="text-sm text-zinc-500 line-through">{formatCurrency(activePromo.original_price)}</span>
                  <span className="text-lg font-semibold text-white">{formatCurrency(activePromo.promo_price)}</span>
                </div>
                <p className="text-xs text-zinc-500">
                  Expires {new Date(activePromo.expires_at).toLocaleDateString()} · {activePromo.used_count} use{activePromo.used_count !== 1 ? 's' : ''}
                  {activePromo.max_uses ? ` / ${activePromo.max_uses} max` : ''}
                </p>
              </div>
            </div>
            <Button variant="danger" size="sm" onClick={handleDeactivate} loading={deactivating}>
              <XCircle size={14} /> End Promotion
            </Button>
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="Create Promotion" icon={Tag}>
          <div className="space-y-4">
            {subPrice <= 0 ? (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                <p className="text-xs text-amber-300">
                  Set a subscription price in Settings before creating promotions.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Discount</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={5}
                      max={90}
                      step={5}
                      value={discountPercent}
                      onChange={e => setDiscountPercent(Number(e.target.value))}
                      className="flex-1 accent-indigo-500"
                    />
                    <span className="text-lg font-bold text-indigo-400 min-w-[50px] text-right">{discountPercent}%</span>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-zinc-500">
                    <span>Regular: {formatCurrency(subPrice)}</span>
                    <span className="text-emerald-400 font-medium">Promo: {formatCurrency(previewPrice)}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Duration</label>
                  <div className="flex gap-2 flex-wrap">
                    {[3, 7, 14, 30, 60].map(d => (
                      <button
                        key={d}
                        onClick={() => setDurationDays(d)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                          durationDays === d ? 'bg-indigo-600 text-white' : 'bg-zinc-800/50 text-zinc-400 hover:text-white'
                        )}
                      >
                        {d} day{d !== 1 ? 's' : ''}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3">
                  <p className="text-xs text-indigo-300">
                    New subscribers will see a <strong>{discountPercent}% off</strong> badge on your profile.
                    They'll pay <strong>{formatCurrency(previewPrice)}/mo</strong> instead of {formatCurrency(subPrice)}/mo for their first month.
                  </p>
                </div>

                <Button onClick={handleCreate} loading={creating} className="w-full">
                  <Tag size={16} /> Launch {discountPercent}% Off Promotion
                </Button>
              </>
            )}
          </div>
        </SectionCard>
      )}

      {/* Promotion history */}
      {promoHistory.length > 0 && (
        <SectionCard title="Promotion History" icon={Clock}>
          <div className="space-y-3">
            {promoHistory.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                <div>
                  <p className="text-sm text-zinc-300">
                    {p.discount_percent}% off · {formatCurrency(p.promo_price)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {new Date(p.starts_at).toLocaleDateString()} — {new Date(p.expires_at).toLocaleDateString()}
                    · {p.used_count} use{p.used_count !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  p.active && new Date(p.expires_at) > new Date()
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-zinc-800 text-zinc-500'
                )}>
                  {p.active && new Date(p.expires_at) > new Date() ? 'Active' : 'Ended'}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

// ─── Referrals Tab ──────────────────────────────────────────────────────────

function ReferralsTab({ userId }) {
  const { profile } = useAuthStore()
  const [stats, setStats] = useState(null)
  const [recentReferrals, setRecentReferrals] = useState([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchData()
  }, [userId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [statsRes, referralsRes] = await Promise.all([
        supabase.rpc('get_referral_stats', { p_creator_id: userId }),
        supabase
          .from('referrals')
          .select('*, referred_user:referred_user_id(display_name, username, avatar_url)')
          .eq('referrer_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
      ])
      setStats(statsRes.data)
      setRecentReferrals(referralsRes.data || [])
    } finally {
      setLoading(false)
    }
  }

  const referralUrl = `https://vyxhub.com/r/@${profile?.username}`

  const handleCopy = () => {
    navigator.clipboard.writeText(referralUrl)
    setCopied(true)
    toast.success('Referral link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-5">
      <SectionCard title="How Referrals Work" icon={Gift}>
        <div className="space-y-3 text-sm text-zinc-400">
          <p>
            Share your <strong className="text-white">referral link</strong> with potential fans. 
            When they click it, a 24-hour cookie is saved. If they sign up within that window, they're linked to you as a referral.
          </p>
          <p>
            Referred users who subscribe on the platform earn you a reduced platform fee — you keep <strong className="text-emerald-400">80%</strong> instead of the standard 70%.
          </p>
        </div>
      </SectionCard>

      {/* Share link */}
      <SectionCard title="Your Referral Link" icon={Link2}>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-300 truncate">
            {referralUrl}
          </div>
          <Button size="sm" onClick={handleCopy}>
            {copied ? <CheckCircle size={14} /> : <Link2 size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="text-xs text-zinc-600 mt-2">Share this link to track referrals. Visitors who sign up within 24 hours are linked to you.</p>
      </SectionCard>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Referrals" value={stats?.total_referrals ?? 0} icon={Users} color="indigo" />
        <StatCard label="Subscribed" value={stats?.total_subscribed ?? 0} icon={CheckCircle} color="emerald" />
        <StatCard label="Commission" value={formatCurrency(stats?.total_commission ?? 0)} icon={DollarSign} color="amber" />
      </div>

      {/* Recent referrals */}
      <SectionCard title="Recent Referrals" icon={Users}>
        {recentReferrals.length === 0 ? (
          <p className="text-sm text-zinc-600">No referrals yet. Share your profile link to get started!</p>
        ) : (
          <div className="space-y-3">
            {recentReferrals.map(ref => (
              <div key={ref.id} className="flex items-center gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400">
                  {ref.referred_user?.display_name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-300 truncate">
                    {ref.referred_user?.display_name || ref.referred_user?.username || 'Unknown'}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Joined {new Date(ref.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  ref.status === 'earned' ? 'bg-emerald-500/10 text-emerald-400' :
                  ref.status === 'subscribed' ? 'bg-indigo-500/10 text-indigo-400' :
                  'bg-zinc-800 text-zinc-500'
                )}>
                  {ref.status === 'earned' ? 'Earned' : ref.status === 'subscribed' ? 'Subscribed' : 'Signed up'}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ─── Main Dashboard Page ────────────────────────────────────────────────────

export default function CreatorDashboardPage() {
  const { profile, user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('overview')
  const [analytics, setAnalytics] = useState(null)
  const [period, setPeriod] = useState('30d')
  const [loading, setLoading] = useState(true)
  const [pendingRequests, setPendingRequests] = useState(0)

  useEffect(() => {
    if (!user || !profile?.is_creator) return
    fetchAnalytics()
    fetchPendingCount()
  }, [user, profile?.is_creator, period])

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_creator_analytics', {
        p_creator_id: user.id,
        p_period: period,
      })
      if (error) throw error
      setAnalytics(data)
    } catch (err) {
      console.error('Analytics error:', err)
      toast.error('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  const fetchPendingCount = async () => {
    const { count } = await supabase
      .from('custom_requests')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', user.id)
      .eq('status', 'pending')
    setPendingRequests(count || 0)
  }

  if (!profile?.is_creator) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 px-6 text-center">
        <div className="p-4 rounded-full bg-indigo-500/10">
          <DollarSign size={32} className="text-indigo-400" />
        </div>
        <h2 className="text-xl font-bold">Creator Dashboard</h2>
        <p className="text-zinc-500 text-sm max-w-sm">
          Activate your creator profile in Settings to start earning and access your dashboard.
        </p>
      </div>
    )
  }

  return (
    <div>
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <h1 className="text-xl font-bold text-white">Creator Dashboard</h1>
      </header>

      {/* Tab navigation */}
      <div className="px-5 py-3 border-b border-zinc-800/50 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={BarChart3} label="Overview" />
          <TabButton active={activeTab === 'mass-message'} onClick={() => setActiveTab('mass-message')} icon={Megaphone} label="Mass Message" />
          <TabButton active={activeTab === 'promotions'} onClick={() => setActiveTab('promotions')} icon={Tag} label="Promotions" />
          <TabButton active={activeTab === 'referrals'} onClick={() => setActiveTab('referrals')} icon={Gift} label="Referrals" />
          <TabButton active={activeTab === 'requests'} onClick={() => setActiveTab('requests')} icon={ClipboardList} label="Requests" badge={pendingRequests} />
          <TabButton active={activeTab === 'export'} onClick={() => setActiveTab('export')} icon={Download} label="Export" />
        </div>
      </div>

      <div className="p-5">
        {activeTab === 'overview' && (
          loading && !analytics ? <PageLoader /> : <OverviewTab analytics={analytics} period={period} setPeriod={setPeriod} />
        )}
        {activeTab === 'mass-message' && <MassMessageTab userId={user.id} />}
        {activeTab === 'promotions' && <PromotionsTab userId={user.id} />}
        {activeTab === 'referrals' && <ReferralsTab userId={user.id} />}
        {activeTab === 'requests' && <CustomRequestsTab userId={user.id} />}
        {activeTab === 'export' && <EarningsExportTab userId={user.id} />}
      </div>
    </div>
  )
}
