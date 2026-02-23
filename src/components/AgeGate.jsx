import { useState, useEffect } from 'react'
import { ShieldCheck, AlertTriangle } from 'lucide-react'

const AGE_VERIFIED_KEY = 'heatly_age_verified'
const MIN_AGE = 18

function getMaxDob() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - MIN_AGE)
  return d.toISOString().split('T')[0]
}

/**
 * Full-screen age verification gate.
 * Blocks all content until the user confirms they are 18+.
 * Persists via localStorage so returning visitors aren't re-prompted.
 */
export default function AgeGate({ children }) {
  const [verified, setVerified] = useState(() => {
    try {
      return localStorage.getItem(AGE_VERIFIED_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [dob, setDob] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState('')

  // If already verified on mount, skip entirely
  if (verified) return children

  const handleVerify = () => {
    setError('')

    if (!dob) {
      setError('Please enter your date of birth.')
      return
    }

    const birthDate = new Date(dob)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }

    if (age < MIN_AGE) {
      setError('You must be at least 18 years old to access this site.')
      return
    }

    if (!agreed) {
      setError('You must agree to the terms to continue.')
      return
    }

    try {
      localStorage.setItem(AGE_VERIFIED_KEY, 'true')
    } catch {
      // Storage may be unavailable in private browsing — still allow access
    }
    setVerified(true)
  }

  const handleExit = () => {
    window.location.href = 'https://google.com'
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center p-6">
      {/* Subtle background effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-indigo-600/5 blur-[150px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-violet-600/5 blur-[120px] rounded-full" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-zinc-950 border border-zinc-800/50 rounded-3xl p-8 shadow-2xl">
          {/* Icon */}
          <div className="w-16 h-16 bg-indigo-600/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldCheck size={32} className="text-indigo-400" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-black text-white text-center mb-2">
            Age Verification Required
          </h1>
          <p className="text-sm text-zinc-400 text-center mb-8 leading-relaxed">
            This website contains age-restricted content. You must be at least{' '}
            <strong className="text-white">18 years old</strong> to enter.
          </p>

          {/* DOB Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-zinc-400 mb-1.5">
              Date of Birth
            </label>
            <input
              type="date"
              value={dob}
              max={getMaxDob()}
              onChange={(e) => setDob(e.target.value)}
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
            />
          </div>

          {/* Agreement checkbox */}
          <label className="flex items-start gap-3 mb-6 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <span className="text-xs text-zinc-400 leading-relaxed">
              I confirm I am at least <strong className="text-white">18 years old</strong> and
              I consent to viewing age-restricted content. I agree to the{' '}
              <a href="/terms" className="text-indigo-400 hover:underline">Terms of Service</a>{' '}
              and{' '}
              <a href="/privacy" className="text-indigo-400 hover:underline">Privacy Policy</a>.
            </span>
          </label>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertTriangle size={14} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleVerify}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] cursor-pointer"
            >
              I Am 18 or Older — Enter
            </button>
            <button
              onClick={handleExit}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 font-medium py-3 rounded-xl transition-colors cursor-pointer border border-zinc-800/50"
            >
              I Am Under 18 — Exit
            </button>
          </div>
        </div>

        {/* Legal footer */}
        <p className="text-[10px] text-zinc-600 text-center mt-4 leading-relaxed max-w-xs mx-auto">
          By entering this site you certify that you are of legal age to view adult content
          in your jurisdiction. Records required by 18 U.S.C. 2257 are kept by the custodian of records.
        </p>
      </div>
    </div>
  )
}
