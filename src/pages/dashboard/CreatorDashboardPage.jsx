import { useState, useEffect } from 'react'
import {
  DollarSign, TrendingUp, Users, Eye, Heart, Image,
  ArrowUpRight, ArrowDownRight, Calendar
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { PageLoader } from '../../components/ui/Spinner'
import { cn, formatCurrency, formatNumber } from '../../lib/utils'

function StatCard({ label, value, icon: Icon, trend, trendLabel }) {
  return (
    <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-zinc-500">{label}</span>
        <div className="p-2 rounded-xl bg-indigo-500/10">
          <Icon size={18} className="text-indigo-400" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {trend !== undefined && (
        <div className="flex items-center gap-1 mt-2">
          {trend >= 0 ? (
            <ArrowUpRight size={14} className="text-emerald-400" />
          ) : (
            <ArrowDownRight size={14} className="text-red-400" />
          )}
          <span className={cn('text-xs font-medium', trend >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {Math.abs(trend)}%
          </span>
          <span className="text-xs text-zinc-600">{trendLabel}</span>
        </div>
      )}
    </div>
  )
}

function EarningsChart({ data }) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-zinc-600">
        No earnings data yet
      </div>
    )
  }

  const max = Math.max(...data.map(d => d.amount), 1)

  return (
    <div className="flex items-end gap-1 h-48 px-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full bg-indigo-600/40 hover:bg-indigo-500/60 rounded-t-md transition-colors"
            style={{ height: `${(d.amount / max) * 100}%`, minHeight: '4px' }}
            title={`$${d.amount.toFixed(2)}`}
          />
          <span className="text-[10px] text-zinc-600">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

function RecentSubscribers({ subscribers }) {
  if (!subscribers.length) {
    return <p className="text-sm text-zinc-600 py-4">No subscribers yet</p>
  }

  return (
    <div className="space-y-3">
      {subscribers.map((sub, i) => (
        <div key={i} className="flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400">
              {sub.subscriber?.display_name?.[0] || '?'}
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-300">{sub.subscriber?.display_name || 'User'}</p>
              <p className="text-xs text-zinc-600">@{sub.subscriber?.username || 'unknown'}</p>
            </div>
          </div>
          <span className="text-xs text-zinc-500">
            {formatCurrency(sub.price_paid || 0)}/mo
          </span>
        </div>
      ))}
    </div>
  )
}

export default function CreatorDashboardPage() {
  const { profile, user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalEarnings: 0,
    subscribers: 0,
    posts: 0,
    views: 0,
    likes: 0,
  })
  const [recentSubs, setRecentSubs] = useState([])
  const [earningsData, setEarningsData] = useState([])

  useEffect(() => {
    if (!user) return
    fetchDashboard()
  }, [user])

  const fetchDashboard = async () => {
    try {
      const [subsRes, postsRes, likesRes, txRes] = await Promise.all([
        supabase.from('subscriptions').select('*, subscriber:subscriber_id(display_name, username, avatar_url)').eq('creator_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(10),
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', user.id),
        supabase.from('likes').select('id', { count: 'exact', head: true }).in('post_id',
          supabase.from('posts').select('id').eq('author_id', user.id)
        ),
        supabase.from('transactions').select('net_amount, created_at').eq('to_user_id', user.id).order('created_at', { ascending: false }),
      ])

      const totalEarnings = txRes.data?.reduce((sum, t) => sum + (t.net_amount || 0), 0) || 0

      // Build last 7 days chart
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (6 - i))
        return {
          label: d.toLocaleDateString('en', { weekday: 'short' }),
          date: d.toISOString().split('T')[0],
          amount: 0,
        }
      })

      txRes.data?.forEach(tx => {
        const day = tx.created_at?.split('T')[0]
        const match = days.find(d => d.date === day)
        if (match) match.amount += tx.net_amount || 0
      })

      setStats({
        totalEarnings,
        subscribers: subsRes.data?.length || 0,
        posts: postsRes.count || 0,
        views: 0,
        likes: likesRes.count || 0,
      })
      setRecentSubs(subsRes.data || [])
      setEarningsData(days)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
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

  if (loading) return <PageLoader />

  return (
    <div>
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <h1 className="text-xl font-bold text-white">Creator Dashboard</h1>
      </header>

      <div className="p-5 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total Earnings" value={formatCurrency(stats.totalEarnings)} icon={DollarSign} />
          <StatCard label="Subscribers" value={formatNumber(stats.subscribers)} icon={Users} />
          <StatCard label="Posts" value={formatNumber(stats.posts)} icon={Image} />
          <StatCard label="Total Likes" value={formatNumber(stats.likes)} icon={Heart} />
        </div>

        {/* Earnings Chart */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white">Earnings (7 days)</h3>
            <Calendar size={16} className="text-zinc-600" />
          </div>
          <EarningsChart data={earningsData} />
        </div>

        {/* Recent Subscribers */}
        <div className="bg-zinc-900/30 border border-white/5 rounded-3xl p-5">
          <h3 className="font-semibold text-white mb-4">Recent Subscribers</h3>
          <RecentSubscribers subscribers={recentSubs} />
        </div>
      </div>
    </div>
  )
}
