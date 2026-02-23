import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Star, TrendingUp, Shield, Globe, DollarSign,
  Camera, Flame, CheckCircle, ChevronRight, Sparkles,
  Upload, FileCheck, User, MapPin, Calendar, Phone,
  CreditCard, ArrowLeft, Megaphone, Link2, Award,
  Eye, EyeOff, Zap, BadgeCheck, X, Image as ImageIcon,
  Mail, Lock, AtSign,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { toast } from 'sonner'
import { cn } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { optimizeImage } from '../lib/storage'
import {
  PLATFORM_FEE_PERCENT,
  REFERRAL_EARNING_PERCENT,
  MIN_SUBSCRIPTION_PRICE,
  MAX_SUBSCRIPTION_PRICE,
} from '../lib/constants'

const CREATOR_EARNING = 100 - PLATFORM_FEE_PERCENT

const ID_TYPES = [
  { value: 'passport', label: 'Passport' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'national_id', label: 'National ID Card' },
  { value: 'residence_permit', label: 'Residence Permit' },
]

const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany',
  'France', 'Netherlands', 'Spain', 'Italy', 'Brazil', 'Colombia',
  'Mexico', 'Argentina', 'Poland', 'Czech Republic', 'Romania',
  'Hungary', 'Ukraine', 'Russia', 'Japan', 'South Korea', 'Philippines',
  'Thailand', 'India', 'South Africa', 'New Zealand', 'Sweden',
  'Norway', 'Denmark', 'Finland', 'Switzerland', 'Austria', 'Belgium',
  'Portugal', 'Ireland', 'Other',
]

/* ─────── Landing Page Section Components ─────── */

function Heredction({ onStart }) {
  return (
    <div className="relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-red-600/5 via-transparent to-transparent" />
      <div className="absolute top-20 left-1/4 w-72 h-72 bg-red-500/10 blur-[120px] rounded-full" />
      <div className="absolute top-40 right-1/4 w-64 h-64 bg-orange-500/10 blur-[100px] rounded-full" />

      <div className="relative text-center py-12 px-5">
        <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-orange-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-red-500/25">
          <Sparkles className="text-white" size={36} />
        </div>

        <h1 className="text-3xl sm:text-4xl font-black text-white mb-4 leading-tight">
          Your content.<br />
          <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">Your rules. Your money.</span>
        </h1>

        <p className="text-base text-zinc-400 max-w-md mx-auto leading-relaxed mb-8">
          Join thousands of creators earning on Heatly — the platform that pays you what you deserve.
        </p>

        <button
          onClick={onStart}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-400 hover:to-orange-500 text-white font-bold text-lg px-8 py-4 rounded-2xl shadow-xl shadow-red-500/25 transition-all active:scale-[0.97] cursor-pointer"
        >
          I Want to Start Earning <ChevronRight size={20} />
        </button>
      </div>
    </div>
  )
}

function EarningsSection() {
  return (
    <div className="px-5 py-8">
      <h2 className="text-xl font-bold text-white text-center mb-6">Industry-Leading Payouts</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
        {/* Standard */}
        <div className="relative bg-gradient-to-br from-red-500/10 to-orange-600/10 border border-red-500/20 rounded-3xl p-6 text-center">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-red-500 to-orange-600 text-white text-xs font-bold px-3 py-1 rounded-full">
            STANDARD
          </div>
          <p className="text-5xl font-black text-white mt-2">{CREATOR_EARNING}%</p>
          <p className="text-sm text-zinc-400 mt-2">of all earnings</p>
          <p className="text-xs text-red-400 mt-1">Subscriptions • Tips • PPV</p>
        </div>

        {/* Referral */}
        <div className="relative bg-gradient-to-br from-amber-500/10 to-orange-600/10 border border-amber-500/20 rounded-3xl p-6 text-center">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs font-bold px-3 py-1 rounded-full">
            WITH REFERRAL LINK
          </div>
          <p className="text-5xl font-black text-white mt-2">{REFERRAL_EARNING_PERCENT}%</p>
          <p className="text-sm text-zinc-400 mt-2">when fans sign up via your link</p>
          <p className="text-xs text-amber-400 mt-1">Share your link • Earn more</p>
        </div>
      </div>

      <div className="mt-6 bg-zinc-900/40 border border-white/5 rounded-2xl p-4 max-w-lg mx-auto">
        <div className="flex items-center gap-3 text-sm">
          <Award size={20} className="text-red-400 flex-shrink-0" />
          <p className="text-zinc-300">
            <strong className="text-white">Highest in the industry.</strong>{' '}
            Most platforms take 40-50%. We believe creators should keep the majority of what they earn.
          </p>
        </div>
      </div>
    </div>
  )
}

function BenefitsSection() {
  const benefits = [
    { icon: DollarSign, title: 'Multiple Revenue Streams', desc: 'Subscriptions, pay-per-view, tips, custom content, and paid messages' },
    { icon: Megaphone, title: 'Promotion Boosts', desc: 'Special promotions and featured placement to boost your visibility and grow your audience faster' },
    { icon: Link2, title: 'Referral Program', desc: `Earn ${REFERRAL_EARNING_PERCENT}% when new fans sign up through your personal link — keep more of what you earn` },
    { icon: Shield, title: 'Creator Safety', desc: 'Geo-blocking by region, automatic watermarks, DMCA protection, and content security tools' },
    { icon: Eye, title: 'Algorithmic Discovery', desc: 'Our For You feed actively promotes your content to the right audience, so you get discovered' },
    { icon: Camera, title: 'Rich Media Support', desc: 'Upload photos, videos, stories, reels, and sets — all with full HD quality and fast delivery' },
    { icon: Flame, title: 'Fan Engagement Tools', desc: 'DMs, polls, reactions, exclusive content tiers, and mass messaging to keep fans coming back' },
    { icon: CreditCard, title: 'Fast Payouts', desc: 'Weekly or bi-weekly payouts via direct deposit, wire, or crypto — your choice, no delays' },
  ]

  return (
    <div className="px-5 py-8">
      <h2 className="text-xl font-bold text-white text-center mb-2">Everything You Need to Succeed</h2>
      <p className="text-sm text-zinc-500 text-center mb-6 max-w-sm mx-auto">Built by creators, for creators — every feature designed to help you earn more.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto">
        {benefits.map((b, i) => (
          <div key={i} className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 hover:border-red-500/20 transition-colors">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-red-500/10 flex-shrink-0">
                <b.icon size={16} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white mb-1">{b.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{b.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HowItWorksSection() {
  const steps = [
    { num: 1, title: 'Apply & Verify', desc: 'Fill out your info where we verify your identity — takes less than 5 minutes', icon: BadgeCheck },
    { num: 2, title: 'Set Up Your Profile', desc: 'Choose your category, set your subscription price, and customize your page', icon: User },
    { num: 3, title: 'Post & Earn', desc: 'Upload your content, engage with fans, and watch your earnings grow', icon: TrendingUp },
  ]

  return (
    <div className="px-5 py-8">
      <h2 className="text-xl font-bold text-white text-center mb-6">How It Works</h2>

      <div className="max-w-md mx-auto space-y-4">
        {steps.map((s, i) => (
          <div key={s.num} className="flex gap-4 items-start">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center flex-shrink-0 text-sm font-bold text-white shadow-lg shadow-red-500/20">
                {s.num}
              </div>
              {i < steps.length - 1 && (
                <div className="absolute left-1/2 top-full w-px h-4 bg-gradient-to-b from-red-500/50 to-transparent -translate-x-1/2" />
              )}
            </div>
            <div className="pb-4">
              <p className="text-sm font-bold text-white flex items-center gap-2">
                {s.title} <s.icon size={14} className="text-red-400" />
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EarningsCalculator() {
  const [subs, setSubs] = useState(100)
  const [price, setPrice] = useState(9.99)
  const monthly = subs * price * (CREATOR_EARNING / 100)

  return (
    <div className="px-5 py-8">
      <h2 className="text-xl font-bold text-white text-center mb-6">Earnings Calculator</h2>

      <div className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 max-w-md mx-auto">
        <div className="space-y-5">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-zinc-400">Subscribers</span>
              <span className="text-white font-bold">{subs}</span>
            </div>
            <input
              type="range" min={10} max={5000} step={10} value={subs}
              onChange={(e) => setSubs(+e.target.value)}
              className="w-full accent-red-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
              <span>10</span><span>5,000</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-zinc-400">Monthly Price</span>
              <span className="text-white font-bold">${price.toFixed(2)}</span>
            </div>
            <input
              type="range" min={4.99} max={49.99} step={1} value={price}
              onChange={(e) => setPrice(+e.target.value)}
              className="w-full accent-red-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
              <span>$4.99</span><span>$49.99</span>
            </div>
          </div>

          <div className="h-px bg-zinc-800" />

          <div className="text-center">
            <p className="text-sm text-zinc-400">Estimated monthly earnings</p>
            <p className="text-4xl font-black bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent mt-1">
              ${monthly.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-zinc-600 mt-1">before tips, PPV, and custom content</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function CtaSection({ onStart }) {
  return (
    <div className="px-5 py-10 text-center">
      <div className="max-w-md mx-auto bg-gradient-to-br from-red-500/10 to-orange-600/10 border border-red-500/20 rounded-3xl p-8">
        <Zap className="text-red-400 mx-auto mb-4" size={32} />
        <h2 className="text-xl font-bold text-white mb-2">Ready to start earning?</h2>
        <p className="text-sm text-zinc-400 mb-6">Application takes less than 5 minutes. Get verified and start posting today.</p>
        <button
          onClick={onStart}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-400 hover:to-orange-500 text-white font-bold px-8 py-4 rounded-2xl shadow-xl shadow-red-500/25 transition-all active:scale-[0.97] cursor-pointer w-full justify-center text-lg"
        >
          I Want to Start Earning <ChevronRight size={20} />
        </button>
      </div>
    </div>
  )
}

/* ─────── File Upload Component ─────── */

function FileUploadBox({ label, hint, file, onSelect, onClear, accept = 'image/*' }) {
  const inputRef = useRef(null)

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-1.5">{label}</label>
      {file ? (
        <div className="flex items-center gap-3 bg-zinc-800/50 border border-emerald-500/30 rounded-xl px-4 py-3">
          <FileCheck size={18} className="text-emerald-400 flex-shrink-0" />
          <span className="text-sm text-zinc-300 truncate flex-1">{file.name}</span>
          <button onClick={onClear} className="text-zinc-500 hover:text-red-400 cursor-pointer">
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-zinc-700/50 hover:border-red-500/30 rounded-xl px-4 py-6 flex flex-col items-center gap-2 transition-colors cursor-pointer group"
        >
          <div className="p-2 rounded-xl bg-zinc-800/50 group-hover:bg-red-500/10 transition-colors">
            <Upload size={20} className="text-zinc-500 group-hover:text-red-400 transition-colors" />
          </div>
          <span className="text-sm text-zinc-500 group-hover:text-zinc-300">Click to upload</span>
          {hint && <span className="text-[11px] text-zinc-600">{hint}</span>}
        </button>
      )}
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => onSelect(e.target.files?.[0] || null)} />
    </div>
  )
}

/* ─────── Application Form ─────── */

function ApplicationForm({ onBack }) {
  const { user, profile, updateProfile, signUp } = useAuthStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [formStep, setFormStep] = useState(1) // 1: personal (+account if not logged in), 2: ID, 3: confirm
  const isGuest = !user

  // Account fields (only for non-authenticated users)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Personal info
  const [legalFirst, setLegalFirst] = useState('')
  const [legalLast, setLegalLast] = useState('')
  const [dob, setDob] = useState('')
  const [country, setCountry] = useState('United States')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')

  // ID verification
  const [idType, setIdType] = useState('passport')
  const [idFront, setIdFront] = useState(null)
  const [idBack, setIdBack] = useState(null)
  const [selfie, setSelfie] = useState(null)

  // Confirmation
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [agreedAge, setAgreedAge] = useState(false)
  const [agreedContent, setAgreedContent] = useState(false)

  const canProceed1 = isGuest
    ? (email && password && password.length >= 8 && username && legalFirst && legalLast && dob && country && city)
    : (legalFirst && legalLast && dob && country && city)
  const canProceed2 = idFront && selfie
  const canSubmit = agreedTerms && agreedAge && agreedContent

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)

    try {
      let userId = user?.id

      // If guest, create account first
      if (isGuest) {
        const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '')
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: cleanUsername,
              display_name: displayName || username,
            },
          },
        })
        if (signUpError) throw signUpError
        userId = data.user?.id
        if (!userId) throw new Error('Account creation failed. Please try again.')
        // Small delay to let the trigger create the profile row
        await new Promise(r => setTimeout(r, 1500))
      }

      // Upload verification documents to PRIVATE bucket (never public!)
      const uploads = []
      const docPath = `${userId}`

      if (idFront) {
        const optimized = await optimizeImage(idFront)
        const ext = optimized.name.split('.').pop()
        uploads.push(
          supabase.storage.from('verification-docs').upload(`${docPath}/id_front.${ext}`, optimized, { upsert: true })
        )
      }
      if (idBack) {
        const optimized = await optimizeImage(idBack)
        const ext = optimized.name.split('.').pop()
        uploads.push(
          supabase.storage.from('verification-docs').upload(`${docPath}/id_back.${ext}`, optimized, { upsert: true })
        )
      }
      if (selfie) {
        const optimized = await optimizeImage(selfie)
        const ext = optimized.name.split('.').pop()
        uploads.push(
          supabase.storage.from('verification-docs').upload(`${docPath}/selfie.${ext}`, optimized, { upsert: true })
        )
      }

      await Promise.all(uploads)

      // Activate creator profile — use direct supabase call with userId for guest flow
      const { data: updatedProfile, error: profileError } = await supabase
        .from('profiles')
        .update({
          is_creator: true,
          subscription_price: MIN_SUBSCRIPTION_PRICE,
          creator_category: 'other',
          legal_name: `${legalFirst} ${legalLast}`,
          verification_status: 'pending',
        })
        .eq('id', userId)
        .select()
        .single()
      if (profileError) throw profileError

      // Update local state if we have the store user
      if (user) {
        useAuthStore.setState({ profile: updatedProfile })
      }

      toast.success('Application submitted! Your creator profile is being reviewed. 🎉')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={formStep === 1 ? onBack : () => setFormStep(formStep - 1)}
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-bold text-white">Creator Application</h1>
        </div>

        {/* Progress bar */}
        <div className="flex gap-2 mt-3">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex-1 h-1 rounded-full overflow-hidden bg-zinc-800">
              <div className={cn(
                'h-full rounded-full transition-all duration-500',
                s <= formStep ? 'bg-gradient-to-r from-red-500 to-orange-600 w-full' : 'w-0'
              )} />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1.5">
          <span className={cn('text-[10px]', formStep >= 1 ? 'text-red-400' : 'text-zinc-600')}>Personal Info</span>
          <span className={cn('text-[10px]', formStep >= 2 ? 'text-red-400' : 'text-zinc-600')}>ID Verification</span>
          <span className={cn('text-[10px]', formStep >= 3 ? 'text-red-400' : 'text-zinc-600')}>Confirm</span>
        </div>
      </header>

      <div className="p-5 max-w-md mx-auto">
        {/* Step 1: Account (if guest) + Personal Info */}
        {formStep === 1 && (
          <div className="space-y-4">
            {isGuest && (
              <>
                <div className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20 rounded-2xl p-4 mb-2">
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <Zap size={16} className="text-red-400" />
                    <span>Create your account and apply as a creator in one step.</span>
                  </div>
                </div>

                <Input label="Display Name" icon={User} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" required />
                <Input label="Username" icon={AtSign} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" pattern="[a-zA-Z0-9_]{3,30}" title="3-30 characters, letters, numbers, and underscores only" required />
                <Input label="Email" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" required />
                <div className="relative">
                  <Input label="Password" icon={Lock} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={8} required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-[38px] text-zinc-500 hover:text-zinc-300 cursor-pointer">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <div className="h-px bg-zinc-800/50 my-2" />
                <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Personal Information</p>
              </>
            )}

            {!isGuest && (
              <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 mb-6">
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  <Shield size={16} className="text-red-400" />
                  <span>Your information is <strong className="text-white">encrypted</strong> and only used for verification purposes.</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Legal First Name"
                icon={User}
                value={legalFirst}
                onChange={(e) => setLegalFirst(e.target.value)}
                placeholder="First name"
                required
              />
              <Input
                label="Legal Last Name"
                icon={User}
                value={legalLast}
                onChange={(e) => setLegalLast(e.target.value)}
                placeholder="Last name"
                required
              />
            </div>

            <Input
              label="Date of Birth"
              icon={Calendar}
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
              required
            />

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">Country</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30 cursor-pointer"
              >
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <Input
              label="City"
              icon={MapPin}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Your city"
              required
            />

            <Input
              label="Street Address"
              icon={MapPin}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street address (optional)"
            />

            <Input
              label="Phone Number"
              icon={Phone}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000 (optional)"
            />

            <Button
              onClick={() => setFormStep(2)}
              disabled={!canProceed1}
              className="w-full !bg-gradient-to-r !from-red-500 !to-orange-600 hover:!from-red-400 hover:!to-orange-500"
              size="lg"
            >
              Continue to ID Verification <ChevronRight size={18} />
            </Button>

            {isGuest && (
              <p className="text-center text-xs text-zinc-600">
                Already have an account?{' '}
                <Link to="/auth" className="text-red-400 hover:underline">Sign in</Link>{' '}
                then come back here.
              </p>
            )}
          </div>
        )}

        {/* Step 2: ID Verification */}
        {formStep === 2 && (
          <div className="space-y-4">
            <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 mb-6">
              <div className="flex items-start gap-2 text-sm text-zinc-300">
                <BadgeCheck size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                <span>
                  Upload a government-issued ID to verify your identity. This is required by law for content monetization.
                </span>
              </div>
            </div>

            {/* ID Type */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1.5">ID Document Type</label>
              <select
                value={idType}
                onChange={(e) => setIdType(e.target.value)}
                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30 cursor-pointer"
              >
                {ID_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* ID Front */}
            <FileUploadBox
              label="ID Front"
              hint="Clear photo of the front of your ID"
              file={idFront}
              onSelect={setIdFront}
              onClear={() => setIdFront(null)}
            />

            {/* ID Back (not for passport) */}
            {idType !== 'passport' && (
              <FileUploadBox
                label="ID Back"
                hint="Clear photo of the back of your ID"
                file={idBack}
                onSelect={setIdBack}
                onClear={() => setIdBack(null)}
              />
            )}

            {/* Selfie with ID */}
            <FileUploadBox
              label="Selfie Holding Your ID"
              hint="Take a selfie while holding your ID next to your face"
              file={selfie}
              onSelect={setSelfie}
              onClear={() => setSelfie(null)}
            />

            <div className="bg-zinc-900/40 border border-amber-500/20 rounded-2xl p-3">
              <p className="text-xs text-zinc-400 leading-relaxed">
                <strong className="text-amber-400">Tips for approval:</strong> Make sure your photos are clear, well-lit, and all text on your ID is readable. Your selfie should clearly show both your face and the ID.
              </p>
            </div>

            <Button
              onClick={() => setFormStep(3)}
              disabled={!canProceed2}
              className="w-full !bg-gradient-to-r !from-red-500 !to-orange-600 hover:!from-red-400 hover:!to-orange-500"
              size="lg"
            >
              Continue to Confirmation <ChevronRight size={18} />
            </Button>
          </div>
        )}

        {/* Step 3: Confirm & Submit */}
        {formStep === 3 && (
          <div className="space-y-5">
            {/* Summary */}
            <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white mb-3">Application Summary</h3>

              <div className="flex items-center gap-3 pb-3 border-b border-zinc-800/50">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center text-sm font-bold text-white">
                  {legalFirst[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{legalFirst} {legalLast}</p>
                  <p className="text-xs text-zinc-500">@{profile?.username || username || 'you'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-zinc-500">Date of Birth</span>
                <span className="text-zinc-300 text-right">{dob}</span>
                <span className="text-zinc-500">Country</span>
                <span className="text-zinc-300 text-right">{country}</span>
                <span className="text-zinc-500">City</span>
                <span className="text-zinc-300 text-right">{city}</span>
                <span className="text-zinc-500">ID Type</span>
                <span className="text-zinc-300 text-right">{ID_TYPES.find(t => t.value === idType)?.label}</span>
                <span className="text-zinc-500">Documents</span>
                <span className="text-zinc-300 text-right">{[idFront, idBack, selfie].filter(Boolean).length} files uploaded</span>
              </div>
            </div>

            {/* Agreements */}
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={agreedAge} onChange={(e) => setAgreedAge(e.target.checked)} className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-red-600 focus:ring-red-500 cursor-pointer" />
                <span className="text-xs text-zinc-400 leading-relaxed">
                  I confirm that I am <strong className="text-white">at least 18 years old</strong> and legally allowed to create adult content in my jurisdiction.
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={agreedContent} onChange={(e) => setAgreedContent(e.target.checked)} className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-red-600 focus:ring-red-500 cursor-pointer" />
                <span className="text-xs text-zinc-400 leading-relaxed">
                  I confirm that all content I upload will be <strong className="text-white">original and created by me</strong>, and I have legal rights to monetize it.
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)} className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-red-600 focus:ring-red-500 cursor-pointer" />
                <span className="text-xs text-zinc-400 leading-relaxed">
                  I agree to the <strong className="text-white">Creator Agreement</strong> including the {PLATFORM_FEE_PERCENT}% platform fee, content policies, community guidelines, and payout terms.
                </span>
              </label>
            </div>

            {/* What happens next */}
            <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4">
              <h4 className="text-xs font-bold text-zinc-300 mb-2">What happens next?</h4>
              <ul className="space-y-1.5 text-xs text-zinc-500">
                <li className="flex items-center gap-2"><CheckCircle size={12} className="text-emerald-400" /> We'll review your application (usually within 24h)</li>
                <li className="flex items-center gap-2"><CheckCircle size={12} className="text-emerald-400" /> You'll get a notification when you're approved</li>
                <li className="flex items-center gap-2"><CheckCircle size={12} className="text-emerald-400" /> Start posting and earning immediately after approval</li>
              </ul>
            </div>

            <Button
              onClick={handleSubmit}
              loading={loading}
              disabled={!canSubmit}
              className="w-full !bg-gradient-to-r !from-red-500 !to-orange-600 hover:!from-red-400 hover:!to-orange-500"
              size="lg"
            >
              <Star size={18} /> Submit Application
            </Button>

            <p className="text-center text-[11px] text-zinc-600">
              By submitting, you agree to our Privacy Policy and consent to identity verification processing.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────── Main Page ─────── */

export default function BecomeCreatorPage() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const [view, setView] = useState('landing') // landing | apply

  // Already a creator
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

  const handleStartEarning = () => {
    setView('apply')
  }

  // Application form
  if (view === 'apply') {
    return <ApplicationForm onBack={() => setView('landing')} />
  }

  // Landing page
  return (
    <div className="pb-10">
      <Heredction onStart={handleStartEarning} />
      <EarningsSection />
      <BenefitsSection />
      <EarningsCalculator />
      <HowItWorksSection />
      <CtaSection onStart={handleStartEarning} />
    </div>
  )
}
