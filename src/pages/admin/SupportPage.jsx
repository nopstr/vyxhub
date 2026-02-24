import { useState, useEffect, useCallback } from 'react'
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
  Flag, Clock, ChevronDown, ChevronUp, ExternalLink,
  Bot, Globe, Gavel, Plus, Trash2, Power, PowerOff,
  CheckSquare, Square, MinusSquare, Scale,
  Users, Wifi, WifiOff, UserCheck, Headset
} from 'lucide-react'

// ─── Report Queue (with Bulk Actions) ──────────────────────────────
function ReportQueue() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [expandedId, setExpandedId] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

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
    setSelected(new Set())
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

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === reports.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(reports.map(r => r.id)))
    }
  }

  const handleBulkAction = async (status) => {
    if (selected.size === 0) return
    const label = status === 'dismissed' ? 'dismiss' : 'resolve'
    if (!confirm(`${label} ${selected.size} report(s)?`)) return

    setBulkLoading(true)
    try {
      const { data, error } = await supabase.rpc('staff_bulk_resolve_reports', {
        p_report_ids: Array.from(selected),
        p_status: status,
      })
      if (error) throw error
      toast.success(`${data} report(s) ${status}`)
      fetchReports()
    } catch (err) {
      toast.error(err.message || 'Bulk action failed')
    } finally {
      setBulkLoading(false)
    }
  }

  const statusFilters = [
    { value: 'pending', label: 'Pending', color: 'text-amber-400' },
    { value: 'reviewed', label: 'Reviewed', color: 'text-red-400' },
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

      {/* Bulk action bar */}
      {reports.length > 0 && filter === 'pending' && (
        <div className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
          <button onClick={toggleSelectAll} className="text-zinc-400 hover:text-white cursor-pointer">
            {selected.size === reports.length ? <CheckSquare size={18} /> :
             selected.size > 0 ? <MinusSquare size={18} /> : <Square size={18} />}
          </button>
          <span className="text-xs text-zinc-500">
            {selected.size > 0 ? `${selected.size} selected` : 'Select reports'}
          </span>
          {selected.size > 0 && (
            <>
              <Button size="sm" variant="danger" onClick={() => handleBulkAction('actioned')} loading={bulkLoading}>
                <CheckCircle size={13} /> Bulk Action
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction('dismissed')} loading={bulkLoading}>
                <XCircle size={13} /> Bulk Dismiss
              </Button>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-zinc-500 text-sm">Loading reports...</div>
      ) : reports.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 text-sm">No {filter} reports</div>
      ) : (
        <div className="space-y-2">
          {reports.map(report => (
            <div
              key={report.id}
              className={cn(
                'bg-zinc-900/30 border rounded-2xl overflow-hidden',
                selected.has(report.id) ? 'border-red-500/50' : 'border-zinc-800/50'
              )}
            >
              <div className="flex items-center gap-2">
                {filter === 'pending' && (
                  <button
                    onClick={() => toggleSelect(report.id)}
                    className="pl-4 text-zinc-400 hover:text-white cursor-pointer"
                  >
                    {selected.has(report.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                )}
                <button
                  onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                  className={cn(
                    'flex-1 flex items-center gap-3 p-4 text-left cursor-pointer hover:bg-zinc-900/50 transition-colors',
                    filter === 'pending' && 'pl-2'
                  )}
                >
                  <Flag size={16} className={cn(
                    report.status === 'pending' ? 'text-amber-400' :
                    report.status === 'actioned' ? 'text-red-400' :
                    report.status === 'dismissed' ? 'text-zinc-500' : 'text-red-400'
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
                        report.status === 'dismissed' ? 'bg-zinc-500/10 text-zinc-500' : 'bg-red-500/10 text-red-400'
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
              </div>

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
                        className="inline-flex items-center gap-1 text-xs text-red-400 hover:underline mt-1"
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
                        {report.reported_user?.is_verified && <ShieldCheck size={11} className="text-red-400 fill-current [&>path:last-child]:stroke-white" />}
                        {report.reported_user?.partner_tier === 'verified' && <ShieldCheck size={10} className="text-emerald-400 fill-current [&>path:last-child]:stroke-white" />}
                        {report.reported_user?.partner_tier === 'red' && <ShieldCheck size={10} className="text-red-400 fill-current [&>path:last-child]:stroke-white" />}
                        {report.reported_user?.partner_tier === 'gold' && <ShieldCheck size={10} className="text-amber-400 fill-current [&>path:last-child]:stroke-white" />}
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

// ─── User Lookup & Moderation (with Bulk Actions) ──────────────────
function UserModeration() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

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
    setSelected(new Set())
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
      handleSearch()
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

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const nonStaffResults = results.filter(u => !u.system_role)

  const toggleSelectAll = () => {
    if (selected.size === nonStaffResults.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(nonStaffResults.map(u => u.id)))
    }
  }

  const handleBulkSuspend = async () => {
    if (selected.size === 0) return
    const reason = prompt(`Reason for suspending ${selected.size} user(s):`)
    if (!reason) return
    setBulkLoading(true)
    try {
      const { data, error } = await supabase.rpc('staff_bulk_suspend', {
        p_user_ids: Array.from(selected),
        p_suspend: true,
        p_reason: reason,
      })
      if (error) throw error
      toast.success(`${data} user(s) suspended`)
      handleSearch()
    } catch (err) {
      toast.error(err.message || 'Bulk suspend failed')
    } finally {
      setBulkLoading(false)
    }
  }

  const handleBulkBan = async () => {
    if (selected.size === 0) return
    const reason = prompt(`Reason for banning ${selected.size} user(s):`)
    if (!reason) return
    if (!confirm(`Are you sure you want to BAN ${selected.size} user(s)?`)) return
    setBulkLoading(true)
    try {
      const { data, error } = await supabase.rpc('staff_bulk_ban', {
        p_user_ids: Array.from(selected),
        p_ban: true,
        p_reason: reason,
      })
      if (error) throw error
      toast.success(`${data} user(s) banned`)
      handleSearch()
    } catch (err) {
      toast.error(err.message || 'Bulk ban failed')
    } finally {
      setBulkLoading(false)
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

      {/* Bulk action bar */}
      {results.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
          <button onClick={toggleSelectAll} className="text-zinc-400 hover:text-white cursor-pointer">
            {selected.size === nonStaffResults.length && nonStaffResults.length > 0 ? <CheckSquare size={18} /> :
             selected.size > 0 ? <MinusSquare size={18} /> : <Square size={18} />}
          </button>
          <span className="text-xs text-zinc-500">
            {selected.size > 0 ? `${selected.size} selected` : 'Select users'}
          </span>
          {selected.size > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={handleBulkSuspend} loading={bulkLoading}>
                <UserX size={13} /> Bulk Suspend
              </Button>
              <Button size="sm" variant="danger" onClick={handleBulkBan} loading={bulkLoading}>
                <Ban size={13} /> Bulk Ban
              </Button>
            </>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map(user => (
            <div key={user.id} className={cn(
              'bg-zinc-900/30 border rounded-2xl p-4',
              selected.has(user.id) ? 'border-red-500/50' : 'border-zinc-800/50'
            )}>
              <div className="flex items-start gap-3">
                {!user.system_role && (
                  <button onClick={() => toggleSelect(user.id)} className="mt-1 text-zinc-400 hover:text-white cursor-pointer">
                    {selected.has(user.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                )}
                <Avatar src={user.avatar_url} alt={user.display_name} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white">{user.display_name}</span>
                    <span className="text-sm text-zinc-500">@{user.username}</span>
                    {user.is_verified && (
                      <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <ShieldCheck size={10} className="fill-current [&>path:last-child]:stroke-white" /> Verified
                      </span>
                    )}
                    {user.partner_tier && (
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full flex items-center gap-1',
                        user.partner_tier === 'gold' ? 'bg-amber-500/10 text-amber-400' :
                        user.partner_tier === 'red' ? 'bg-red-500/10 text-red-400' :
                        'bg-emerald-500/10 text-emerald-400'
                      )}>
                        <ShieldCheck size={10} className="fill-current [&>path:last-child]:stroke-white" /> {user.partner_tier.charAt(0).toUpperCase() + user.partner_tier.slice(1)} Partner
                      </span>
                    )}
                    {user.is_creator && (
                      <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">Creator</span>
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

// ─── Auto-Moderation Rules ─────────────────────────────────────────
function AutoModeration() {
  const [rules, setRules] = useState([])
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [viewMode, setViewMode] = useState('rules') // 'rules' | 'log'
  const [form, setForm] = useState({
    name: '', description: '', rule_type: 'keyword', pattern: '',
    action: 'flag', severity: 'medium', applies_to: 'posts'
  })
  const [saving, setSaving] = useState(false)

  const fetchRules = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('auto_moderation_rules')
      .select('*')
      .order('created_at', { ascending: false })
    setRules(data || [])
    setLoading(false)
  }

  const fetchLog = async () => {
    const { data } = await supabase
      .from('auto_moderation_log')
      .select(`
        *,
        target_user:profiles!target_user_id(username, display_name)
      `)
      .order('created_at', { ascending: false })
      .limit(100)
    setLog(data || [])
  }

  useEffect(() => {
    fetchRules()
    fetchLog()
  }, [])

  const handleCreate = async () => {
    if (!form.name || !form.pattern) {
      toast.error('Name and pattern are required')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('create_auto_mod_rule', {
        p_name: form.name,
        p_description: form.description || null,
        p_rule_type: form.rule_type,
        p_pattern: form.pattern,
        p_action: form.action,
        p_severity: form.severity,
        p_applies_to: form.applies_to,
      })
      if (error) throw error
      toast.success('Rule created')
      setShowForm(false)
      setForm({ name: '', description: '', rule_type: 'keyword', pattern: '', action: 'flag', severity: 'medium', applies_to: 'posts' })
      fetchRules()
    } catch (err) {
      toast.error(err.message || 'Failed to create rule')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (rule) => {
    try {
      const { error } = await supabase.rpc('update_auto_mod_rule', {
        p_rule_id: rule.id,
        p_is_active: !rule.is_active,
      })
      if (error) throw error
      toast.success(rule.is_active ? 'Rule disabled' : 'Rule enabled')
      fetchRules()
    } catch (err) {
      toast.error(err.message || 'Failed')
    }
  }

  const handleDelete = async (ruleId) => {
    if (!confirm('Delete this rule? This cannot be undone.')) return
    try {
      const { error } = await supabase.rpc('delete_auto_mod_rule', { p_rule_id: ruleId })
      if (error) throw error
      toast.success('Rule deleted')
      fetchRules()
    } catch (err) {
      toast.error(err.message || 'Failed')
    }
  }

  const handleMarkFalsePositive = async (logId) => {
    try {
      const { error } = await supabase
        .from('auto_moderation_log')
        .update({ is_false_positive: true, reviewed_by: (await supabase.auth.getUser()).data.user?.id, reviewed_at: new Date().toISOString() })
        .eq('id', logId)
      if (error) throw error
      toast.success('Marked as false positive')
      fetchLog()
    } catch (err) {
      toast.error(err.message || 'Failed')
    }
  }

  const severityColors = { low: 'text-zinc-400', medium: 'text-amber-400', high: 'text-orange-400', critical: 'text-red-400' }
  const actionColors = { flag: 'text-amber-400', hide: 'text-orange-400', suspend_author: 'text-red-400' }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          <button
            onClick={() => setViewMode('rules')}
            className={cn(
              'px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors',
              viewMode === 'rules' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            Rules ({rules.length})
          </button>
          <button
            onClick={() => setViewMode('log')}
            className={cn(
              'px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors',
              viewMode === 'log' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            Activity Log ({log.length})
          </button>
        </div>
        {viewMode === 'rules' && (
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus size={14} /> New Rule
          </Button>
        )}
      </div>

      {/* Create Rule Form */}
      {showForm && (
        <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-white">New Auto-Moderation Rule</h3>
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Rule name"
            />
            <select
              value={form.rule_type}
              onChange={e => setForm(f => ({ ...f, rule_type: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
            >
              <option value="keyword">Keyword Match</option>
              <option value="regex">Regex Pattern</option>
              <option value="spam_link">Spam Link</option>
              <option value="duplicate">Duplicate Content</option>
            </select>
          </div>
          <Input
            value={form.pattern}
            onChange={e => setForm(f => ({ ...f, pattern: e.target.value }))}
            placeholder={form.rule_type === 'keyword' ? 'word1, word2, word3 (comma-separated)' :
                         form.rule_type === 'regex' ? 'Regular expression pattern' :
                         form.rule_type === 'spam_link' ? 'suspicious-domain.com, scam-site.net' :
                         'Content will be checked for duplicates'}
          />
          <Input
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Description (optional)"
          />
          <div className="grid grid-cols-3 gap-3">
            <select
              value={form.action}
              onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
            >
              <option value="flag">Flag (auto-report)</option>
              <option value="hide">Hide post</option>
              <option value="suspend_author">Suspend author</option>
            </select>
            <select
              value={form.severity}
              onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <select
              value={form.applies_to}
              onChange={e => setForm(f => ({ ...f, applies_to: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
            >
              <option value="posts">Posts only</option>
              <option value="comments">Comments only</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} loading={saving}>Create Rule</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-zinc-500 text-sm">Loading...</div>
      ) : viewMode === 'rules' ? (
        /* Rules list */
        rules.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-sm">No auto-moderation rules yet</div>
        ) : (
          <div className="space-y-2">
            {rules.map(rule => (
              <div key={rule.id} className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white">{rule.name}</span>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium uppercase',
                        rule.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-500'
                      )}>
                        {rule.is_active ? 'Active' : 'Disabled'}
                      </span>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', `bg-zinc-800 ${severityColors[rule.severity]}`)}>
                        {rule.severity}
                      </span>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', `bg-zinc-800 ${actionColors[rule.action]}`)}>
                        {rule.action.replace('_', ' ')}
                      </span>
                    </div>
                    {rule.description && (
                      <p className="text-xs text-zinc-500 mt-1">{rule.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-zinc-600">
                      <span className="bg-zinc-800/50 px-2 py-0.5 rounded">{rule.rule_type}</span>
                      <span className="truncate max-w-[200px] text-zinc-500 font-mono text-[11px]">{rule.pattern}</span>
                      <span>·</span>
                      <span>{rule.applies_to}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleToggle(rule)}
                      className={cn('p-1.5 rounded-lg cursor-pointer transition-colors',
                        rule.is_active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-zinc-500 hover:bg-zinc-800'
                      )}
                      title={rule.is_active ? 'Disable' : 'Enable'}
                    >
                      {rule.is_active ? <Power size={14} /> : <PowerOff size={14} />}
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Activity Log */
        log.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-sm">No auto-moderation activity yet</div>
        ) : (
          <div className="space-y-2">
            {log.map(entry => (
              <div key={entry.id} className={cn(
                'flex items-center gap-3 p-3 rounded-xl border',
                entry.is_false_positive ? 'bg-zinc-900/20 border-zinc-800/30 opacity-60' : 'bg-zinc-900/30 border-zinc-800/50'
              )}>
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                  entry.action_taken === 'flag' ? 'bg-amber-500/10' :
                  entry.action_taken === 'hide' ? 'bg-orange-500/10' : 'bg-red-500/10'
                )}>
                  <Bot size={14} className={actionColors[entry.action_taken] || 'text-zinc-400'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200">
                    <span className="font-medium">{entry.rule_name}</span>
                    <span className="text-zinc-500"> {entry.action_taken.replace('_', ' ')} </span>
                    {entry.target_user && <span className="font-medium">@{entry.target_user.username}</span>}
                  </div>
                  {entry.matched_content && (
                    <p className="text-xs text-zinc-500 mt-0.5 truncate">&ldquo;{entry.matched_content}&rdquo;</p>
                  )}
                  {entry.is_false_positive && (
                    <span className="text-[10px] text-amber-400">False positive</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!entry.is_false_positive && (
                    <button
                      onClick={() => handleMarkFalsePositive(entry.id)}
                      className="text-xs text-zinc-500 hover:text-amber-400 cursor-pointer"
                      title="Mark as false positive"
                    >
                      <XCircle size={14} />
                    </button>
                  )}
                  <span className="text-[10px] text-zinc-600">{formatRelativeTime(entry.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

// ─── Appeals Queue ─────────────────────────────────────────────────
function AppealsQueue() {
  const [appeals, setAppeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [actionLoading, setActionLoading] = useState(null)

  const fetchAppeals = async () => {
    setLoading(true)
    let query = supabase
      .from('appeals')
      .select(`
        *,
        user:profiles!user_id(id, username, display_name, avatar_url, is_suspended, is_banned),
        reviewer:profiles!reviewed_by(username, display_name)
      `)
      .order('created_at', { ascending: false })
      .limit(100)

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data, error } = await query
    if (!error) setAppeals(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchAppeals() }, [filter])

  const handleResolve = async (appealId, status) => {
    const notes = prompt(`${status === 'approved' ? 'Approval' : status === 'denied' ? 'Denial' : 'Review'} notes (optional):`)
    setActionLoading(appealId)
    try {
      const { error } = await supabase.rpc('staff_resolve_appeal', {
        p_appeal_id: appealId,
        p_status: status,
        p_reviewer_notes: notes || null,
      })
      if (error) throw error
      toast.success(`Appeal ${status}`)
      fetchAppeals()
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setActionLoading(null)
    }
  }

  const statusFilters = [
    { value: 'pending', label: 'Pending', color: 'text-amber-400' },
    { value: 'under_review', label: 'Under Review', color: 'text-red-400' },
    { value: 'approved', label: 'Approved', color: 'text-emerald-400' },
    { value: 'denied', label: 'Denied', color: 'text-red-400' },
    { value: 'all', label: 'All', color: 'text-zinc-300' },
  ]

  const typeIcons = {
    suspension: <AlertTriangle size={14} className="text-amber-400" />,
    ban: <Ban size={14} className="text-red-400" />,
    post_removal: <XCircle size={14} className="text-orange-400" />,
    other: <Scale size={14} className="text-zinc-400" />,
  }

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
        <div className="py-12 text-center text-zinc-500 text-sm">Loading appeals...</div>
      ) : appeals.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 text-sm">No {filter} appeals</div>
      ) : (
        <div className="space-y-2">
          {appeals.map(appeal => (
            <div key={appeal.id} className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                {typeIcons[appeal.appeal_type]}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white capitalize">
                      {appeal.appeal_type.replace('_', ' ')} Appeal
                    </span>
                    <span className={cn(
                      'text-[10px] px-2 py-0.5 rounded-full font-medium',
                      appeal.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                      appeal.status === 'under_review' ? 'bg-red-500/10 text-red-400' :
                      appeal.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                      'bg-red-500/10 text-red-400'
                    )}>
                      {appeal.status.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] text-zinc-600">{formatRelativeTime(appeal.created_at)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Avatar src={appeal.user?.avatar_url} alt={appeal.user?.display_name} size="sm" />
                <div>
                  <span className="text-sm font-medium text-white">{appeal.user?.display_name}</span>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <span>@{appeal.user?.username}</span>
                    {appeal.user?.is_suspended && <span className="text-amber-400">Suspended</span>}
                    {appeal.user?.is_banned && <span className="text-red-400">Banned</span>}
                  </div>
                </div>
              </div>

              <div className="bg-zinc-800/30 rounded-xl p-3">
                <span className="text-xs text-zinc-500">Appeal Reason</span>
                <p className="text-sm text-zinc-300 mt-0.5">{appeal.reason}</p>
              </div>

              {appeal.evidence_urls?.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-zinc-500">Evidence:</span>
                  {appeal.evidence_urls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener" className="text-xs text-red-400 hover:underline flex items-center gap-1">
                      Link {i + 1} <ExternalLink size={10} />
                    </a>
                  ))}
                </div>
              )}

              {appeal.reviewer_notes && (
                <div className="bg-zinc-800/30 rounded-xl p-3">
                  <span className="text-xs text-zinc-500">Staff Notes</span>
                  <p className="text-sm text-zinc-300 mt-0.5">{appeal.reviewer_notes}</p>
                  {appeal.reviewer && (
                    <span className="text-xs text-zinc-600 mt-1 block">— {appeal.reviewer.display_name}</span>
                  )}
                </div>
              )}

              {(appeal.status === 'pending' || appeal.status === 'under_review') && (
                <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/50">
                  <Button size="sm" onClick={() => handleResolve(appeal.id, 'approved')} loading={actionLoading === appeal.id}>
                    <CheckCircle size={14} /> Approve
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleResolve(appeal.id, 'denied')} loading={actionLoading === appeal.id}>
                    <XCircle size={14} /> Deny
                  </Button>
                  {appeal.status === 'pending' && (
                    <Button size="sm" variant="outline" onClick={() => handleResolve(appeal.id, 'under_review')} loading={actionLoading === appeal.id}>
                      <Eye size={14} /> Under Review
                    </Button>
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

// ─── IP Ban Management ────────────────────────────────────────────
function IPBanManagement() {
  const [bans, setBans] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ip_address: '', reason: '', expires_at: '' })
  const [saving, setSaving] = useState(false)
  const [userIpLookup, setUserIpLookup] = useState('')
  const [userIps, setUserIps] = useState([])
  const [lookingUp, setLookingUp] = useState(false)

  const fetchBans = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('banned_ips')
      .select(`
        *,
        banned_by_user:profiles!banned_by(username, display_name),
        associated_user:profiles!associated_user_id(username, display_name)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    setBans(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchBans() }, [])

  const handleBan = async () => {
    if (!form.ip_address) {
      toast.error('IP address is required')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.rpc('staff_ban_ip', {
        p_ip_address: form.ip_address,
        p_reason: form.reason || null,
        p_expires_at: form.expires_at || null,
      })
      if (error) throw error
      toast.success('IP banned')
      setShowForm(false)
      setForm({ ip_address: '', reason: '', expires_at: '' })
      fetchBans()
    } catch (err) {
      toast.error(err.message || 'Failed to ban IP')
    } finally {
      setSaving(false)
    }
  }

  const handleUnban = async (banId) => {
    if (!confirm('Unban this IP address?')) return
    try {
      const { error } = await supabase.rpc('staff_unban_ip', { p_ban_id: banId })
      if (error) throw error
      toast.success('IP unbanned')
      fetchBans()
    } catch (err) {
      toast.error(err.message || 'Failed')
    }
  }

  const lookupUserIps = async () => {
    const q = userIpLookup.trim()
    if (q.length < 2) return
    setLookingUp(true)
    try {
      const { data: users } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(1)

      if (!users?.length) {
        toast.error('User not found')
        setUserIps([])
        setLookingUp(false)
        return
      }

      const { data, error } = await supabase.rpc('get_user_ips', { p_user_id: users[0].id })
      if (error) throw error
      setUserIps((data || []).map(d => ({ ...d, user: users[0] })))
    } catch (err) {
      toast.error(err.message || 'Failed to look up IPs')
    } finally {
      setLookingUp(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-400">{bans.length} active IP ban{bans.length !== 1 ? 's' : ''}</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus size={14} /> Ban IP
        </Button>
      </div>

      {/* Ban IP form */}
      {showForm && (
        <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-medium text-white">Ban IP Address</h3>
          <Input
            value={form.ip_address}
            onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))}
            placeholder="IP address (e.g. 192.168.1.1)"
          />
          <Input
            value={form.reason}
            onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            placeholder="Reason (optional)"
          />
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Expires (leave empty for permanent)</label>
            <input
              type="datetime-local"
              value={form.expires_at}
              onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" onClick={handleBan} loading={saving}>Ban IP</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* User IP Lookup */}
      <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-medium text-zinc-400">Look Up User IPs</h3>
        <div className="flex gap-2">
          <Input
            value={userIpLookup}
            onChange={(e) => setUserIpLookup(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && lookupUserIps()}
            placeholder="Search username..."
            icon={Search}
          />
          <Button size="sm" onClick={lookupUserIps} loading={lookingUp}>Lookup</Button>
        </div>
        {userIps.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs text-zinc-500">IPs for @{userIps[0]?.user?.username}:</span>
            {userIps.map((ip, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-zinc-800/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Globe size={13} className="text-zinc-500" />
                  <span className="text-sm text-white font-mono">{ip.ip_address}</span>
                  <span className="text-xs text-zinc-500">{ip.login_count} login{ip.login_count > 1 ? 's' : ''}</span>
                  <span className="text-xs text-zinc-600">last {formatRelativeTime(ip.last_seen)}</span>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setForm(f => ({ ...f, ip_address: ip.ip_address }))
                    setShowForm(true)
                  }}
                >
                  <Ban size={12} /> Ban
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active bans list */}
      {loading ? (
        <div className="py-12 text-center text-zinc-500 text-sm">Loading...</div>
      ) : bans.length === 0 ? (
        <div className="py-12 text-center text-zinc-500 text-sm">No active IP bans</div>
      ) : (
        <div className="space-y-2">
          {bans.map(ban => (
            <div key={ban.id} className="flex items-center gap-3 p-3 bg-zinc-900/30 rounded-xl border border-zinc-800/50">
              <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Globe size={14} className="text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-white">{ban.ip_address}</span>
                  {ban.expires_at ? (
                    <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">
                      Expires {formatRelativeTime(ban.expires_at)}
                    </span>
                  ) : (
                    <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">Permanent</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 mt-0.5">
                  {ban.reason && <span>{ban.reason}</span>}
                  {ban.associated_user && <span>→ @{ban.associated_user.username}</span>}
                  <span>by {ban.banned_by_user?.display_name}</span>
                  <span>·</span>
                  <span>{formatRelativeTime(ban.created_at)}</span>
                </div>
              </div>
              <button
                onClick={() => handleUnban(ban.id)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer transition-colors"
                title="Unban"
              >
                <RotateCcw size={14} />
              </button>
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
              action.action_type.includes('verify') ? 'bg-red-500/10' :
              action.action_type.includes('auto_') ? 'bg-orange-500/10' :
              action.action_type.includes('appeal') ? 'bg-purple-500/10' :
              action.action_type.includes('ip') ? 'bg-red-500/10' :
              'bg-zinc-800/50'
            )}>
              {action.action_type.includes('ban') ? <Ban size={14} className="text-red-400" /> :
               action.action_type.includes('suspend') ? <AlertTriangle size={14} className="text-amber-400" /> :
               action.action_type.includes('verify') ? <ShieldCheck size={14} className="text-red-400 fill-current [&>path:last-child]:stroke-white" /> :
               action.action_type.includes('auto_') ? <Bot size={14} className="text-orange-400" /> :
               action.action_type.includes('appeal') ? <Scale size={14} className="text-purple-400" /> :
               action.action_type.includes('ip') ? <Globe size={14} className="text-red-400" /> :
               <Clock size={14} className="text-zinc-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-200">
                <span className="font-medium">{action.moderator?.display_name || 'System'}</span>
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

// ─── Team Overview (Leads + Admin) ─────────────────────────────────
function TeamOverview({ teamType = 'support' }) {
  const [teamStatus, setTeamStatus] = useState([])
  const [activityLog, setActivityLog] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [statusRes, logRes] = await Promise.all([
      supabase.rpc('get_team_status', { p_team_type: teamType }),
      supabase.rpc('get_team_activity_log', { p_team_type: teamType, p_limit: 50 }),
    ])
    if (!statusRes.error) setTeamStatus(statusRes.data || [])
    if (!logRes.error) setActivityLog(logRes.data || [])
    setLoading(false)
  }, [teamType])

  // Heartbeat every 30 seconds
  useEffect(() => {
    supabase.rpc('staff_heartbeat')
    const interval = setInterval(() => supabase.rpc('staff_heartbeat'), 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) return <PageLoader />

  const onlineMembers = teamStatus.filter(m => m.is_online)
  const offlineMembers = teamStatus.filter(m => !m.is_online)

  return (
    <div className="space-y-6">
      {/* Online Status */}
      <div>
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Users size={16} className="text-red-400" />
          Team Members
          <span className="text-xs text-zinc-500 font-normal">
            ({onlineMembers.length} online / {teamStatus.length} total)
          </span>
        </h3>

        {teamStatus.length === 0 ? (
          <p className="text-sm text-zinc-500">No team members found.</p>
        ) : (
          <div className="space-y-2">
            {/* Online first, then offline */}
            {[...onlineMembers, ...offlineMembers].map(member => (
              <div key={member.user_id} className={cn(
                'flex items-center gap-3 p-3 rounded-xl border',
                member.is_online
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-zinc-900/50 border-zinc-800/50'
              )}>
                <div className="relative">
                  <Avatar src={member.avatar_url} username={member.username} size={32} />
                  <div className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0a0a0a]',
                    member.is_online ? 'bg-emerald-500' : 'bg-zinc-600'
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">
                      {member.display_name || member.username}
                    </span>
                    <span className="text-xs text-zinc-500">@{member.username}</span>
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                      member.system_role === 'admin' ? 'bg-red-500/10 text-red-400' :
                      member.system_role.includes('lead') ? 'bg-purple-500/10 text-purple-400' :
                      'bg-zinc-800 text-zinc-400'
                    )}>
                      {member.system_role.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {member.is_online
                      ? <span className="text-emerald-400">Online now</span>
                      : member.last_seen
                        ? `Last seen ${formatRelativeTime(member.last_seen)}`
                        : 'Never seen'}
                  </p>
                </div>
                {member.is_online
                  ? <Wifi size={14} className="text-emerald-400" />
                  : <WifiOff size={14} className="text-zinc-600" />
                }
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div>
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Clock size={16} className="text-red-400" />
          Recent Team Activity
        </h3>

        {activityLog.length === 0 ? (
          <p className="text-sm text-zinc-500">No recent activity.</p>
        ) : (
          <div className="space-y-1.5">
            {activityLog.map(action => (
              <div key={action.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-zinc-900/30">
                <div className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                  action.action_type?.includes('ban') ? 'bg-red-500/10' :
                  action.action_type?.includes('suspend') ? 'bg-amber-500/10' :
                  action.action_type?.includes('verify') ? 'bg-red-500/10' :
                  action.action_type?.includes('appeal') ? 'bg-purple-500/10' :
                  action.action_type?.includes('resolve') ? 'bg-emerald-500/10' :
                  'bg-zinc-800/50'
                )}>
                  {action.action_type?.includes('ban') ? <Ban size={13} className="text-red-400" /> :
                   action.action_type?.includes('suspend') ? <AlertTriangle size={13} className="text-amber-400" /> :
                   action.action_type?.includes('verify') ? <ShieldCheck size={13} className="text-red-400 fill-current [&>path:last-child]:stroke-white" /> :
                   action.action_type?.includes('appeal') ? <Scale size={13} className="text-purple-400" /> :
                   action.action_type?.includes('resolve') ? <CheckCircle size={13} className="text-emerald-400" /> :
                   <Clock size={13} className="text-zinc-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200">
                    <span className="font-medium">{action.moderator_name || 'System'}</span>
                    <span className="text-zinc-500"> {action.action_type?.replace(/_/g, ' ')} </span>
                    {action.target_name && (
                      <span className="font-medium">@{action.target_name}</span>
                    )}
                  </div>
                  {action.reason && (
                    <p className="text-xs text-zinc-500 mt-0.5 truncate">{action.reason}</p>
                  )}
                </div>
                <span className="text-[10px] text-zinc-600 flex-shrink-0">
                  {formatRelativeTime(action.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Dedicated Partner Support (Partner Golds) ─────────────────────
function DedicatedPartnerSupport() {
  const { profile } = useAuthStore()
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [supportStaff, setSupportStaff] = useState([])
  const [goldPartners, setGoldPartners] = useState([])
  const [assigning, setAssigning] = useState(null)

  const isLead = profile?.system_role === 'admin' || profile?.system_role === 'support_lead'

  const fetchAssignments = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_dedicated_support_assignments')
    if (!error) setAssignments(data || [])
    setLoading(false)
  }, [])

  const fetchStaffAndPartners = useCallback(async () => {
    if (!isLead) return
    const [staffRes, partnerRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, system_role')
        .in('system_role', ['support', 'support_lead', 'admin'])
        .order('display_name'),
      supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, partner_tier')
        .eq('partner_tier', 'gold')
        .order('display_name'),
    ])
    if (!staffRes.error) setSupportStaff(staffRes.data || [])
    if (!partnerRes.error) setGoldPartners(partnerRes.data || [])
  }, [isLead])

  useEffect(() => { fetchAssignments() }, [fetchAssignments])
  useEffect(() => { fetchStaffAndPartners() }, [fetchStaffAndPartners])

  const handleAssign = async (partnerId, agentId) => {
    setAssigning(partnerId)
    try {
      const { error } = await supabase.rpc('assign_dedicated_support', {
        p_partner_id: partnerId,
        p_agent_id: agentId,
      })
      if (error) throw error
      toast.success('Support agent assigned')
      fetchAssignments()
    } catch (err) {
      toast.error(err.message || 'Failed to assign')
    } finally {
      setAssigning(null)
    }
  }

  if (loading) return <PageLoader />

  const assignedPartnerIds = new Set(assignments.map(a => a.partner_id))
  const unassignedGold = goldPartners.filter(p => !assignedPartnerIds.has(p.id))

  return (
    <div className="space-y-6">
      {/* Current Assignments */}
      <div>
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Headset size={16} className="text-amber-400" />
          Active Assignments
          <span className="text-xs text-zinc-500 font-normal">({assignments.length})</span>
        </h3>

        {assignments.length === 0 ? (
          <p className="text-sm text-zinc-500">No active assignments.</p>
        ) : (
          <div className="space-y-2">
            {assignments.map(a => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
                {/* Partner info */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Avatar src={a.partner_avatar} username={a.partner_username} size={28} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {a.partner_display_name || a.partner_username}
                    </p>
                    <p className="text-[10px] text-amber-400">Partner Gold</p>
                  </div>
                </div>

                {/* Arrow */}
                <span className="text-zinc-600 text-xs">→</span>

                {/* Agent info */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Avatar src={a.agent_avatar} username={a.agent_username} size={28} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {a.agent_display_name || a.agent_username}
                    </p>
                    <p className="text-[10px] text-zinc-500">Support Agent</p>
                  </div>
                </div>

                <span className="text-[10px] text-zinc-600">
                  {formatRelativeTime(a.assigned_at)}
                </span>

                {/* Reassign dropdown for leads */}
                {isLead && (
                  <select
                    className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-300"
                    value={a.agent_id}
                    disabled={assigning === a.partner_id}
                    onChange={e => handleAssign(a.partner_id, e.target.value)}
                  >
                    {supportStaff.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.display_name || s.username}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unassigned Partner Golds (leads only) */}
      {isLead && unassignedGold.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <UserCheck size={16} className="text-emerald-400" />
            Unassigned Partner Golds
            <span className="text-xs text-zinc-500 font-normal">({unassignedGold.length})</span>
          </h3>

          <div className="space-y-2">
            {unassignedGold.map(partner => (
              <div key={partner.id} className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <Avatar src={partner.avatar_url} username={partner.username} size={28} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {partner.display_name || partner.username}
                  </p>
                  <p className="text-[10px] text-amber-400">Partner Gold — needs support agent</p>
                </div>

                <select
                  className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-300"
                  defaultValue=""
                  disabled={assigning === partner.id}
                  onChange={e => {
                    if (e.target.value) handleAssign(partner.id, e.target.value)
                  }}
                >
                  <option value="" disabled>Assign agent…</option>
                  {supportStaff.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.display_name || s.username}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Support Page ─────────────────────────────────────────────
const supportTabs = [
  { id: 'reports', label: 'Reports', icon: Flag },
  { id: 'users', label: 'Users', icon: Search },
  { id: 'automod', label: 'Auto-Mod', icon: Bot },
  { id: 'appeals', label: 'Appeals', icon: Scale },
  { id: 'ipbans', label: 'IP Bans', icon: Globe },
  { id: 'log', label: 'Mod Log', icon: Clock },
]

const leadTabs = [
  { id: 'team', label: 'Team', icon: Users },
  { id: 'partners', label: 'Partners', icon: Headset },
]

export default function SupportPage() {
  const { profile } = useAuthStore()
  const [tab, setTab] = useState('reports')
  const isLeadOrAdmin = profile?.system_role === 'admin' || profile?.system_role === 'support_lead'
  const tabs = isLeadOrAdmin ? [...supportTabs, ...leadTabs] : supportTabs

  return (
    <div>
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center">
            <ShieldAlert size={18} className="text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Support Panel</h1>
        </div>
      </header>

      <div className="px-5 py-4">
        {/* Tabs */}
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap',
                tab === t.id
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
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
        {tab === 'automod' && <AutoModeration />}
        {tab === 'appeals' && <AppealsQueue />}
        {tab === 'ipbans' && <IPBanManagement />}
        {tab === 'log' && <ModerationLog />}
        {tab === 'team' && isLeadOrAdmin && <TeamOverview teamType="support" />}
        {tab === 'partners' && isLeadOrAdmin && <DedicatedPartnerSupport />}
      </div>
    </div>
  )
}
