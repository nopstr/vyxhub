import { useState, useEffect } from 'react'
import { Cookie, X } from 'lucide-react'
import { Link } from 'react-router-dom'

const CONSENT_KEY = 'heatly_cookie_consent'

/**
 * GDPR/CCPA cookie consent banner.
 * Displays on first visit, persists consent in localStorage.
 * Only shows essential cookies notice (no third-party tracking).
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONSENT_KEY)) {
        // Small delay to avoid flash during page load
        const t = setTimeout(() => setVisible(true), 1000)
        return () => clearTimeout(t)
      }
    } catch {
      // localStorage unavailable — don't show banner
    }
  }, [])

  const handleAccept = () => {
    try {
      localStorage.setItem(CONSENT_KEY, 'accepted')
    } catch {
      // Continue silently
    }
    setVisible(false)
  }

  const handleDecline = () => {
    try {
      localStorage.setItem(CONSENT_KEY, 'declined')
    } catch {
      // Continue silently
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 md:p-6 pointer-events-none">
      <div className="max-w-lg mx-auto md:mx-0 md:ml-4 pointer-events-auto">
        <div className="bg-zinc-950 border border-zinc-800/50 rounded-2xl p-5 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-indigo-600/10 flex-shrink-0 mt-0.5">
              <Cookie size={18} className="text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-300 leading-relaxed">
                We use <strong className="text-white">essential cookies</strong> for authentication
                and session management. No third-party tracking.{' '}
                <Link to="/privacy" className="text-indigo-400 hover:underline">
                  Privacy Policy
                </Link>
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleAccept}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Accept
                </button>
                <button
                  onClick={handleDecline}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Decline Optional
                </button>
              </div>
            </div>
            <button
              onClick={handleDecline}
              className="text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer flex-shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
