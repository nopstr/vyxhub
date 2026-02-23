import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { toast } from 'sonner'
import { cn, formatCurrency } from '../../lib/utils'
import * as Sentry from '@sentry/react'
import {
  ShieldAlert, DollarSign, Users, TrendingUp, BarChart3,
  Search, Save, Crown, Percent, UserCheck, Eye, CreditCard,
  ChevronLeft, ChevronRight, ShieldCheck, Settings, Megaphone,
  Plus, Trash2, ExternalLink, Image as ImageIcon, Link2, ToggleLeft, ToggleRight,
  Wallet, Check, X, Clock, Send, AlertCircle, Copy, Loader2, ExternalLink as ExtLink
} from 'lucide-react'

// ─── Revenue Dashboard ──────────────────────────────────────────────
function RevenueDashboard() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [stats, setStats] = useState(null)
  const [platformStats, setPlatformStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const daysInMonth = new Date(year, month, 0).getDate()

  const fetchStats = async () => {
    setLoading(true)
    try {
      const [revenueRes, platformRes] = await Promise.all([
        supabase.rpc('get_monthly_revenue', { p_year: year, p_month: month }),
        supabase.rpc('get_platform_stats'),
      ])

      if (revenueRes.data?.[0]) setStats(revenueRes.data[0])
      else setStats({ total_revenue: 0, total_platform_fees: 0, total_creator_payouts: 0, transaction_count: 0, subscription_revenue: 0, ppv_revenue: 0, tip_revenue: 0 })

      if (platformRes.data?.[0]) setPlatformStats(platformRes.data[0])
    } catch (err) {
      toast.error('Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStats() }, [year, month])

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  if (loading) return <div className="py-12 text-center text-zinc-500 text-sm">Loading revenue data...</div>

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 cursor-pointer">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <h3 className="text-lg font-bold text-white">{monthNames[month - 1]} {year}</h3>
          <p className="text-xs text-zinc-500">Day 1 – {daysInMonth}</p>
        </div>
        <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 cursor-pointer">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Revenue cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={DollarSign}
          label="Total Revenue"
          value={formatCurrency(stats?.total_revenue || 0)}
          color="text-emerald-400"
          bg="bg-emerald-500/10"
        />
        <StatCard
          icon={CreditCard}
          label="Platform Earnings"
          value={formatCurrency(stats?.total_platform_fees || 0)}
          color="text-indigo-400"
          bg="bg-indigo-500/10"
          subtitle={`Revenue – Creator Split`}
        />
        <StatCard
          icon={TrendingUp}
          label="Creator Payouts"
          value={formatCurrency(stats?.total_creator_payouts || 0)}
          color="text-pink-400"
          bg="bg-pink-500/10"
        />
        <StatCard
          icon={BarChart3}
          label="Transactions"
          value={stats?.transaction_count || 0}
          color="text-amber-400"
          bg="bg-amber-500/10"
        />
      </div>

      {/* Revenue breakdown */}
      <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4 space-y-3">
        <h4 className="text-sm font-bold text-zinc-300">Revenue Breakdown</h4>
        <div className="space-y-2">
          <BreakdownRow label="Subscriptions" value={stats?.subscription_revenue || 0} />
          <BreakdownRow label="PPV Content" value={stats?.ppv_revenue || 0} />
          <BreakdownRow label="Tips" value={stats?.tip_revenue || 0} />
        </div>
      </div>

      {/* Platform stats */}
      {platformStats && (
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Creators" value={platformStats.total_creators} icon={Crown} />
          <MiniStat label="Managed" value={platformStats.total_managed_creators} icon={Users} />
          <MiniStat label="Verified" value={platformStats.verified_creators} icon={ShieldCheck} />
          <MiniStat label="Total Users" value={platformStats.total_users} icon={UserCheck} />
          <MiniStat label="Active Subs" value={platformStats.total_active_subscriptions} icon={CreditCard} />
          <MiniStat label="Total Posts" value={platformStats.total_posts} icon={Eye} />
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, bg, subtitle }) {
  return (
    <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', bg)}>
        <Icon size={16} className={color} />
      </div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={cn('text-xl font-black mt-0.5', color)}>{value}</p>
      {subtitle && <p className="text-[10px] text-zinc-600 mt-0.5">{subtitle}</p>}
    </div>
  )
}

function BreakdownRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-200 font-medium">{formatCurrency(value)}</span>
    </div>
  )
}

function MiniStat({ label, value, icon: Icon }) {
  return (
    <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-3 text-center">
      <Icon size={14} className="text-zinc-500 mx-auto mb-1" />
      <p className="text-lg font-bold text-white">{value || 0}</p>
      <p className="text-[10px] text-zinc-500">{label}</p>
    </div>
  )
}

// ─── Split Management ───────────────────────────────────────────────
function SplitManager() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [editingSplit, setEditingSplit] = useState({})

  const handleSearch = async () => {
    const q = query.trim()
    if (q.length < 2) return
    setSearching(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_creator, is_verified, is_managed, revenue_split_override, management_split, system_role')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .eq('is_creator', true)
      .limit(20)
    setResults(data || [])
    setSearching(false)
  }

  const handleSaveSplit = async (userId) => {
    const splitVal = editingSplit[userId]
    if (splitVal === undefined || splitVal === '') return

    const numVal = splitVal === 'reset' ? null : parseFloat(splitVal)
    if (numVal !== null && (isNaN(numVal) || numVal < 0 || numVal > 100)) {
      return toast.error('Split must be between 0 and 100')
    }

    try {
      const { error } = await supabase.rpc('admin_set_split', {
        p_target_user_id: userId,
        p_split: numVal,
      })
      if (error) throw error
      toast.success(numVal === null ? 'Split reset to default' : `Split set to ${numVal}%`)
      setEditingSplit(s => ({ ...s, [userId]: undefined }))
      handleSearch()
    } catch (err) {
      toast.error(err.message || 'Failed to update split')
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
        <p className="text-xs text-amber-400">
          <strong>Split Override</strong> sets the creator's revenue share (%). Default is 70% creator / 30% platform.
          Managed creators default to 60%/40%. Set to empty to reset to default.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search creators..."
          icon={Search}
        />
        <Button onClick={handleSearch} loading={searching}>Search</Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map(user => {
            const currentSplit = user.revenue_split_override !== null
              ? `${user.revenue_split_override}%`
              : user.is_managed
                ? `${user.management_split || 60}% (managed)`
                : '70% (default)'

            return (
              <div key={user.id} className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <Avatar src={user.avatar_url} alt={user.display_name} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white text-sm">{user.display_name}</span>
                      <span className="text-xs text-zinc-500">@{user.username}</span>
                      {user.is_verified && <ShieldCheck size={12} className="text-indigo-400" />}
                      {user.is_managed && <span className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded">Managed</span>}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      Current split: <span className="text-zinc-300 font-medium">{currentSplit}</span>
                      {user.revenue_split_override !== null && (
                        <span className="text-amber-400 ml-1">(override)</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Percent size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={editingSplit[user.id] ?? (user.revenue_split_override ?? '')}
                        onChange={(e) => setEditingSplit(s => ({ ...s, [user.id]: e.target.value }))}
                        placeholder="70"
                        className="w-20 bg-zinc-800/50 border border-zinc-700/50 rounded-lg pl-7 pr-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                      />
                    </div>
                    <Button size="sm" onClick={() => handleSaveSplit(user.id)}>
                      <Save size={13} />
                    </Button>
                    {user.revenue_split_override !== null && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingSplit(s => ({ ...s, [user.id]: 'reset' }))
                          handleSaveSplit(user.id)
                        }}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Partner Management ─────────────────────────────────────────────
function PartnerManager() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  const handleSearch = async () => {
    const q = query.trim()
    if (q.length < 2) return
    setSearching(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, partner_tier, partner_override, subscriber_count, is_creator')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(20)
    setResults(data || [])
    setSearching(false)
  }

  const handleSetPartner = async (userId, tier) => {
    try {
      const { error } = await supabase.rpc('admin_set_partner_tier', {
        p_target_user_id: userId,
        p_tier: tier || null,
        p_override: !!tier
      })
      if (error) throw error
      toast.success(tier ? `Partner tier set to ${tier}` : 'Partner status removed')
      handleSearch()
    } catch (err) {
      toast.error(err.message || 'Failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 mb-4">
        <p className="text-sm text-blue-300/70">
          Override partner tiers manually. Overridden users won't be affected by automatic monthly evaluations.
          Use "Both" to grant both Blue and Gold features simultaneously.
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search creators to manage partner status..."
          icon={Search}
        />
        <Button onClick={handleSearch} loading={searching}>Search</Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map(user => (
            <div key={user.id} className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <Avatar src={user.avatar_url} alt={user.display_name} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white text-sm">{user.display_name}</span>
                    <span className="text-xs text-zinc-500">@{user.username}</span>
                    {user.partner_tier && (
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full uppercase font-bold',
                        user.partner_tier === 'gold' ? 'bg-amber-500/10 text-amber-400' :
                        user.partner_tier === 'both' ? 'bg-gradient-to-r from-blue-500/10 to-amber-500/10 text-amber-400' :
                        'bg-blue-500/10 text-blue-400'
                      )}>
                        {user.partner_tier}{user.partner_override ? ' ✦' : ''}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-600">{user.subscriber_count || 0} subscribers</span>
                </div>
                <select
                  value={user.partner_tier || ''}
                  onChange={(e) => handleSetPartner(user.id, e.target.value || null)}
                  className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-200 cursor-pointer"
                >
                  <option value="">No Partner</option>
                  <option value="blue">Blue</option>
                  <option value="gold">Gold</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Role Management ────────────────────────────────────────────────
function RoleManager() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  const handleSearch = async () => {
    const q = query.trim()
    if (q.length < 2) return
    setSearching(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, system_role')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(20)
    setResults(data || [])
    setSearching(false)
  }

  const handleSetRole = async (userId, role) => {
    try {
      if (role) {
        const { error } = await supabase.rpc('admin_set_role', {
          p_target_user_id: userId,
          p_role: role,
        })
        if (error) throw error
        toast.success(`Role set to ${role}`)
      } else {
        const { error } = await supabase.rpc('admin_remove_role', {
          p_target_user_id: userId,
        })
        if (error) throw error
        toast.success('Role removed')
      }
      handleSearch()
    } catch (err) {
      toast.error(err.message || 'Failed')
    }
  }

  const handleSetManaged = async (userId, managed) => {
    try {
      const { error } = await supabase.rpc('admin_set_managed', {
        p_creator_id: userId,
        p_is_managed: managed,
      })
      if (error) throw error
      toast.success(managed ? 'Creator is now managed (60% split)' : 'Management removed')
      handleSearch()
    } catch (err) {
      toast.error(err.message || 'Failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search users to manage roles..."
          icon={Search}
        />
        <Button onClick={handleSearch} loading={searching}>Search</Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map(user => (
            <div key={user.id} className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <Avatar src={user.avatar_url} alt={user.display_name} size="md" />
                <div className="flex-1">
                  <span className="font-medium text-white text-sm">{user.display_name}</span>
                  <span className="text-xs text-zinc-500 ml-2">@{user.username}</span>
                  {user.system_role && (
                    <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full ml-2 uppercase">{user.system_role}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={user.system_role || ''}
                    onChange={(e) => handleSetRole(user.id, e.target.value || null)}
                    className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-sm text-zinc-200 cursor-pointer"
                  >
                    <option value="">No Role</option>
                    <option value="admin">Admin</option>
                    <option value="support">Support</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Affiliate Ads Manager ──────────────────────────────────────────
function AffiliateAdsManager() {
  const [ads, setAds] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAd, setEditingAd] = useState(null)
  const [form, setForm] = useState({ title: '', description: '', image_url: '', sidebar_image_url: '', link_url: '', placement: 'both' })
  const [saving, setSaving] = useState(false)

  const fetchAds = async () => {
    setLoading(true)
    const { data } = await supabase.from('affiliate_ads').select('*').order('created_at', { ascending: false })
    setAds(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchAds() }, [])

  const resetForm = () => {
    setForm({ title: '', description: '', image_url: '', sidebar_image_url: '', link_url: '', placement: 'both' })
    setEditingAd(null)
    setShowForm(false)
  }

  const handleEdit = (ad) => {
    setForm({ title: ad.title, description: ad.description || '', image_url: ad.image_url, sidebar_image_url: ad.sidebar_image_url || '', link_url: ad.link_url, placement: ad.placement })
    setEditingAd(ad)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.title || !form.image_url || !form.link_url) {
      toast.error('Title, image URL, and link URL are required')
      return
    }
    setSaving(true)
    try {
      if (editingAd) {
        const { error } = await supabase.from('affiliate_ads').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editingAd.id)
        if (error) throw error
        toast.success('Ad updated')
      } else {
        const { error } = await supabase.from('affiliate_ads').insert([form])
        if (error) throw error
        toast.success('Ad created')
      }
      resetForm()
      fetchAds()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (ad) => {
    const { error } = await supabase.from('affiliate_ads').update({ is_active: !ad.is_active, updated_at: new Date().toISOString() }).eq('id', ad.id)
    if (error) toast.error(error.message)
    else fetchAds()
  }

  const handleDelete = async (ad) => {
    if (!confirm(`Delete ad "${ad.title}"?`)) return
    const { error } = await supabase.from('affiliate_ads').delete().eq('id', ad.id)
    if (error) toast.error(error.message)
    else { toast.success('Ad deleted'); fetchAds() }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-400">Manage affiliate ads shown in feed and sidebar</p>
        <Button onClick={() => { resetForm(); setShowForm(true) }} className="!py-2 !px-4 text-sm">
          <Plus size={15} className="mr-1.5" /> New Ad
        </Button>
      </div>

      {showForm && (
        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 space-y-4">
          <h4 className="font-bold text-white">{editingAd ? 'Edit Ad' : 'Create Ad'}</h4>
          <Input placeholder="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 resize-none" />
          <Input placeholder="Feed Image URL (600×400)" value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} />
          <Input placeholder="Sidebar Image URL (300×250, optional)" value={form.sidebar_image_url} onChange={e => setForm(f => ({ ...f, sidebar_image_url: e.target.value }))} />
          <Input placeholder="Link URL (affiliate link)" value={form.link_url} onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))} />
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Placement</label>
            <select
              value={form.placement}
              onChange={e => setForm(f => ({ ...f, placement: e.target.value }))}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 cursor-pointer"
            >
              <option value="both">Feed + Sidebar</option>
              <option value="feed">Feed Only</option>
              <option value="sidebar">Sidebar Only</option>
            </select>
          </div>
          {(form.image_url || form.sidebar_image_url) && (
            <div className="grid grid-cols-2 gap-3">
              {form.image_url && (
                <div>
                  <p className="text-[11px] text-zinc-500 mb-1">Feed Preview</p>
                  <div className="rounded-xl overflow-hidden border border-zinc-800/50">
                    <img src={form.image_url} alt="Feed preview" className="w-full max-h-40 object-cover" />
                  </div>
                </div>
              )}
              {form.sidebar_image_url && (
                <div>
                  <p className="text-[11px] text-zinc-500 mb-1">Sidebar Preview</p>
                  <div className="rounded-xl overflow-hidden border border-zinc-800/50">
                    <img src={form.sidebar_image_url} alt="Sidebar preview" className="w-full max-h-40 object-cover" />
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            <Button variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-zinc-500">Loading ads...</div>
      ) : ads.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <Megaphone size={32} className="mx-auto mb-3 opacity-40" />
          <p>No affiliate ads yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ads.map(ad => (
            <div key={ad.id} className={cn(
              'p-4 rounded-2xl border transition-colors',
              ad.is_active ? 'bg-zinc-900/50 border-zinc-800/50' : 'bg-zinc-900/20 border-zinc-800/30 opacity-60'
            )}>
              <div className="flex gap-4">
                {ad.image_url && (
                  <img src={ad.image_url} alt={ad.title} className="w-20 h-14 object-cover rounded-lg flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-white text-sm truncate">{ad.title}</h4>
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-bold',
                      ad.is_active ? 'bg-green-500/10 text-green-400' : 'bg-zinc-700/30 text-zinc-500'
                    )}>
                      {ad.is_active ? 'ACTIVE' : 'PAUSED'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-zinc-800/50 text-zinc-400 text-[10px] font-medium">
                      {ad.placement}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <span className="flex items-center gap-1"><Eye size={12} /> {ad.impressions || 0} views</span>
                    <span className="flex items-center gap-1"><ExternalLink size={12} /> {ad.clicks || 0} clicks</span>
                    <span>{ad.impressions > 0 ? ((ad.clicks / ad.impressions * 100).toFixed(1) + '% CTR') : '—'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => toggleActive(ad)} className="p-2 rounded-lg hover:bg-zinc-800/50 text-zinc-400 hover:text-white transition-colors cursor-pointer" title={ad.is_active ? 'Pause' : 'Activate'}>
                    {ad.is_active ? <ToggleRight size={18} className="text-green-400" /> : <ToggleLeft size={18} />}
                  </button>
                  <button onClick={() => handleEdit(ad)} className="p-2 rounded-lg hover:bg-zinc-800/50 text-zinc-400 hover:text-white transition-colors cursor-pointer" title="Edit">
                    <Settings size={16} />
                  </button>
                  <button onClick={() => handleDelete(ad)} className="p-2 rounded-lg hover:bg-zinc-800/50 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer" title="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Payout Queue ───────────────────────────────────────────────────
function PayoutQueue() {
  const [payouts, setPayouts] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState({}) // { payoutId: 'approving' | 'rejecting' }
  const [filter, setFilter] = useState('pending') // pending | all
  const [rejectNote, setRejectNote] = useState({}) // { payoutId: 'note text' }
  const { session } = useAuthStore()

  const fetchPayouts = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('admin_get_pending_payouts')
      if (error) throw error
      setPayouts(data || [])
    } catch (err) {
      toast.error('Failed to load payouts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPayouts() }, [])

  const handleApprovePayout = async (payout) => {
    if (!confirm(`Send ${formatCurrency(payout.amount)} USDT to ${payout.payout_wallet_address || payout.payout_email}?`)) return

    setProcessing(p => ({ ...p, [payout.id]: 'approving' }))
    try {
      const token = session?.access_token
      if (!token) throw new Error('No session')

      if (payout.payout_method === 'crypto' && payout.payout_wallet_address) {
        // Auto-payout via NOWPayments
        const res = await fetch('/api/crypto/create-payout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ payout_id: payout.id })
        })

        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Payout failed')

        if (data.method === 'nowpayments') {
          toast.success(`USDT payout initiated! Withdrawal ID: ${data.withdrawal_id}`)
        } else if (data.method === 'manual_fallback') {
          toast.success('Approved (manual payout required — NP credentials not configured)')
        } else {
          toast.success('Payout approved (manual transfer)')
        }
      } else {
        // Manual approve for non-crypto payouts
        const { error } = await supabase.rpc('admin_process_payout', {
          p_payout_id: payout.id,
          p_action: 'approve',
          p_note: 'Approved from admin panel'
        })
        if (error) throw error
        toast.success('Payout approved')
      }

      fetchPayouts()
    } catch (err) {
      toast.error(err.message || 'Failed to process payout')
    } finally {
      setProcessing(p => ({ ...p, [payout.id]: null }))
    }
  }

  const handleRejectPayout = async (payoutId) => {
    const note = rejectNote[payoutId] || ''
    if (!confirm('Reject this payout? Funds will be refunded to creator wallet.')) return

    setProcessing(p => ({ ...p, [payoutId]: 'rejecting' }))
    try {
      const { error } = await supabase.rpc('admin_process_payout', {
        p_payout_id: payoutId,
        p_action: 'reject',
        p_note: note || 'Rejected from admin panel'
      })
      if (error) throw error
      toast.success('Payout rejected, funds refunded')
      setRejectNote(n => ({ ...n, [payoutId]: '' }))
      fetchPayouts()
    } catch (err) {
      toast.error(err.message || 'Failed to reject payout')
    } finally {
      setProcessing(p => ({ ...p, [payoutId]: null }))
    }
  }

  const copyAddress = (addr) => {
    navigator.clipboard.writeText(addr)
    toast.success('Address copied')
  }

  const filtered = filter === 'pending'
    ? payouts.filter(p => ['pending', 'processing'].includes(p.status))
    : payouts

  const pendingCount = payouts.filter(p => p.status === 'pending').length
  const pendingTotal = payouts.filter(p => p.status === 'pending').reduce((s, p) => s + parseFloat(p.amount), 0)

  if (loading) return <div className="py-12 text-center text-zinc-500 text-sm">Loading payouts...</div>

  const statusBadge = (status) => {
    const styles = {
      pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      processing: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
    }
    return (
      <span className={cn('px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase border', styles[status] || styles.pending)}>
        {status}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
          <p className="text-xs text-zinc-500">Pending Payouts</p>
          <p className="text-2xl font-black text-amber-400">{pendingCount}</p>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
          <p className="text-xs text-zinc-500">Pending Total</p>
          <p className="text-2xl font-black text-amber-400">{formatCurrency(pendingTotal)}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilter('pending')}
          className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
            filter === 'pending' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-zinc-500 bg-zinc-900/30 border border-zinc-800/50'
          )}
        >
          Pending {pendingCount > 0 && `(${pendingCount})`}
        </button>
        <button
          onClick={() => setFilter('all')}
          className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
            filter === 'all' ? 'bg-zinc-700/50 text-zinc-300 border border-zinc-600/30' : 'text-zinc-500 bg-zinc-900/30 border border-zinc-800/50'
          )}
        >
          All ({payouts.length})
        </button>
      </div>

      {/* Payout list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-sm">
          {filter === 'pending' ? 'No pending payouts' : 'No payouts found'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <div key={p.id} className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar url={p.creator_avatar} username={p.creator_username} size={36} />
                  <div>
                    <p className="text-sm font-bold text-white">{p.creator_display_name || p.creator_username}</p>
                    <p className="text-xs text-zinc-500">@{p.creator_username}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-white">{formatCurrency(p.amount)}</p>
                  {statusBadge(p.status)}
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-zinc-500">Method:</span>{' '}
                  <span className="text-zinc-300 font-medium">
                    {p.payout_method === 'crypto' ? '🪙 USDT (TRC-20)' : p.payout_method}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Requested:</span>{' '}
                  <span className="text-zinc-300">{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
                {p.payout_wallet_address && (
                  <div className="col-span-2">
                    <span className="text-zinc-500">Wallet:</span>{' '}
                    <span className="text-zinc-300 font-mono text-[11px]">
                      {p.payout_wallet_address.slice(0, 10)}...{p.payout_wallet_address.slice(-8)}
                    </span>
                    <button
                      onClick={() => copyAddress(p.payout_wallet_address)}
                      className="ml-1.5 text-zinc-500 hover:text-zinc-300 cursor-pointer inline-flex"
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                )}
                {p.payout_email && p.payout_method !== 'crypto' && (
                  <div className="col-span-2">
                    <span className="text-zinc-500">Email:</span>{' '}
                    <span className="text-zinc-300">{p.payout_email}</span>
                  </div>
                )}
                {p.nowpayments_payout_id && (
                  <div className="col-span-2">
                    <span className="text-zinc-500">NP Payout:</span>{' '}
                    <span className="text-zinc-300 font-mono text-[11px]">#{p.nowpayments_payout_id}</span>
                  </div>
                )}
                {p.payout_hash && (
                  <div className="col-span-2">
                    <span className="text-zinc-500">TX Hash:</span>{' '}
                    <a
                      href={`https://tronscan.org/#/transaction/${p.payout_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:underline font-mono text-[11px] ml-1"
                    >
                      {p.payout_hash.slice(0, 16)}... <ExternalLink size={10} className="inline" />
                    </a>
                  </div>
                )}
                {p.admin_note && (
                  <div className="col-span-2">
                    <span className="text-zinc-500">Note:</span>{' '}
                    <span className="text-zinc-400 italic">{p.admin_note}</span>
                  </div>
                )}
                {p.processed_at && (
                  <div>
                    <span className="text-zinc-500">Processed:</span>{' '}
                    <span className="text-zinc-300">{new Date(p.processed_at).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              {p.status === 'pending' && (
                <div className="space-y-2 pt-1 border-t border-zinc-800/50">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprovePayout(p)}
                      loading={processing[p.id] === 'approving'}
                      disabled={!!processing[p.id]}
                      className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    >
                      <Send size={13} className="mr-1" />
                      {p.payout_method === 'crypto' ? 'Send USDT' : 'Approve'}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRejectPayout(p.id)}
                      loading={processing[p.id] === 'rejecting'}
                      disabled={!!processing[p.id]}
                      className="flex-1"
                    >
                      <X size={13} className="mr-1" />
                      Reject
                    </Button>
                  </div>
                  <input
                    type="text"
                    value={rejectNote[p.id] || ''}
                    onChange={(e) => setRejectNote(n => ({ ...n, [p.id]: e.target.value }))}
                    placeholder="Optional note (shown to creator on rejection)"
                    className="w-full bg-zinc-800/30 border border-zinc-700/30 rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                  />
                </div>
              )}

              {p.status === 'processing' && (
                <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-500/5 border border-blue-500/20 rounded-xl px-3 py-2">
                  <Loader2 size={13} className="animate-spin" />
                  <span>Payout in progress via NOWPayments...</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Heatly+ Stats ──────────────────────────────────────────────────
function PlusStats() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('get_plus_stats')
      setStats(data)
      setLoading(false)
    })()
  }, [])

  if (loading) return <div className="text-center py-8 text-zinc-500">Loading...</div>
  if (!stats) return null

  const cards = [
    { label: 'Active Subscribers', value: stats.total_active, icon: Crown, color: 'amber' },
    { label: 'User Tier', value: stats.user_tier, icon: Users, color: 'blue' },
    { label: 'Creator Tier', value: stats.creator_tier, icon: Crown, color: 'purple' },
    { label: 'Monthly Revenue', value: formatCurrency(stats.monthly_revenue), icon: DollarSign, color: 'green' },
  ]

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">Heatly+ subscription overview</p>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c, i) => (
          <div key={i} className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
            <div className="flex items-center gap-2 mb-2">
              <c.icon size={16} className={`text-${c.color}-400`} />
              <span className="text-xs text-zinc-500">{c.label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{c.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Admin Page ────────────────────────────────────────────────
const adminTabs = [
  { id: 'revenue', label: 'Revenue', icon: DollarSign },
  { id: 'payouts', label: 'Payouts', icon: Wallet },
  { id: 'splits', label: 'Splits', icon: Percent },
  { id: 'roles', label: 'Roles', icon: Settings },
  { id: 'partners', label: 'Partners', icon: ShieldCheck },
  { id: 'ads', label: 'Ads', icon: Megaphone },
  { id: 'plus', label: 'Plus', icon: Crown },
]

export default function AdminPage() {
  const [tab, setTab] = useState('revenue')

  return (
    <div>
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center">
              <ShieldAlert size={18} className="text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-white">Admin Panel</h1>
          </div>
          <Button 
            variant="danger" 
            size="sm" 
            onClick={() => {
              const err = new Error('Sentry Test Error from Admin Panel!')
              Sentry.captureException(err)
              toast.success('Test error sent to Sentry!')
            }}
          >
            Test Sentry Crash
          </Button>
        </div>
      </header>

      <div className="px-5 py-4">
        {/* Tabs */}
        <div className="flex gap-1.5 mb-6">
          {adminTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer',
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

        {tab === 'revenue' && <RevenueDashboard />}
        {tab === 'payouts' && <PayoutQueue />}
        {tab === 'splits' && <SplitManager />}
        {tab === 'roles' && <RoleManager />}
        {tab === 'partners' && <PartnerManager />}
        {tab === 'ads' && <AffiliateAdsManager />}
        {tab === 'plus' && <PlusStats />}
      </div>
    </div>
  )
}
