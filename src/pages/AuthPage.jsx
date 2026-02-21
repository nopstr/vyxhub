import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Zap, Mail, Lock, User, AtSign, Eye, EyeOff, Star, ChevronRight, ShieldCheck } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { supabase } from '../lib/supabase'
import { toast } from 'sonner'
import { cn } from '../lib/utils'

// Helper to read a cookie by name
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

// Helper to delete a cookie
function deleteCookie(name) {
  document.cookie = `${name}=;path=/;max-age=0`
}

export default function AuthPage() {
  const [mode, setMode] = useState('login') // login | signup | forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [agreedAge, setAgreedAge] = useState(false)
  // 2FA state
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaFactorId, setMfaFactorId] = useState(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaLoading, setMfaLoading] = useState(false)
  const { signIn, signUp, resetPassword, signInWithOAuth, verifyMfa } = useAuthStore()
  const navigate = useNavigate()

  const isSignupMode = mode === 'signup'

  const handleMfaVerify = async (e) => {
    e.preventDefault()
    if (!mfaCode || mfaCode.length !== 6) return toast.error('Enter a 6-digit code')
    setMfaLoading(true)
    try {
      await verifyMfa(mfaFactorId, mfaCode)
      toast.success('Welcome back!')
      navigate('/')
    } catch (err) {
      toast.error(err.message || 'Invalid code')
    } finally {
      setMfaLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (mode === 'login') {
        const result = await signIn(email, password)
        if (result?.mfaRequired) {
          // Get TOTP factor to challenge
          const { data: factors } = await supabase.auth.mfa.listFactors()
          const totpFactor = factors?.totp?.find(f => f.status === 'verified')
          if (totpFactor) {
            setMfaFactorId(totpFactor.id)
            setMfaRequired(true)
            setLoading(false)
            return
          }
        }
        toast.success('Welcome back!')
        navigate('/')
      } else if (mode === 'signup') {
        if (!agreedAge) {
          toast.error('You must confirm you are 18+')
          setLoading(false)
          return
        }
        if (password !== confirmPassword) {
          toast.error('Passwords do not match')
          setLoading(false)
          return
        }
        const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '')
        const signUpResult = await signUp(email, password, {
          username: cleanUsername,
          display_name: displayName || username,
        })
        
        // Check for referral cookie and record it (cookie stores username from /r/@username link)
        const referrerUsername = getCookie('vyxhub_ref')
        if (referrerUsername && signUpResult?.user?.id) {
          try {
            await supabase.rpc('record_referral_by_username', {
              p_referrer_username: decodeURIComponent(referrerUsername),
              p_referred_user_id: signUpResult.user.id,
            })
          } catch (_) { /* non-blocking */ }
          deleteCookie('vyxhub_ref')
        }
        
        toast.success('Welcome to VyxHub!')
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
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-2xl bg-white shadow-white/10">
            <Zap className="text-black fill-black" size={32} />
          </div>
          <h1 className="text-3xl font-black tracking-tighter bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            VYXHUB
          </h1>
          <p className="text-sm text-zinc-500 mt-2">
            {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-3xl p-8 backdrop-blur-sm">
          {mfaRequired ? (
            <form onSubmit={handleMfaVerify} className="space-y-4">
              <div className="text-center mb-2">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck size={24} className="text-indigo-400" />
                </div>
                <h2 className="text-lg font-bold text-white">Two-Factor Authentication</h2>
                <p className="text-sm text-zinc-500 mt-1">Enter the 6-digit code from your authenticator app</p>
              </div>
              <Input
                label="Verification Code"
                icon={Lock}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                autoFocus
                required
              />
              <Button type="submit" loading={mfaLoading} className="w-full" size="lg">
                Verify
              </Button>
              <button
                type="button"
                onClick={() => { setMfaRequired(false); setMfaCode(''); setMfaFactorId(null) }}
                className="block w-full text-center text-sm text-zinc-500 hover:text-indigo-400 transition-colors cursor-pointer"
              >
                Back to login
              </button>
            </form>
          ) : (
          <>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignupMode && (
              <>
                <Input label="Display Name" icon={User} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" required />
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

            {isSignupMode && (
              <Input
                label="Confirm Password"
                icon={Lock}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            )}

            {isSignupMode && (
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={agreedAge} onChange={(e) => setAgreedAge(e.target.checked)} className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                  <span className="text-xs text-zinc-400 leading-relaxed">
                    I confirm that I am <strong className="text-white">18 years or older</strong> and agree to the Terms of Service and Privacy Policy.
                  </span>
                </label>
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full" size="lg">
              {mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </Button>
          </form>

          {mode !== 'forgot' && (
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

          {/* Become a Creator CTA */}
          <Link
            to="/become-creator"
            className="mt-5 flex items-center justify-between bg-gradient-to-r from-pink-500/10 to-violet-600/10 border border-pink-500/20 rounded-2xl p-4 hover:border-pink-500/40 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-pink-500 to-violet-600 shadow-lg shadow-pink-500/20">
                <Star size={18} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Become a Creator</p>
                <p className="text-xs text-zinc-500">Earn 70% — highest in the industry</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-zinc-600 group-hover:text-pink-400 transition-colors" />
          </Link>

          <div className="mt-5 text-center space-y-2">
            {mode === 'login' && (
              <>
                <button onClick={() => setMode('forgot')} className="text-xs text-zinc-500 hover:text-indigo-400 transition-colors cursor-pointer">Forgot password?</button>
                <p className="text-sm text-zinc-500">
                  No account?{' '}
                  <button onClick={() => setMode('signup')} className="text-indigo-400 font-semibold hover:underline cursor-pointer">Sign up</button>
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
          </>
          )}
        </div>
      </div>
    </div>
  )
}
