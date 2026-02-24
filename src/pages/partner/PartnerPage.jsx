import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Shield, Crown, Radio, Phone,
  TrendingUp, Check, Lock, Loader2, ChevronRight, Zap,
  Settings, Star, DollarSign, BadgeCheck, ShieldCheck
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import { cn } from '../../lib/utils'
import { toast } from 'sonner'

const VERIFIED_SUBS = 100
const RED_SUBS = 500
const RED_REV = 5000
const GOLD_SUBS = 1000
const GOLD_REV = 15000

function ProgressBar({ label, pct, color, sublabel }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        <span className="text-xs text-zinc-500">{sublabel}</span>
      </div>
      <div className="h-2.5 bg-zinc-800/80 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-1000 ease-out', color)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}

function TierCard({ label, requirements, unlocked, permanent, features, color, icon: Icon, badgeVariant, bars }) {
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
            <div className="space-y-0.5">
              {requirements.map((r, i) => (
                <p key={i} className="text-xs text-zinc-500">{r}</p>
              ))}
            </div>
          </div>
        </div>
        {unlocked && (
          <div className="flex items-center gap-2">
            {permanent && <span className="text-[10px] text-emerald-400/60 uppercase font-bold tracking-wider">Permanent</span>}
            <Badge variant={badgeVariant || 'primary'}>Active</Badge>
          </div>
        )}
      </div>

      {/* Progress Bars */}
      {bars && bars.length > 0 && (
        <div className="space-y-2.5 mb-4">
          {bars.map((bar, i) => (
            <ProgressBar key={i} {...bar} />
          ))}
        </div>
      )}

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

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
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
  const currentRevenue = progress.current_revenue || 0
  const snapshots = partnerData?.snapshots || []

  const isVerified = tier === 'verified' || tier === 'red' || tier === 'gold'
  const isRed = tier === 'red' || tier === 'gold'
  const isGold = tier === 'gold'

  const tierLabel = isGold ? 'Gold' : isRed ? 'Red' : isVerified ? 'Verified' : null
  const tierGradient = isGold
    ? 'from-amber-400 to-orange-400'
    : isRed
      ? 'from-red-400 to-cyan-400'
      : isVerified
        ? 'from-emerald-400 to-teal-400'
        : 'from-red-400 to-cyan-400'

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white transition-colors cursor-pointer">
            <ArrowLeft size={20} />
          </button>
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center',
            isGold ? 'bg-gradient-to-br from-amber-500 to-orange-600' :
            isRed ? 'bg-gradient-to-br from-red-500 to-red-600' :
            isVerified ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
            'bg-gradient-to-br from-zinc-600 to-zinc-700'
          )}>
            <ShieldCheck size={16} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Partner Program</h1>
          {tier && (
            <div className="ml-auto">
              <Badge variant={tier === 'gold' ? 'partner-gold' : tier === 'red' ? 'partner-red' : 'partner-verified'}>
                {tierLabel}
              </Badge>
            </div>
          )}
        </div>
      </header>

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-red-500/5 via-transparent to-transparent" />
        <div className="absolute top-10 left-1/4 w-72 h-72 bg-red-500/10 blur-[120px] rounded-full" />
        <div className="absolute top-20 right-1/4 w-64 h-64 bg-amber-500/8 blur-[100px] rounded-full" />

        <div className="relative text-center py-10 px-5">
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">
            {tier ? (
              <>You're <span className={cn('bg-clip-text text-transparent bg-gradient-to-r', tierGradient)}>
                {tierLabel === 'Verified' ? 'Verified' : `a ${tierLabel} Partner`}
              </span></>
            ) : (
              <>Become a <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">Partner</span></>
            )}
          </h2>
          <p className="text-zinc-400 max-w-md mx-auto">
            {tier
              ? 'Unlock exclusive creator tools and features as you grow your audience and revenue.'
              : 'Grow your subscriber base and revenue to unlock badges, priority features, calls, and livestreaming.'
            }
          </p>
        </div>
      </div>

      {/* Subscriber & Revenue History */}
      {snapshots.length > 0 && (
        <div className="px-5 mb-6">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Monthly History</h3>
          <div className="flex gap-2">
            {snapshots.slice().reverse().map((s, i) => {
              const subPct = Math.min((s.count / GOLD_SUBS) * 100, 100)
              return (
                <div key={i} className="flex-1 text-center">
                  <div className="h-20 bg-zinc-900/50 rounded-lg relative overflow-hidden border border-zinc-800/50">
                    <div
                      className={cn(
                        'absolute bottom-0 left-0 right-0 rounded-b-lg transition-all',
                        s.count >= GOLD_SUBS ? 'bg-amber-500/30' :
                        s.count >= RED_SUBS ? 'bg-red-500/30' :
                        s.count >= VERIFIED_SUBS ? 'bg-emerald-500/30' : 'bg-zinc-700/30'
                      )}
                      style={{ height: `${subPct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-zinc-300">
                      {s.count >= 1000 ? `${(s.count / 1000).toFixed(1)}k` : s.count}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">{s.month?.slice(5)}</p>
                  <p className="text-[10px] text-zinc-700">{s.revenue > 0 ? formatCurrency(s.revenue) : ''}</p>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-600">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500/40" /> ≥100</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500/40" /> ≥500</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500/40" /> ≥1,000</span>
          </div>
        </div>
      )}

      {/* Tier Cards */}
      <div className="px-5 mb-6 space-y-4">
        <TierCard
          label="Verified"
          requirements={['100 subscribers for 3 consecutive months']}
          unlocked={isVerified}
          permanent={isVerified}
          color="emerald"
          icon={BadgeCheck}
          badgeVariant="success"
          bars={[{
            label: 'Subscribers',
            pct: progress.verified_pct || 0,
            color: 'bg-emerald-500',
            sublabel: `${currentSubs.toLocaleString()} / ${VERIFIED_SUBS.toLocaleString()}`,
          }]}
          features={[
            'Green verified checkmark badge',
            'Priority in Explore & trending',
            'Permanent status — once earned, never lost',
          ]}
        />
        <TierCard
          label="Partner Red"
          requirements={['500 subscribers + $5,000 revenue/month for 3 months']}
          unlocked={isRed}
          permanent={false}
          color="red"
          icon={Phone}
          badgeVariant="primary"
          bars={[
            { label: 'Subscribers', pct: progress.red_subs_pct || 0, color: 'bg-red-500', sublabel: `${currentSubs.toLocaleString()} / ${RED_SUBS.toLocaleString()}` },
            { label: 'Revenue', pct: currentRevenue > 0 ? Math.min((currentRevenue / RED_REV) * 100, 100) : 0, color: 'bg-red-500', sublabel: `${formatCurrency(currentRevenue)} / ${formatCurrency(RED_REV)}` },
          ]}
          features={[
            'Everything in Verified',
            '1-on-1 Video Calls with subscribers',
            'Partner Red checkmark badge',
            'Priority support',
          ]}
        />
        <TierCard
          label="Partner Gold"
          requirements={['1,000 subscribers + $15,000 revenue/month for 3 months']}
          unlocked={isGold}
          permanent={false}
          color="amber"
          icon={Radio}
          badgeVariant="warning"
          bars={[
            { label: 'Subscribers', pct: progress.gold_subs_pct || 0, color: 'bg-amber-500', sublabel: `${currentSubs.toLocaleString()} / ${GOLD_SUBS.toLocaleString()}` },
            { label: 'Revenue', pct: currentRevenue > 0 ? Math.min((currentRevenue / GOLD_REV) * 100, 100) : 0, color: 'bg-amber-500', sublabel: `${formatCurrency(currentRevenue)} / ${formatCurrency(GOLD_REV)}` },
          ]}
          features={[
            'Everything in Verified & Red',
            'Livestreaming to your subscribers',
            'Partner Gold checkmark badge',
            'Dedicated partner support agent',
            'Apply for Heatly-managed account',
          ]}
        />
      </div>

      {/* Partner Features (only shown if red+) */}
      {tier && tier !== 'verified' && (
        <div className="px-5 mb-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Settings size={18} className="text-zinc-400" />
            Partner Features
          </h3>

          {/* 1-on-1 Calls Section (Red+) */}
          {isRed && (
            <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 mb-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
                    <Phone size={20} className="text-red-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">1-on-1 Video Calls</h4>
                    <p className="text-xs text-zinc-500">Paid video calls in messages</p>
                  </div>
                </div>
                <button
                  onClick={() => toast.info('1-on-1 calls are coming soon!')}
                  className="px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
                >
                  <Phone size={14} className="inline mr-1.5" />
                  Coming Soon
                </button>
              </div>
              <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3 text-sm text-red-300/70">
                <Zap size={14} className="inline mr-1" />
                1-on-1 video calls will be available in messages. Partner Reds will be first to access them.
              </div>
            </div>
          )}

          {/* Livestreaming Section (Gold only) */}
          {isGold && (
            <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 mb-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                    <Radio size={20} className="text-amber-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Livestreaming</h4>
                    <p className="text-xs text-zinc-500">Go live for your subscribers</p>
                  </div>
                </div>
                <button
                  onClick={() => toast.info('Livestreaming is coming soon!')}
                  className="px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30"
                >
                  <Radio size={14} className="inline mr-1.5" />
                  Go Live
                </button>
              </div>
              <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 text-sm text-amber-300/70">
                <Zap size={14} className="inline mr-1" />
                Livestreaming is launching soon. Partner Golds will be the first to access it.
              </div>
            </div>
          )}

          {/* Dedicated Support (Gold only) */}
          {isGold && (
            <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 mb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                    <Crown size={20} className="text-amber-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Dedicated Partner Support</h4>
                    <p className="text-xs text-zinc-500">A dedicated support agent is assigned to your account</p>
                  </div>
                </div>
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
            {
              q: 'How do I become a Verified Partner?',
              a: 'Maintain 100+ active subscribers for 3 consecutive months. The system evaluates your status automatically at the start of each month. Once earned, Verified status is permanent.'
            },
            {
              q: 'How do I reach Partner Red?',
              a: 'Maintain 500+ active subscribers and $5,000+ in monthly revenue for 3 consecutive months. Red unlocks 1-on-1 calls and priority support. This status can be lost if you drop below thresholds.'
            },
            {
              q: 'How do I reach Partner Gold?',
              a: 'Maintain 1,000+ active subscribers and $15,000+ in monthly revenue for 3 consecutive months. Gold unlocks livestreaming, dedicated support, and the ability to apply for a Heatly-managed account.'
            },
            {
              q: 'Can I lose my partner status?',
              a: 'Verified status is permanent once earned. Red and Gold can be lost if your subscriber count or revenue drops below the threshold for 3 consecutive months. You\'ll always keep Verified as a baseline.'
            },
            {
              q: 'What counts as an active subscriber?',
              a: 'Any user with a non-expired, active subscription to your profile. Cancelled subscriptions count until they expire.'
            },
            {
              q: 'What is a Heatly-managed account?',
              a: 'Partner Golds can apply to have Heatly\'s team manage their content scheduling, optimization, and growth strategy. A dedicated team member handles your account.'
            },
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
