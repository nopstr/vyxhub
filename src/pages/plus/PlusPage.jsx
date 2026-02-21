import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Crown, ShieldCheck, MessageSquare, TrendingUp,
  BarChart3, Percent, Star, Eye, Sparkles, Check,
  ChevronRight, ArrowLeft
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
  { icon: Eye, title: 'No Platform Ads', description: 'Browse your feed without any sponsored or affiliate ads' },
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

export default function PlusPage() {
  const { user, profile, fetchProfile } = useAuthStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [showCrypto, setShowCrypto] = useState(false)

  // Determine which tier to show based on user type — they ONLY see their own
  const isCreator = profile?.is_creator === true
  const tier = isCreator ? 'creator' : 'user'
  const price = isCreator ? PLUS_CREATOR_PRICE : PLUS_USER_PRICE
  const benefits = isCreator ? CREATOR_BENEFITS : USER_BENEFITS
  const benefitsList = isCreator ? [
    '35% algorithm boost — more reach',
    `Only ${PLUS_FEE_PERCENT}% platform fee (save 5%)`,
    'VyxHub+ Creator badge',
    '30% priority in Explore trending',
    'Advanced analytics dashboard',
    'No platform ads in your feed',
    'Free DM unlock with anyone',
    'Priority support queue',
  ] : [
    'No platform ads in your feed',
    'Exclusive VyxHub+ gold badge',
    'Free DM unlock with any creator',
    'Priority support queue',
  ]

  const isPlus = profile?.is_plus && profile?.plus_expires_at && new Date(profile.plus_expires_at) > new Date()

  const handleSubscribe = () => {
    if (!user) {
      navigate('/auth')
      return
    }
    setShowCrypto(true)
  }

  const handleCryptoSuccess = async () => {
    setShowCrypto(false)
    toast.success('Welcome to VyxHub+! Your premium benefits are now active.')
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
          {isPlus ? (
            <span className="ml-auto px-3 py-1 bg-amber-500/10 rounded-full text-amber-400 text-xs font-bold border border-amber-500/30">
              Active
            </span>
          ) : (
            <Button
              onClick={handleSubscribe}
              disabled={loading}
              className="ml-auto !rounded-full !px-4 !py-1.5 !text-xs font-bold !bg-gradient-to-r !from-amber-500 !to-orange-500 hover:!from-amber-400 hover:!to-orange-400 !text-black"
            >
              Subscribe — ${price}/mo
            </Button>
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
            {isCreator ? <Sparkles className="text-white" size={36} /> : <Crown className="text-white" size={36} />}
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-3 leading-tight">
            {isCreator ? (
              <>Grow faster,<br/><span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">earn more</span></>
            ) : (
              <>Unlock the<br/><span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">full experience</span></>
            )}
          </h2>
          <p className="text-zinc-400 max-w-md mx-auto">
            {isCreator
              ? 'More reach, lower fees, and a creator badge that builds trust. Stand out from the crowd.'
              : 'No ads, free DM access, and a badge that stands out. The premium VyxHub experience.'
            }
          </p>
        </div>
      </div>

      {/* Benefits List */}
      <div className="px-5 mb-8">
        <h3 className="text-lg font-bold text-white mb-4">
          {isCreator ? 'Creator Benefits' : 'Your Benefits'}
        </h3>
        <div className="space-y-3">
          {benefits.map((b, i) => (
            <BenefitCard key={i} {...b} />
          ))}
        </div>
      </div>

      {/* Single Pricing Card */}
      <div className="px-5 mb-8">
        <div className={cn(
          'relative rounded-3xl border p-6',
          isCreator
            ? 'border-amber-500/30 bg-gradient-to-b from-amber-500/5 to-transparent shadow-lg shadow-amber-500/5'
            : 'border-amber-500/20 bg-zinc-900/30'
        )}>
          <div className="text-center mb-6">
            <div className={cn(
              'w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3',
              'bg-gradient-to-br from-amber-500 to-orange-600'
            )}>
              {isCreator ? <Sparkles size={24} className="text-white" /> : <Crown size={24} className="text-white" />}
            </div>
            <h3 className="text-xl font-bold text-white">
              VyxHub+ {isCreator ? 'Creator' : ''}
            </h3>
            <div className="mt-2">
              <span className="text-3xl font-black text-white">${price}</span>
              <span className="text-zinc-500 text-sm">/month</span>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            {benefitsList.map((b, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <Check size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-zinc-300">{b}</span>
              </div>
            ))}
          </div>

          {isPlus ? (
            <div className="w-full py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center text-amber-400 font-bold text-sm">
              Current Plan
            </div>
          ) : (
            <Button
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full !rounded-2xl font-bold !bg-gradient-to-r !from-amber-500 !to-orange-500 hover:!from-amber-400 hover:!to-orange-400 !text-black"
            >
              Subscribe — ${price}/mo
            </Button>
          )}
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
                <span className="text-white font-medium">VyxHub+ {isCreator ? 'Creator' : ''}</span>
              </div>
              <div className="flex justify-between">
                <span>Renews</span>
                <span className="text-white font-medium">
                  {new Date(profile.plus_expires_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Price</span>
                <span className="text-white font-medium">${price}/mo</span>
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
            { q: 'What happens when I cancel?', a: 'Your premium benefits stay active until the end of your billing period. No prorated refunds.' },
            ...(isCreator ? [
              { q: 'How much do I save on fees?', a: `VyxHub+ creators pay ${PLUS_FEE_PERCENT}% platform fee instead of ${PLATFORM_FEE_PERCENT}%. That\'s 5% more in your pocket on every transaction.` },
              { q: 'How does the algorithm boost work?', a: 'Your posts get a 35% boost in the For You feed and 30% priority in Explore trending, meaning more people discover your content.' },
            ] : [
              { q: 'What does free DM unlock mean?', a: 'Normally, creators can set a price to message them. With VyxHub+, you can message any creator for free — no unlock fees.' },
              { q: 'Will I see any ads?', a: 'No. VyxHub+ members get a completely ad-free experience — no sponsored posts, no banners, nothing.' },
            ]),
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
      {showCrypto && (
        <CryptoPaymentModal
          isOpen={showCrypto}
          onClose={() => setShowCrypto(false)}
          amountUsd={price}
          paymentType="plus_subscription"
          metadata={{ tier, user_id: user?.id }}
          onSuccess={handleCryptoSuccess}
        />
      )}
    </div>
  )
}
