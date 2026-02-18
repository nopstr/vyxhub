import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Star, TrendingUp, Shield, Globe, Percent, DollarSign,
  Camera, Heart, Zap, CheckCircle, ChevronRight, Sparkles,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import Button from '../components/ui/Button'
import { toast } from 'sonner'
import { cn } from '../lib/utils'
import { supabase } from '../lib/supabase'
import {
  PLATFORM_FEE_PERCENT,
  MIN_SUBSCRIPTION_PRICE,
  MAX_SUBSCRIPTION_PRICE,
} from '../lib/constants'

const MODEL_CATEGORIES = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'couple', label: 'Couple' },
  { value: 'trans', label: 'Trans' },
  { value: 'nonbinary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
]

const BENEFITS = [
  { icon: Percent, title: `Keep ${100 - PLATFORM_FEE_PERCENT}%`, desc: 'Industry-leading revenue share on all earnings' },
  { icon: DollarSign, title: 'Multiple Revenue Streams', desc: 'Subscriptions, PPV, tips, and custom content' },
  { icon: Shield, title: 'Safety Tools', desc: 'Geo-blocking, watermarks, and content protection' },
  { icon: Globe, title: 'Global Reach', desc: 'Build your audience with algorithmic discovery' },
  { icon: Camera, title: 'Rich Media', desc: 'Photos, videos, stories, reels, and live streams' },
  { icon: Heart, title: 'Fan Engagement', desc: 'DMs, reactions, polls, and exclusive content' },
]

const STEPS = [
  { num: 1, title: 'Set up your profile', desc: 'Choose your category and set your subscription price' },
  { num: 2, title: 'Post your first content', desc: 'Upload photos or videos to start attracting subscribers' },
  { num: 3, title: 'Get paid', desc: 'Earn from subscriptions, tips, and pay-per-view content' },
]

export default function BecomeCreatorPage() {
  const { user, profile, updateProfile } = useAuthStore()
  const navigate = useNavigate()
  const [step, setStep] = useState('info') // info | form
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState('other')
  const [subPrice, setSubPrice] = useState('9.99')
  const [agreedTerms, setAgreedTerms] = useState(false)

  // Already a creator — redirect
  if (user && profile?.is_creator) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="p-4 rounded-full bg-emerald-500/10 mb-4">
          <CheckCircle size={32} className="text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">You're already a creator!</h2>
        <p className="text-sm text-zinc-500 mb-6">Manage your content and earnings from the dashboard.</p>
        <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
      </div>
    )
  }

  // Not logged in — redirect to auth with model signup
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-pink-500/20">
          <Star className="text-white fill-white" size={32} />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Become a Creator</h2>
        <p className="text-sm text-zinc-500 mb-6 max-w-sm">Sign up or log in to start your creator journey on VyxHub.</p>
        <div className="flex gap-3">
          <Button onClick={() => navigate('/auth')} variant="secondary">Sign In</Button>
          <Button onClick={() => navigate('/auth')} className="!bg-gradient-to-r !from-pink-500 !to-violet-600">Sign Up</Button>
        </div>
      </div>
    )
  }

  const handleActivate = async () => {
    if (!agreedTerms) {
      toast.error('You must agree to the Creator Agreement')
      return
    }

    const price = parseFloat(subPrice)
    if (!price || price < MIN_SUBSCRIPTION_PRICE || price > MAX_SUBSCRIPTION_PRICE) {
      toast.error(`Subscription price must be between $${MIN_SUBSCRIPTION_PRICE} and $${MAX_SUBSCRIPTION_PRICE}`)
      return
    }

    setLoading(true)
    try {
      await updateProfile({
        is_creator: true,
        subscription_price: price,
        creator_category: category,
      })
      toast.success('Welcome aboard! Your creator profile is live 🎉')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.message || 'Failed to activate creator profile')
    } finally {
      setLoading(false)
    }
  }

  // Step 1: Info / landing
  if (step === 'info') {
    return (
      <div>
        <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
          <h1 className="text-xl font-bold text-white">Become a Creator</h1>
        </header>

        <div className="p-5 space-y-8 max-w-xl mx-auto">
          {/* Hero */}
          <div className="text-center py-6">
            <div className="w-20 h-20 bg-gradient-to-br from-pink-500 to-violet-600 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-pink-500/20">
              <Sparkles className="text-white" size={36} />
            </div>
            <h2 className="text-2xl font-black text-white mb-3">
              Start earning on VyxHub
            </h2>
            <p className="text-sm text-zinc-400 max-w-sm mx-auto leading-relaxed">
              Turn your content into a business. Set your prices, build your audience, and get paid directly.
            </p>
          </div>

          {/* Benefits grid */}
          <div className="grid grid-cols-2 gap-3">
            {BENEFITS.map((b, i) => (
              <div key={i} className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4">
                <div className="p-2 rounded-xl bg-pink-500/10 w-fit mb-3">
                  <b.icon size={18} className="text-pink-400" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">{b.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>

          {/* How it works */}
          <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-5">
            <h3 className="font-bold text-white mb-4">How it works</h3>
            <div className="space-y-4">
              {STEPS.map((s) => (
                <div key={s.num} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center flex-shrink-0 text-sm font-bold text-white">
                    {s.num}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{s.title}</p>
                    <p className="text-xs text-zinc-500">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <Button
            onClick={() => setStep('form')}
            className="w-full !bg-gradient-to-r !from-pink-500 !to-violet-600 hover:!from-pink-400 hover:!to-violet-500"
            size="lg"
          >
            Get Started <ChevronRight size={18} />
          </Button>
        </div>
      </div>
    )
  }

  // Step 2: Activation form
  return (
    <div>
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4 flex items-center gap-3">
        <button onClick={() => setStep('info')} className="text-zinc-400 hover:text-white transition-colors cursor-pointer">
          ← Back
        </button>
        <h1 className="text-lg font-bold text-white">Activate Creator Profile</h1>
      </header>

      <div className="p-5 max-w-md mx-auto space-y-6">
        {/* Current account info */}
        <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-400">
            {profile?.display_name?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-sm font-bold text-white">{profile?.display_name}</p>
            <p className="text-xs text-zinc-500">@{profile?.username}</p>
          </div>
          <div className="ml-auto text-xs text-zinc-600 bg-zinc-800/50 px-2.5 py-1 rounded-full">Fan account</div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-pink-500/50 cursor-pointer"
          >
            {MODEL_CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Subscription price */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Monthly Subscription Price</label>
          <div className="relative">
            <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="number"
              min={MIN_SUBSCRIPTION_PRICE}
              max={MAX_SUBSCRIPTION_PRICE}
              step="0.01"
              value={subPrice}
              onChange={(e) => setSubPrice(e.target.value)}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl pl-9 pr-4 py-3 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
            />
          </div>
          <p className="text-xs text-zinc-500 mt-1.5">
            You earn <strong className="text-emerald-400">${((parseFloat(subPrice) || 0) * (100 - PLATFORM_FEE_PERCENT) / 100).toFixed(2)}/subscriber</strong> after {PLATFORM_FEE_PERCENT}% platform fee
          </p>
          <div className="flex gap-2 mt-2">
            {['4.99', '9.99', '14.99', '24.99'].map(p => (
              <button
                key={p}
                onClick={() => setSubPrice(p)}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer',
                  subPrice === p
                    ? 'border-pink-500/50 bg-pink-500/10 text-pink-300'
                    : 'border-zinc-700/50 text-zinc-500 hover:text-zinc-300'
                )}
              >
                ${p}
              </button>
            ))}
          </div>
        </div>

        {/* Agreement */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreedTerms}
            onChange={(e) => setAgreedTerms(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-pink-600 focus:ring-pink-500 cursor-pointer"
          />
          <span className="text-xs text-zinc-400 leading-relaxed">
            I agree to the <strong className="text-white">Creator Agreement</strong> including the {PLATFORM_FEE_PERCENT}% platform fee, content policies, and payout terms.
          </span>
        </label>

        {/* Activate */}
        <Button
          onClick={handleActivate}
          loading={loading}
          className="w-full !bg-gradient-to-r !from-pink-500 !to-violet-600 hover:!from-pink-400 hover:!to-violet-500"
          size="lg"
        >
          <Star size={18} /> Activate Creator Profile
        </Button>

        <p className="text-center text-[11px] text-zinc-600">
          You can change your pricing and settings at any time from Creator Settings.
        </p>
      </div>
    </div>
  )
}
