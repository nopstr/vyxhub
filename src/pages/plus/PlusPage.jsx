/**
 * PlusPage.jsx
 * 
 * This component renders the Heatly+ subscription page.
 * It dynamically displays different pricing, benefits, and UI elements
 * depending on whether the current user is a regular user or a creator.
 * 
 * Key Features:
 * - Displays subscription benefits (USER_BENEFITS vs CREATOR_BENEFITS).
 * - Handles subscription purchases via the PaymentModal.
 * - Handles subscription cancellations via a Supabase RPC call.
 * - Shows active subscription status and renewal dates.
 */

// React hooks for state management
import { useState } from 'react'
// Routing hook for navigation
import { useNavigate } from 'react-router-dom'
// UI Icons from lucide-react
import {
  Crown, ShieldCheck, MessageSquare, TrendingUp,
  BarChart3, Star, Eye, Sparkles, Check,
  ChevronRight, ArrowLeft
} from 'lucide-react'
// Global state store for authentication and user profile data
import { useAuthStore } from '../../stores/authStore'
// Reusable UI components
import Button from '../../components/ui/Button'
import PaymentModal from '../../components/PaymentModal'
// Toast notifications for user feedback
import { toast } from 'sonner'
// Utility for conditionally joining Tailwind CSS classes
import { cn } from '../../lib/utils'
// Supabase client for database interactions
import { supabase } from '../../lib/supabase'
// Global constants for pricing and fees
import { PLUS_USER_PRICE, PLUS_CREATOR_PRICE } from '../../lib/constants'

/**
 * Array of benefits displayed to regular users.
 * Each object contains an icon component, a title, and a description.
 */
const USER_BENEFITS = [
  { icon: Eye, title: 'No Platform Ads', description: 'Browse your feed without any sponsored or affiliate ads' },
  { icon: Crown, title: 'Heatly+ Badge', description: 'Stand out with an exclusive gold badge on your profile and posts' },
  { icon: MessageSquare, title: 'Free DM Unlock', description: 'Message any creator without paying DM unlock fees' },
  { icon: ShieldCheck, title: 'Priority Support', description: 'Get faster responses from our support team' },
]

/**
 * Array of benefits displayed to creators.
 * Creators get additional perks like algorithm boosts and reduced platform fees.
 */
const CREATOR_BENEFITS = [
  { icon: Crown, title: 'Heatly+ Creator Badge', description: 'Exclusive yellow crown badge that builds trust and credibility with fans' },
  { icon: Eye, title: 'No Platform Ads', description: 'Browse your feed without any sponsored or affiliate ads cluttering your experience' },
  { icon: TrendingUp, title: 'Algorithm Boost', description: '35% more reach in the feed — your content gets seen by more people' },
  { icon: Star, title: 'Priority in Discovery', description: '30% boost in Explore trending — new fans find you faster' },
  { icon: BarChart3, title: 'Advanced Analytics', description: 'Deep insights into your audience demographics, engagement patterns, and revenue trends' },
  { icon: ShieldCheck, title: 'Priority Support', description: 'Get faster, dedicated responses from our support team' },
]

/**
 * BenefitCard Component
 * 
 * A reusable UI component to display a single subscription benefit.
 * 
 * @param {Object} props
 * @param {React.Component} props.icon - The Lucide icon component to display.
 * @param {string} props.title - The title of the benefit.
 * @param {string} props.description - The detailed description of the benefit.
 */
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

/**
 * Main PlusPage Component
 * 
 * Renders the entire Heatly+ subscription page.
 */
export default function PlusPage() {
  // Retrieve current user, their profile data, and a function to refresh the profile
  const { user, profile, fetchProfile } = useAuthStore()
  // Hook to programmatically navigate between routes
  const navigate = useNavigate()
  // State to track loading status during API calls (e.g., cancelling subscription)
  const [loading, setLoading] = useState(false)
  // State to control the visibility of the cryptocurrency payment modal
  const [showCrypto, setShowCrypto] = useState(false)

  // --- Subscription Tier Logic ---
  // Determine which tier to show based on user type — they ONLY see their own
  // Check if the current user is registered as a creator
  const isCreator = profile?.is_creator === true
  // Set the subscription tier string for metadata
  const tier = isCreator ? 'creator' : 'user'
  // Determine the monthly price based on the user's role
  const price = isCreator ? PLUS_CREATOR_PRICE : PLUS_USER_PRICE
  // Select the appropriate array of detailed benefit objects
  const benefits = isCreator ? CREATOR_BENEFITS : USER_BENEFITS
  // Select the appropriate array of short benefit strings for the pricing card
  const benefitsList = isCreator ? [
    'Heatly+ Creator badge (yellow crown)',
    'No platform ads in your feed',
    '35% algorithm boost — more reach',
    '30% priority in Explore trending',
    'Advanced analytics dashboard',
    'Priority support queue',
  ] : [
    'No platform ads in your feed',
    'Exclusive Heatly+ gold badge',
    'Free DM unlock with any creator',
    'Priority support queue',
  ]

  // --- Subscription Status Check ---
  // Verify if the user currently has an active Heatly+ subscription
  // It checks the boolean flag AND ensures the expiration date is in the future
  const isPlus = profile?.is_plus && profile?.plus_expires_at && new Date(profile.plus_expires_at) > new Date()

  /**
   * Handles the click event on the Subscribe button.
   * Redirects unauthenticated users to the login page.
   * Opens the payment modal for authenticated users.
   */
  const handleSubscribe = () => {
    if (!user) {
      navigate('/auth')
      return
    }
    setShowCrypto(true)
  }

  /**
   * Callback function triggered when a cryptocurrency payment is successful.
   * Closes the modal, shows a success message, and refreshes the user profile
   * to reflect their new Heatly+ status.
   */
  const handleCryptoSuccess = async () => {
    setShowCrypto(false)
    toast.success('Welcome to Heatly+! Your premium benefits are now active.')
    if (user?.id) {
      await fetchProfile(user.id)
    }
  }

  /**
   * Handles the cancellation of an active Heatly+ subscription.
   * Prompts the user for confirmation, then calls a Supabase RPC function
   * to process the cancellation on the backend.
   */
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
      {/* --- Page Header --- */}
      {/* Sticky header with back button, title, and a quick subscribe button (or active status badge) */}
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white transition-colors cursor-pointer">
            <ArrowLeft size={20} />
          </button>
          <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
            <Crown size={16} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Heatly+</h1>
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

      {/* --- Hero Section --- */}
      {/* Visually striking hero area with dynamic text based on user type (Creator vs User) */}
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
              : 'No ads, free DM access, and a badge that stands out. The premium Heatly experience.'
            }
          </p>
        </div>
      </div>

      {/* --- Detailed Benefits List --- */}
      {/* Renders the full list of BenefitCards with icons and descriptions */}
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

      {/* --- Pricing Card --- */}
      {/* Displays the monthly cost, a bulleted list of features, and the main call-to-action button */}
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
              Heatly+ {isCreator ? 'Creator' : ''}
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

      {/* --- Active Subscription Management --- */}
      {/* Only visible if the user has an active subscription. Shows renewal date and cancel button. */}
      {isPlus && (
        <div className="px-5 mb-8">
          <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
            <h3 className="font-bold text-white mb-3">Your Subscription</h3>
            <div className="space-y-2 text-sm text-zinc-400">
              <div className="flex justify-between">
                <span>Plan</span>
                <span className="text-white font-medium">Heatly+ {isCreator ? 'Creator' : ''}</span>
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

      {/* --- Frequently Asked Questions --- */}
      {/* Expandable accordion items answering common questions. Questions vary by user type. */}
      <div className="px-5 pb-12">
        <h3 className="text-lg font-bold text-white mb-4">FAQ</h3>
        <div className="space-y-3">
          {[
            { q: 'How do I pay?', a: 'Heatly+ is paid via cryptocurrency. We support 10+ popular cryptos including Bitcoin, Ethereum, USDT, and more.' },
            { q: 'What happens when I cancel?', a: 'Your premium benefits stay active until the end of your billing period. No prorated refunds.' },
            ...(isCreator ? [
              { q: 'How does the algorithm boost work?', a: 'Your posts get a 35% boost in the For You feed and 30% priority in Explore trending, meaning more people discover your content.' },
              { q: 'What are Advanced Analytics?', a: 'You get deep insights including earnings trends, subscriber growth over time, revenue breakdown by type, top-performing posts, and engagement rate tracking.' },
            ] : [
              { q: 'What does free DM unlock mean?', a: 'Normally, creators can set a price to message them. With Heatly+, you can message any creator for free — no unlock fees.' },
              { q: 'Will I see any ads?', a: 'No. Heatly+ members get a completely ad-free experience — no sponsored posts, no banners, nothing.' },
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

      {/* --- Payment Modal --- */}
      {/* Hidden by default. Renders the crypto payment flow when showCrypto is true. */}
      {showCrypto && (
        <PaymentModal
          open={showCrypto}
          onClose={() => setShowCrypto(false)}
          amount={price}
          paymentType="plus_subscription"
          metadata={{ tier, user_id: user?.id }}
          onSuccess={handleCryptoSuccess}
        />
      )}
    </div>
  )
}
