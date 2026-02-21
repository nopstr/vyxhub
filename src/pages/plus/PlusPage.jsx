import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Crown, Zap, ShieldCheck, MessageSquare, TrendingUp,
  BarChart3, Percent, Star, Eye, Sparkles, Check,
  ChevronRight, ArrowLeft, Wallet
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import Button from '../../components/ui/Button'
import CryptoPaymentModal from '../../components/CryptoPaymentModal'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import { PLUS_USER_PRICE, PLUS_CREATOR_PRICE, PLUS_FEE_PERCENT, PLATFORM_FEE_PERCENT } from '../../lib/constants'

const USER_BENEFITS = [
  { icon: Eye, title: 'No Platform Ads', description: 'Browse your feed without any sponsored or affiliate ads' },
  { icon: Crown, title: 'VyxHub+ Badge', description: 'Stand out with an exclusive gold badge on your profile and posts' },
  { icon: MessageSquare, title: 'Free DM Unlock', description: 'Message any creator without paying DM unlock fees' },
  { icon: ShieldCheck, title: 'Priority Support', description: 'Get faster responses from our support team' },
]

const CREATOR_BENEFITS = [
  { icon: Eye, title: 'No Platform Ads', description: 'Your followers see a clean, distraction-free experience' },
  { icon: TrendingUp, title: 'Algorithm Boost', description: '35% more reach in the feed — your content gets seen by more people' },
  { icon: Percent, title: `Reduced Fee (${PLUS_FEE_PERCENT}%)`, description: `Pay only ${PLUS_FEE_PERCENT}% platform fee instead of ${PLATFORM_FEE_PERCENT}% — keep more of what you earn` },
  { icon: Crown, title: 'VyxHub+ Creator Badge', description: 'Exclusive creator badge that builds trust and credibility' },
  { icon: Star, title: 'Priority in Discovery', description: '30% boost in Explore trending — new fans find you faster' },
  { icon: BarChart3, title: 'Advanced Analytics', description: 'Deep insights into your audience, engagement, and revenue trends' },
  { icon: MessageSquare, title: 'Free DM Unlock', description: 'Message anyone without paying DM unlock fees' },
  { icon: ShieldCheck, title: 'Priority Support', description: 'Get faster responses from our support team' },
]

function BenefitCard({ icon: Icon, title, description }) {
  return (
    <div className="flex gap-4 p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 hover:border-amber-500/20 transition-colors">
      <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center flex-shrink-0">
        <Icon size={20} className="text-amber-400" />
      </div>
      <div>
        <h3 className="font-bold text-white text-sm">{title}</h3>
        <p className="text-zinc-400 text-sm mt-0.5">{description}</p>
      </div>
    </div>
  )
}

function PricingCard({ tier, price, benefits, isActive, activeTier, onSubscribe, loading }) {
  const isCurrentTier = isActive && activeTier === tier
  const isUpgrade = isActive && activeTier === 'user' && tier === 'creator'

  return (
    <div className={cn(
      'relative rounded-3xl border p-6 transition-all',
      tier === 'creator'
        ? 'border-amber-500/30 bg-gradient-to-b from-amber-500/5 to-transparent shadow-lg shadow-amber-500/5'
        : 'border-zinc-800/50 bg-zinc-900/30',
      isCurrentTier && 'ring-2 ring-amber-500/50'
    )}>
      {tier === 'creator' && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full text-xs font-bold text-black">
          BEST VALUE
        </div>
      )}

      <div className="text-center mb-6">
        <div className={cn(
          'w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3',
          tier === 'creator' ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-zinc-800'
        )}>
          {tier === 'creator' ? <Sparkles size={24} className="text-white" /> : <Crown size={24} className="text-amber-400" />}
        </div>
        <h3 className="text-xl font-bold text-white">
          {tier === 'user' ? 'VyxHub+ User' : 'VyxHub+ Creator'}
        </h3>
        <div className="mt-2">
          <span className="text-3xl font-black text-white">${price}</span>
          <span className="text-zinc-500 text-sm">/month</span>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {benefits.map((b, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <Check size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <span className="text-sm text-zinc-300">{b}</span>
          </div>
        ))}
      </div>

      {isCurrentTier ? (
        <div className="w-full py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center text-amber-400 font-bold text-sm">
          Current Plan
        </div>
      ) : (
        <Button
          onClick={() => onSubscribe(tier)}
          disabled={loading}
          className={cn(
            'w-full !rounded-2xl font-bold',
            tier === 'creator'
              ? '!bg-gradient-to-r !from-amber-500 !to-orange-500 hover:!from-amber-400 hover:!to-orange-400 !text-black'
              : ''
          )}
        >
          {isUpgrade ? 'Upgrade to Creator' : `Subscribe — $${price}/mo`}
        </Button>
      )}
    </div>
  )
}

export default function PlusPage() {
  const { user, profile, fetchProfile } = useAuthStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [showCrypto, setShowCrypto] = useState(false)
  const [selectedTier, setSelectedTier] = useState(null)
  const [view, setView] = useState('user') // 'user' or 'creator'

  const isPlus = profile?.is_plus && profile?.plus_expires_at && new Date(profile.plus_expires_at) > new Date()
  const activeTier = isPlus ? profile?.plus_tier : null

  const handleSubscribe = (tier) => {
    if (!user) {
      navigate('/auth')
      return
    }
    if (tier === 'creator' && !profile?.is_creator) {
      toast.error('You need to be a creator to subscribe to the Creator tier')
      return
    }
    setSelectedTier(tier)
    setShowCrypto(true)
  }

  const handleCryptoSuccess = async () => {
    setShowCrypto(false)
    toast.success('Welcome to VyxHub+! Your premium benefits are now active.')
    // Refresh profile to get updated Plus status
    if (user?.id) {
      await fetchProfile(user.id)
    }
  }

  const handleCancel = async () => {
    if (!confirm('Are you sure? Your benefits will remain until the end of your billing period.')) return
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('cancel_plus_subscription', { p_user_id: user.id })
      if (error) throw error
      toast.success(data.message || 'Subscription cancelled')
      await fetchProfile(user.id)
    } catch (err) {
      toast.error('Failed to cancel: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const userBenefitsList = [
    'No platform ads in your feed',
    'Exclusive VyxHub+ gold badge',
    'Free DM unlock with any creator',
    'Priority support queue',
  ]

  const creatorBenefitsList = [
    'Everything in User tier',
    '35% algorithm boost — more reach',
    `Only ${PLUS_FEE_PERCENT}% platform fee (save 5%)`,
    'VyxHub+ Creator badge',
    '30% priority in Explore trending',
    'Advanced analytics dashboard',
    'Free DM unlock with anyone',
    'Priority support queue',
  ]

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white transition-colors cursor-pointer">
            <ArrowLeft size={20} />
          </button>
          <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
            <Crown size={16} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">VyxHub+</h1>
          {isPlus && (
            <span className="ml-auto px-3 py-1 bg-amber-500/10 rounded-full text-amber-400 text-xs font-bold border border-amber-500/30">
              {activeTier === 'creator' ? 'Creator' : 'User'} Plan Active
            </span>
          )}
        </div>
      </header>

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 via-transparent to-transparent" />
        <div className="absolute top-10 left-1/4 w-72 h-72 bg-amber-500/10 blur-[120px] rounded-full" />
        <div className="absolute top-20 right-1/4 w-64 h-64 bg-orange-500/8 blur-[100px] rounded-full" />

        <div className="relative text-center py-10 px-5">
          <div className="w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-amber-500/25">
            <Crown className="text-white" size={36} />
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-3 leading-tight">
            Unlock the<br/>
            <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">full experience</span>
          </h2>
          <p className="text-zinc-400 max-w-md mx-auto">
            Premium perks for fans and creators. No ads, more reach, lower fees, and a badge that stands out.
          </p>
        </div>
      </div>

      {/* Benefits Toggle */}
      <div className="px-5 mb-6">
        <div className="flex bg-zinc-900/50 rounded-2xl p-1 border border-zinc-800/50">
          <button
            onClick={() => setView('user')}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer',
              view === 'user'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            For Users
          </button>
          <button
            onClick={() => setView('creator')}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer',
              view === 'creator'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            For Creators
          </button>
        </div>
      </div>

      {/* Benefits List */}
      <div className="px-5 mb-8">
        <h3 className="text-lg font-bold text-white mb-4">
          {view === 'user' ? 'User Benefits' : 'Creator Benefits'}
        </h3>
        <div className="space-y-3">
          {(view === 'user' ? USER_BENEFITS : CREATOR_BENEFITS).map((b, i) => (
            <BenefitCard key={i} {...b} />
          ))}
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="px-5 mb-8">
        <h3 className="text-lg font-bold text-white mb-4">Choose Your Plan</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <PricingCard
            tier="user"
            price={PLUS_USER_PRICE}
            benefits={userBenefitsList}
            isActive={isPlus}
            activeTier={activeTier}
            onSubscribe={handleSubscribe}
            loading={loading}
          />
          <PricingCard
            tier="creator"
            price={PLUS_CREATOR_PRICE}
            benefits={creatorBenefitsList}
            isActive={isPlus}
            activeTier={activeTier}
            onSubscribe={handleSubscribe}
            loading={loading}
          />
        </div>
      </div>

      {/* Active subscription info */}
      {isPlus && (
        <div className="px-5 mb-8">
          <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
            <h3 className="font-bold text-white mb-3">Your Subscription</h3>
            <div className="space-y-2 text-sm text-zinc-400">
              <div className="flex justify-between">
                <span>Plan</span>
                <span className="text-white font-medium">VyxHub+ {activeTier === 'creator' ? 'Creator' : 'User'}</span>
              </div>
              <div className="flex justify-between">
                <span>Renews</span>
                <span className="text-white font-medium">
                  {new Date(profile.plus_expires_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Price</span>
                <span className="text-white font-medium">
                  ${activeTier === 'creator' ? PLUS_CREATOR_PRICE : PLUS_USER_PRICE}/mo
                </span>
              </div>
            </div>
            <button
              onClick={handleCancel}
              disabled={loading}
              className="mt-4 text-sm text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
            >
              Cancel subscription
            </button>
          </div>
        </div>
      )}

      {/* FAQ */}
      <div className="px-5 pb-12">
        <h3 className="text-lg font-bold text-white mb-4">FAQ</h3>
        <div className="space-y-3">
          {[
            { q: 'How do I pay?', a: 'VyxHub+ is paid via cryptocurrency. We support 10+ popular cryptos including Bitcoin, Ethereum, USDT, and more.' },
            { q: 'Can I switch plans?', a: 'Yes! You can upgrade from User to Creator at any time. The remaining days on your current plan carry over.' },
            { q: 'What happens when I cancel?', a: 'Your premium benefits stay active until the end of your billing period. No prorated refunds.' },
            { q: 'Do I need to be a creator for the Creator plan?', a: 'Yes, you must have an active creator account to subscribe to the Creator tier.' },
          ].map((item, i) => (
            <details key={i} className="group p-4 rounded-2xl bg-zinc-900/30 border border-zinc-800/50">
              <summary className="font-medium text-white cursor-pointer flex items-center justify-between">
                {item.q}
                <ChevronRight size={16} className="text-zinc-500 group-open:rotate-90 transition-transform" />
              </summary>
              <p className="text-zinc-400 text-sm mt-2">{item.a}</p>
            </details>
          ))}
        </div>
      </div>

      {/* Crypto Payment Modal */}
      {showCrypto && selectedTier && (
        <CryptoPaymentModal
          isOpen={showCrypto}
          onClose={() => setShowCrypto(false)}
          amountUsd={selectedTier === 'creator' ? PLUS_CREATOR_PRICE : PLUS_USER_PRICE}
          paymentType="plus_subscription"
          metadata={{ tier: selectedTier, user_id: user?.id }}
          onSuccess={handleCryptoSuccess}
        />
      )}
    </div>
  )
}
