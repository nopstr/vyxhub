import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Mail, Lock, User, AtSign, Eye, EyeOff, Star, TrendingUp, Shield, Globe, Percent, DollarSign } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { toast } from 'sonner'
import { cn } from '../lib/utils'
import { PLATFORM_FEE_PERCENT, MIN_SUBSCRIPTION_PRICE, MAX_SUBSCRIPTION_PRICE } from '../lib/constants'

const MODEL_CATEGORIES = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'couple', label: 'Couple' },
  { value: 'trans', label: 'Trans' },
  { value: 'nonbinary', label: 'Non-binary' },
  { value: 'other', label: 'Other' },
]

export default function AuthPage() {
  const [mode, setMode] = useState('login') // login | signup | signup-model | forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [agreedAge, setAgreedAge] = useState(false)
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [subPrice, setSubPrice] = useState('9.99')
  const [category, setCategory] = useState('other')
  const { signIn, signUp, resetPassword, signInWithOAuth } = useAuthStore()
  const navigate = useNavigate()

  const isSignupMode = mode === 'signup' || mode === 'signup-model'
  const isModelSignup = mode === 'signup-model'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (mode === 'login') {
        await signIn(email, password)
        toast.success('Welcome back!')
        navigate('/')
      } else if (isSignupMode) {
        if (!agreedAge) {
          toast.error('You must confirm you are 18+')
          setLoading(false)
          return
        }
        if (isModelSignup && !agreedTerms) {
          toast.error('You must agree to the Creator Terms')
          setLoading(false)
          return
        }
        const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '')
        await signUp(email, password, {
          username: cleanUsername,
          display_name: displayName || username,
        })
        // If model signup, activate creator profile after signup
        if (isModelSignup) {
          await new Promise(r => setTimeout(r, 600))
          const { supabase } = await import('../lib/supabase')
          const { data: { user: authUser } } = await supabase.auth.getUser()
          if (authUser) {
            await supabase.from('profiles').update({
              is_creator: true,
              subscription_price: parseFloat(subPrice) || 9.99,
              creator_category: category,
            }).eq('id', authUser.id)
          }
        }
        toast.success(isModelSignup ? 'Welcome to VyxHub! Your creator profile is ready.' : 'Welcome to VyxHub!')
        navigate('/')
      } else {
        await resetPassword(email)
        toast.success('Password reset link sent to your email')
      }
    } catch (err) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center px-4 py-12">
      <div className="fixed inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-violet-600/10 blur-[120px] rounded-full" />
        {isModelSignup && <div className="absolute top-1/2 right-1/3 w-64 h-64 bg-pink-600/10 blur-[130px] rounded-full" />}
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className={cn(
            'w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-2xl',
            isModelSignup ? 'bg-gradient-to-br from-pink-500 to-violet-600 shadow-pink-500/20' : 'bg-white shadow-white/10'
          )}>
            {isModelSignup ? <Star className="text-white fill-white" size={32} /> : <Zap className="text-black fill-black" size={32} />}
          </div>
          <h1 className="text-3xl font-black tracking-tighter bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            VYXHUB
          </h1>
          <p className="text-sm text-zinc-500 mt-2">
            {mode === 'login' ? 'Welcome back' : isModelSignup ? 'Start earning as a creator' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
          </p>
        </div>

        {/* Signup toggle: Fan vs Model */}
        {isSignupMode && (
          <div className="flex items-center mb-5 bg-zinc-900/50 rounded-2xl p-1 border border-zinc-800/50">
            <button
              onClick={() => setMode('signup')}
              className={cn(
                'flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all cursor-pointer',
                mode === 'signup' ? 'bg-white text-black shadow-lg' : 'text-zinc-400 hover:text-zinc-300'
              )}
            >
              Fan Account
            </button>
            <button
              onClick={() => setMode('signup-model')}
              className={cn(
                'flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5',
                isModelSignup ? 'bg-gradient-to-r from-pink-500 to-violet-600 text-white shadow-lg shadow-pink-500/20' : 'text-zinc-400 hover:text-zinc-300'
              )}
            >
              <Star size={14} /> Model / Creator
            </button>
          </div>
        )}

        {/* Model benefits */}
        {isModelSignup && (
          <div className="mb-5 bg-gradient-to-br from-pink-500/10 to-violet-600/10 border border-pink-500/20 rounded-2xl p-4">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <TrendingUp size={16} className="text-pink-400" /> Why creators love VyxHub
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { icon: Percent, text: `Keep ${100 - PLATFORM_FEE_PERCENT}% of earnings` },
                { icon: DollarSign, text: 'Set your own prices' },
                { icon: Shield, text: 'Geo-blocking & watermarks' },
                { icon: Globe, text: 'Global audience reach' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-zinc-300">
                  <item.icon size={13} className="text-pink-400 flex-shrink-0" />
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-3xl p-8 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignupMode && (
              <>
                <Input label="Display Name" icon={User} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={isModelSignup ? 'Your stage/display name' : 'Your name'} required />
                <Input label="Username" icon={AtSign} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" pattern="[a-zA-Z0-9_]{3,30}" title="3-30 characters, letters, numbers, and underscores only" required />
              </>
            )}

            <Input label="Email" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" required />

            {mode !== 'forgot' && (
              <div className="relative">
                <Input label="Password" icon={Lock} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={isSignupMode ? 8 : undefined} required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-[38px] text-zinc-500 hover:text-zinc-300 cursor-pointer">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            )}

            {/* Model-specific fields */}
            {isModelSignup && (
              <>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-pink-500/50 cursor-pointer">
                    {MODEL_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Monthly Subscription Price</label>
                  <div className="relative">
                    <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input type="number" min={MIN_SUBSCRIPTION_PRICE} max={MAX_SUBSCRIPTION_PRICE} step="0.01" value={subPrice} onChange={(e) => setSubPrice(e.target.value)} className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl pl-9 pr-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-pink-500/50" />
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    You earn <strong className="text-emerald-400">${((parseFloat(subPrice) || 0) * (100 - PLATFORM_FEE_PERCENT) / 100).toFixed(2)}/subscriber</strong> after {PLATFORM_FEE_PERCENT}% platform fee
                  </p>
                </div>
              </>
            )}

            {isSignupMode && (
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={agreedAge} onChange={(e) => setAgreedAge(e.target.checked)} className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                  <span className="text-xs text-zinc-400 leading-relaxed">
                    I confirm that I am <strong className="text-white">18 years or older</strong> and agree to the Terms of Service and Privacy Policy.
                  </span>
                </label>
                {isModelSignup && (
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)} className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-pink-600 focus:ring-pink-500 cursor-pointer" />
                    <span className="text-xs text-zinc-400 leading-relaxed">
                      I agree to the <strong className="text-white">Creator Agreement</strong> including {PLATFORM_FEE_PERCENT}% platform fee, content policies, and payout terms.
                    </span>
                  </label>
                )}
              </div>
            )}

            <Button type="submit" loading={loading} className={cn('w-full', isModelSignup && '!bg-gradient-to-r !from-pink-500 !to-violet-600 hover:!from-pink-400 hover:!to-violet-500')} size="lg">
              {mode === 'login' ? 'Sign In' : isModelSignup ? 'Create Creator Account' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </Button>
          </form>

          {mode !== 'forgot' && !isModelSignup && (
            <>
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-xs text-zinc-600 uppercase font-medium">or</span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>
              <div className="space-y-3">
                <Button variant="secondary" className="w-full" onClick={() => signInWithOAuth('google')}>
                  <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                  Continue with Google
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => signInWithOAuth('twitter')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                  Continue with X
                </Button>
              </div>
            </>
          )}

          <div className="mt-6 text-center space-y-2">
            {mode === 'login' && (
              <>
                <button onClick={() => setMode('forgot')} className="text-xs text-zinc-500 hover:text-indigo-400 transition-colors cursor-pointer">Forgot password?</button>
                <p className="text-sm text-zinc-500">
                  No account?{' '}
                  <button onClick={() => setMode('signup')} className="text-indigo-400 font-semibold hover:underline cursor-pointer">Sign up</button>
                </p>
                <p className="text-sm">
                  <button onClick={() => setMode('signup-model')} className="text-pink-400 font-semibold hover:underline cursor-pointer flex items-center gap-1 mx-auto">
                    <Star size={13} /> Sign up as a Model
                  </button>
                </p>
              </>
            )}
            {isSignupMode && (
              <p className="text-sm text-zinc-500">
                Already have an account?{' '}
                <button onClick={() => setMode('login')} className="text-indigo-400 font-semibold hover:underline cursor-pointer">Sign in</button>
              </p>
            )}
            {mode === 'forgot' && (
              <button onClick={() => setMode('login')} className="text-sm text-indigo-400 font-semibold hover:underline cursor-pointer">Back to login</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
