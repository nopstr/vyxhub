import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Shield, Crown, Radio, Video, Phone, Award,
  TrendingUp, Check, Lock, Loader2, ChevronRight, Zap,
  Settings, Star
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import { cn } from '../../lib/utils'
import { toast } from 'sonner'

const BLUE_THRESHOLD = 500
const GOLD_THRESHOLD = 1000

function PartnerBadge({ tier, size = 'md' }) {
  const sizes = { sm: 14, md: 18, lg: 24 }
  const s = sizes[size] || sizes.md

  if (!tier) return null

  if (tier === 'both') {
    return (
      <div className="flex items-center gap-0.5">
        <Shield size={s} className="text-blue-400 fill-blue-400/10" />
        <Shield size={s} className="text-amber-400 fill-amber-400/10" />
      </div>
    )
  }

  return (
    <Shield
      size={s}
      className={cn(
        tier === 'gold' ? 'text-amber-400 fill-amber-400/10' : 'text-blue-400 fill-blue-400/10'
      )}
    />
  )
}

function ProgressRing({ pct, color, children }) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(pct, 100) / 100) * circumference

  return (
    <div className="relative w-24 h-24">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-zinc-800" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
          className={color} strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}

function TierCard({ tier, label, threshold, currentSubs, unlocked, features, color, icon: Icon }) {
  const pct = Math.min(Math.round((currentSubs / threshold) * 100), 100)

  return (
    <div className={cn(
      'rounded-2xl border p-5 transition-all',
      unlocked
        ? `border-${color}-500/30 bg-${color}-500/5 shadow-lg shadow-${color}-500/5`
        : 'border-zinc-800/50 bg-zinc-900/30'
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-12 h-12 rounded-2xl flex items-center justify-center',
            unlocked ? `bg-${color}-500/20` : 'bg-zinc-800'
          )}>
            <Icon size={24} className={unlocked ? `text-${color}-400` : 'text-zinc-500'} />
          </div>
          <div>
            <h3 className="font-bold text-white text-lg">{label}</h3>
            <p className="text-xs text-zinc-500">{threshold.toLocaleString()} subscribers for 3 months</p>
          </div>
        </div>
        {unlocked && (
          <Badge variant={tier === 'gold' ? 'warning' : 'primary'}>Active</Badge>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-zinc-400">{currentSubs.toLocaleString()} / {threshold.toLocaleString()} subscribers</span>
          <span className={unlocked ? `text-${color}-400 font-bold` : 'text-zinc-500'}>{pct}%</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-1000', unlocked ? `bg-${color}-500` : 'bg-zinc-600')}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Features */}
      <div className="space-y-2">
        {features.map((f, i) => (
          <div key={i} className="flex items-center gap-2.5">
            {unlocked ? (
              <Check size={14} className={`text-${color}-400 flex-shrink-0`} />
            ) : (
              <Lock size={14} className="text-zinc-600 flex-shrink-0" />
            )}
            <span className={cn('text-sm', unlocked ? 'text-zinc-200' : 'text-zinc-500')}>
              {f}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PartnerPage() {
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const [partnerData, setPartnerData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.id) fetchPartnerStatus()
  }, [user?.id])

  const fetchPartnerStatus = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_partner_status', { p_user_id: user.id })
      if (error) throw error
      setPartnerData(data)
    } catch (err) {
      console.error('Failed to load partner status:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="text-zinc-500 animate-spin" />
      </div>
    )
  }

  const tier = partnerData?.partner_tier
  const progress = partnerData?.progress || {}
  const currentSubs = progress.current_subscribers || 0
  const snapshots = partnerData?.snapshots || []
  const settings = partnerData?.settings || {}

  const isBlue = tier === 'blue' || tier === 'gold' || tier === 'both'
  const isGold = tier === 'gold' || tier === 'both'

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white transition-colors cursor-pointer">
            <ArrowLeft size={20} />
          </button>
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Partner Program</h1>
          {tier && (
            <div className="ml-auto">
              <PartnerBadge tier={tier} size="md" />
            </div>
          )}
        </div>
      </header>

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-transparent to-transparent" />
        <div className="absolute top-10 left-1/4 w-72 h-72 bg-blue-500/10 blur-[120px] rounded-full" />
        <div className="absolute top-20 right-1/4 w-64 h-64 bg-amber-500/8 blur-[100px] rounded-full" />

        <div className="relative text-center py-10 px-5">
          <div className="flex items-center justify-center gap-4 mb-5">
            <ProgressRing pct={progress.blue_pct || 0} color="text-blue-500">
              <Shield size={28} className="text-blue-400" />
            </ProgressRing>
            <ProgressRing pct={progress.gold_pct || 0} color="text-amber-500">
              <Shield size={28} className="text-amber-400" />
            </ProgressRing>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">
            {tier ? (
              <>You're a <span className={cn(
                'bg-clip-text text-transparent bg-gradient-to-r',
                isGold ? 'from-amber-400 to-orange-400' : 'from-blue-400 to-cyan-400'
              )}>{isGold ? 'Gold' : 'Blue'} Partner</span></>
            ) : (
              <>Become a <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Partner</span></>
            )}
          </h2>
          <p className="text-zinc-400 max-w-md mx-auto">
            {tier
              ? 'Unlock exclusive creator tools and features as you grow your audience.'
              : 'Grow your subscriber base to unlock livestreaming, 1-on-1 calls, and exclusive partner features.'
            }
          </p>
        </div>
      </div>

      {/* Current Stats */}
      <div className="px-5 mb-6">
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 text-center">
            <p className="text-2xl font-black text-white">{currentSubs.toLocaleString()}</p>
            <p className="text-xs text-zinc-500 mt-1">Active Subscribers</p>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 text-center">
            <p className="text-2xl font-black text-white">{BLUE_THRESHOLD - currentSubs > 0 ? (BLUE_THRESHOLD - currentSubs).toLocaleString() : '✓'}</p>
            <p className="text-xs text-zinc-500 mt-1">{currentSubs >= BLUE_THRESHOLD ? 'Blue Qualified' : 'To Blue'}</p>
          </div>
          <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 text-center">
            <p className="text-2xl font-black text-white">{GOLD_THRESHOLD - currentSubs > 0 ? (GOLD_THRESHOLD - currentSubs).toLocaleString() : '✓'}</p>
            <p className="text-xs text-zinc-500 mt-1">{currentSubs >= GOLD_THRESHOLD ? 'Gold Qualified' : 'To Gold'}</p>
          </div>
        </div>
      </div>

      {/* Subscriber History */}
      {snapshots.length > 0 && (
        <div className="px-5 mb-6">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Monthly History</h3>
          <div className="flex gap-2">
            {snapshots.slice().reverse().map((s, i) => {
              const pct = Math.min((s.count / GOLD_THRESHOLD) * 100, 100)
              return (
                <div key={i} className="flex-1 text-center">
                  <div className="h-20 bg-zinc-900/50 rounded-lg relative overflow-hidden border border-zinc-800/50">
                    <div
                      className={cn(
                        'absolute bottom-0 left-0 right-0 rounded-b-lg transition-all',
                        s.count >= GOLD_THRESHOLD ? 'bg-amber-500/30' :
                        s.count >= BLUE_THRESHOLD ? 'bg-blue-500/30' : 'bg-zinc-700/30'
                      )}
                      style={{ height: `${pct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-zinc-300">
                      {s.count >= 1000 ? `${(s.count / 1000).toFixed(1)}k` : s.count}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">{s.month?.slice(5)}</p>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-600">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500/40" /> ≥500</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500/40" /> ≥1,000</span>
          </div>
        </div>
      )}

      {/* Tier Cards */}
      <div className="px-5 mb-6 space-y-4">
        <TierCard
          tier="blue"
          label="Blue Partner"
          threshold={BLUE_THRESHOLD}
          currentSubs={currentSubs}
          unlocked={isBlue}
          color="blue"
          icon={Radio}
          features={[
            'Go Live — Livestream to your subscribers',
            'Blue Partner badge on your profile',
            'Priority in Explore & trending',
            'Early access to new features',
          ]}
        />
        <TierCard
          tier="gold"
          label="Gold Partner"
          threshold={GOLD_THRESHOLD}
          currentSubs={currentSubs}
          unlocked={isGold}
          color="amber"
          icon={Phone}
          features={[
            'Everything in Blue Partner',
            '1-on-1 Video Calls with subscribers',
            'Gold Partner badge on your profile',
            'Dedicated account manager',
            'Custom revenue splits (negotiable)',
          ]}
        />
      </div>

      {/* Partner Settings (only shown if partner) */}
      {tier && (
        <div className="px-5 mb-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Settings size={18} className="text-zinc-400" />
            Partner Features
          </h3>

          {/* Livestreaming Section */}
          {isBlue && (
            <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 mb-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                    <Radio size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Livestreaming</h4>
                    <p className="text-xs text-zinc-500">Go live for your subscribers</p>
                  </div>
                </div>
                <button
                  onClick={() => toast.info('Livestreaming is coming soon! We\'ll notify you when it launches.')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer',
                    'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30'
                  )}
                >
                  <Radio size={14} className="inline mr-1.5" />
                  Go Live
                </button>
              </div>
              <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 text-sm text-blue-300/70">
                <Zap size={14} className="inline mr-1" />
                Livestreaming is launching soon. You'll be among the first to access it as a partner.
              </div>
            </div>
          )}

          {/* 1-on-1 Calls Section */}
          {isGold && (
            <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 mb-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                    <Phone size={20} className="text-amber-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">1-on-1 Video Calls</h4>
                    <p className="text-xs text-zinc-500">Paid video calls in messages</p>
                  </div>
                </div>
                <button
                  onClick={() => toast.info('1-on-1 calls are coming soon! We\'ll notify you when it launches.')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer',
                    'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30'
                  )}
                >
                  <Phone size={14} className="inline mr-1.5" />
                  Coming Soon
                </button>
              </div>
              <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 text-sm text-amber-300/70">
                <Zap size={14} className="inline mr-1" />
                1-on-1 video calls will be available in messages. Gold Partners will be first to access them.
              </div>
            </div>
          )}
        </div>
      )}

      {/* FAQ */}
      <div className="px-5 pb-12">
        <h3 className="text-lg font-bold text-white mb-4">FAQ</h3>
        <div className="space-y-3">
          {[
            { q: 'How do I become a partner?', a: 'Maintain 500+ active subscribers for 3 consecutive months to unlock Blue Partner, or 1000+ for Gold Partner. The system evaluates your status automatically at the start of each month.' },
            { q: 'What counts as an active subscriber?', a: 'Any user with a non-expired, active subscription to your profile. Cancelled subscriptions count until they expire.' },
            { q: 'Can I lose my partner status?', a: 'Yes. If your subscriber count drops below the threshold for 3 consecutive months, your partner status will be downgraded. Your content and settings are preserved.' },
            { q: 'When is livestreaming available?', a: 'Livestreaming is in development and will launch for Blue Partners first. You\'ll be notified when it\'s ready.' },
            { q: 'When are 1-on-1 calls available?', a: '1-on-1 video calls are launching for Gold Partners. Stay tuned for the announcement.' },
          ].map((item, i) => (
            <details key={i} className="group p-4 rounded-2xl bg-zinc-900/30 border border-zinc-800/50">
              <summary className="cursor-pointer text-sm font-medium text-white flex items-center justify-between list-none">
                {item.q}
                <ChevronRight size={14} className="text-zinc-500 group-open:rotate-90 transition-transform" />
              </summary>
              <p className="text-zinc-400 text-sm mt-2">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
