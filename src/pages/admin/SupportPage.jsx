import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { PageLoader } from '../../components/ui/Spinner'
import { toast } from 'sonner'
import { cn, formatRelativeTime } from '../../lib/utils'
import {
  Search, ShieldCheck, ShieldAlert, AlertTriangle, Ban,
  CheckCircle, XCircle, Eye, UserX, RotateCcw, Filter,
  Flag, Clock, ChevronDown, ChevronUp, ExternalLink
} from 'lucide-react'

// ─── Report Queue ───────────────────────────────────────────────────
function ReportQueue() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [expandedId, setExpandedId] = useState(null)

  const fetchReports = async () => {
    setLoading(true)
    let query = supabase
      .from('reports')
      .select(`
        *,
        reporter:profiles!reporter_id(id, username, display_name, avatar_url),
        reported_user:profiles!reported_user_id(id, username, display_name, avatar_url, is_verified, is_suspended, is_banned),
        reported_post:posts!reported_post_id(id, content, post_type, created_at, author_id)
      `)
      .order('created_at', { ascending: false })
      .limit(100)

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data, error } = await query
    if (!error) setReports(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchReports() }, [filter])

  const handleResolve = async (reportId, status) => {
    try {
      const { error } = await supabase.rpc('staff_resolve_report', {
        p_report_id: reportId,
        p_status: status,
      })
      if (error) throw error
      toast.success(`Report ${status}`)
      fetchReports()
    } catch (err) {
      toast.error(err.message || 'Failed')
    }
  }

  const statusFilters = [
    { value: 'pending', label: 'Pending', color: 'text-amber-400' },
    { value: 'reviewed', label: 'Reviewed', color: 'text-blue-400' },
    { value: 'actioned', label: 'Actioned', color: 'text-emerald-400' },
    { value: 'dismissed', label: 'Dismissed', color: 'text-zinc-500' },
    { value: 'all', label: 'All', color: 'text-zinc-300' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={14} className="text-zinc-500" />
        {statusFilters.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
              filter === f.value ? cn(f.color, 'bg-zinc-800') : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-zinc-500 text-sm">Loading reports...</div>
      ) : reports.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 text-sm">No {filter} reports</div>
      ) : (
        <div className="space-y-2">
          {reports.map(report => (
            <div
              key={report.id}
              className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl overflow-hidden"
            >
              <button
                onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                className="w-full flex items-center gap-3 p-4 text-left cursor-pointer hover:bg-zinc-900/50 transition-colors"
              >
                <Flag size={16} className={cn(
                  report.status === 'pending' ? 'text-amber-400' :
                  report.status === 'actioned' ? 'text-red-400' :
                  report.status === 'dismissed' ? 'text-zinc-500' : 'text-blue-400'
                )} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">
                      {report.reason?.replace(/_/g, ' ')}
                    </span>
                    <span className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full font-medium',
                      report.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                      report.status === 'actioned' ? 'bg-red-500/10 text-red-400' :
                      report.status === 'dismissed' ? 'bg-zinc-500/10 text-zinc-500' : 'bg-blue-500/10 text-blue-400'
                    )}>
                      {report.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                    <span>by @{report.reporter?.username}</span>
                    <span>→</span>
                    <span>@{report.reported_user?.username || 'unknown'}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(report.created_at)}</span>
                  </div>
                </div>

                {expandedId === report.id ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
              </button>

              {expandedId === report.id && (
                <div className="px-4 pb-4 border-t border-zinc-800/50 pt-3 space-y-3">
                  {report.description && (
                    <div>
                      <span className="text-xs text-zinc-500">Description</span>
                      <p className="text-sm text-zinc-300 mt-0.5">{report.description}</p>
                    </div>
                  )}

                  {report.reported_post && (
                    <div className="bg-zinc-800/30 rounded-xl p-3">
                      <span className="text-xs text-zinc-500">Reported Post</span>
                      <p className="text-sm text-zinc-300 mt-0.5 line-clamp-3">{report.reported_post.content}</p>
                      <a
                        href={`/post/${report.reported_post.id}`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:underline mt-1"
                      >
                        View post <ExternalLink size={10} />
                      </a>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Avatar src={report.reported_user?.avatar_url} alt={report.reported_user?.display_name} size="sm" />
                    <div>
                      <span className="text-sm font-medium text-white">{report.reported_user?.display_name}</span>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <span>@{report.reported_user?.username}</span>
                        {report.reported_user?.is_verified && <ShieldCheck size={11} className="text-indigo-400" />}
                        {report.reported_user?.is_suspended && <span className="text-amber-400">Suspended</span>}
                        {report.reported_user?.is_banned && <span className="text-red-400">Banned</span>}
                      </div>
                    </div>
                  </div>

                  {report.status === 'pending' && (
                    <div className="flex items-center gap-2 pt-2">
                      <Button size="sm" variant="danger" onClick={() => handleResolve(report.id, 'actioned')}>
                        <CheckCircle size={14} /> Action
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleResolve(report.id, 'dismissed')}>
                        <XCircle size={14} /> Dismiss
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleResolve(report.id, 'reviewed')}>
                        <Eye size={14} /> Mark Reviewed
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── User Lookup & Moderation ─────────────────────────────────────
function UserModeration() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)

  const handleSearch = async () => {
    const q = query.trim()
    if (q.length < 2) return
    setSearching(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_verified, is_creator, is_suspended, is_banned, system_role, created_at, follower_count, subscriber_count, verified_at, verified_by')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(20)
    setResults(data || [])
    setSearching(false)
  }

  const handleVerify = async (userId, verify) => {
    setActionLoading(userId)
    try {
      const { error } = await supabase.rpc('staff_verify_profile', {
        p_target_user_id: userId,
        p_verify: verify,
      })
      if (error) throw error
      toast.success(verify ? 'Profile verified' : 'Verification removed')
      handleSearch() // refresh
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSuspend = async (userId, suspend) => {
    const reason = suspend ? prompt('Reason for suspension:') : null
    if (suspend && !reason) return
    setActionLoading(userId)
    try {
      const { error } = await supabase.rpc('staff_suspend_user', {
        p_target_user_id: userId,
        p_suspend: suspend,
        p_reason: reason,
      })
      if (error) throw error
      toast.success(suspend ? 'User suspended' : 'User unsuspended')
      handleSearch()
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setActionLoading(null)
    }
  }

  const handleBan = async (userId, ban) => {
    const reason = ban ? prompt('Reason for ban:') : null
    if (ban && !reason) return
    if (ban && !confirm('Are you sure you want to BAN this user? This is a serious action.')) return
    setActionLoading(userId)
    try {
      const { error } = await supabase.rpc('staff_ban_user', {
        p_target_user_id: userId,
        p_ban: ban,
        p_reason: reason,
      })
      if (error) throw error
      toast.success(ban ? 'User banned' : 'User unbanned')
      handleSearch()
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search by username or display name..."
          icon={Search}
        />
        <Button onClick={handleSearch} loading={searching}>Search</Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map(user => (
            <div key={user.id} className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <Avatar src={user.avatar_url} alt={user.display_name} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white">{user.display_name}</span>
                    <span className="text-sm text-zinc-500">@{user.username}</span>
                    {user.is_verified && (
                      <span className="text-xs bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <ShieldCheck size={10} /> Verified
                      </span>
                    )}
                    {user.is_creator && (
                      <span className="text-xs bg-pink-500/10 text-pink-400 px-2 py-0.5 rounded-full">Creator</span>
                    )}
                    {user.system_role && (
                      <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full uppercase">{user.system_role}</span>
                    )}
                    {user.is_suspended && (
                      <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle size={10} /> Suspended
                      </span>
                    )}
                    {user.is_banned && (
                      <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Ban size={10} /> Banned
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                    <span>{user.follower_count || 0} followers</span>
                    {user.subscriber_count > 0 && <span>{user.subscriber_count} subs</span>}
                    <span>Joined {formatRelativeTime(user.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Actions — can't act on staff */}
              {!user.system_role && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800/50 flex-wrap">
                  {user.is_verified ? (
                    <Button size="sm" variant="outline" onClick={() => handleVerify(user.id, false)} loading={actionLoading === user.id}>
                      <XCircle size={13} /> Unverify
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => handleVerify(user.id, true)} loading={actionLoading === user.id}>
                      <ShieldCheck size={13} /> Verify
                    </Button>
                  )}

                  {user.is_banned ? (
                    <Button size="sm" variant="outline" onClick={() => handleBan(user.id, false)} loading={actionLoading === user.id}>
                      <RotateCcw size={13} /> Unban
                    </Button>
                  ) : user.is_suspended ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleSuspend(user.id, false)} loading={actionLoading === user.id}>
                        <RotateCcw size={13} /> Unsuspend
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleBan(user.id, true)} loading={actionLoading === user.id}>
                        <Ban size={13} /> Ban
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleSuspend(user.id, true)} loading={actionLoading === user.id}>
                        <UserX size={13} /> Suspend
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleBan(user.id, true)} loading={actionLoading === user.id}>
                        <Ban size={13} /> Ban
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Moderation Log ────────────────────────────────────────────────
function ModerationLog() {
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('moderation_actions')
        .select(`
          *,
          moderator:profiles!moderator_id(username, display_name),
          target_user:profiles!target_user_id(username, display_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100)
      setActions(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  if (loading) return <div className="py-12 text-center text-zinc-500 text-sm">Loading...</div>

  return (
    <div className="space-y-2">
      {actions.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 text-sm">No moderation actions yet</div>
      ) : (
        actions.map(action => (
          <div key={action.id} className="flex items-center gap-3 p-3 bg-zinc-900/30 rounded-xl border border-zinc-800/50">
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
              action.action_type.includes('ban') ? 'bg-red-500/10' :
              action.action_type.includes('suspend') ? 'bg-amber-500/10' :
              action.action_type.includes('verify') ? 'bg-indigo-500/10' :
              'bg-zinc-800/50'
            )}>
              {action.action_type.includes('ban') ? <Ban size={14} className="text-red-400" /> :
               action.action_type.includes('suspend') ? <AlertTriangle size={14} className="text-amber-400" /> :
               action.action_type.includes('verify') ? <ShieldCheck size={14} className="text-indigo-400" /> :
               <Clock size={14} className="text-zinc-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-200">
                <span className="font-medium">{action.moderator?.display_name}</span>
                <span className="text-zinc-500"> {action.action_type.replace(/_/g, ' ')} </span>
                {action.target_user && (
                  <span className="font-medium">@{action.target_user.username}</span>
                )}
              </div>
              {action.reason && (
                <p className="text-xs text-zinc-500 mt-0.5 truncate">{action.reason}</p>
              )}
            </div>
            <span className="text-[10px] text-zinc-600 flex-shrink-0">{formatRelativeTime(action.created_at)}</span>
          </div>
        ))
      )}
    </div>
  )
}

// ─── Main Support Page ─────────────────────────────────────────────
const supportTabs = [
  { id: 'reports', label: 'Reports', icon: Flag },
  { id: 'users', label: 'Users', icon: Search },
  { id: 'log', label: 'Mod Log', icon: Clock },
]

export default function SupportPage() {
  const [tab, setTab] = useState('reports')

  return (
    <div>
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center">
            <ShieldAlert size={18} className="text-indigo-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Support Panel</h1>
        </div>
      </header>

      <div className="px-5 py-4">
        {/* Tabs */}
        <div className="flex gap-1.5 mb-6">
          {supportTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer',
                tab === t.id
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-zinc-500 hover:text-zinc-300 bg-zinc-900/30 border border-zinc-800/50'
              )}
            >
              <t.icon size={15} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'reports' && <ReportQueue />}
        {tab === 'users' && <UserModeration />}
        {tab === 'log' && <ModerationLog />}
      </div>
    </div>
  )
}
