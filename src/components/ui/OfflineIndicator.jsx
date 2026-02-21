import { useState, useEffect } from 'react'
import { WifiOff, Wifi } from 'lucide-react'

/**
 * Global offline indicator — shows a slim banner when the browser loses connectivity.
 * Auto-hides with a "Back online" message when connection is restored.
 */
export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showReconnected, setShowReconnected] = useState(false)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      if (wasOffline) {
        setShowReconnected(true)
        setTimeout(() => setShowReconnected(false), 3000)
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
      setWasOffline(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [wasOffline])

  // Nothing to show
  if (isOnline && !showReconnected) return null

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium transition-all duration-300 safe-area-top ${
        isOnline
          ? 'bg-emerald-600/90 text-white backdrop-blur-sm'
          : 'bg-zinc-900/95 text-zinc-300 backdrop-blur-sm border-b border-zinc-800 animate-offline-pulse'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi size={14} className="text-emerald-200" />
          Back online
        </>
      ) : (
        <>
          <WifiOff size={14} className="text-zinc-500" />
          You're offline — some features may be unavailable
        </>
      )}
    </div>
  )
}
