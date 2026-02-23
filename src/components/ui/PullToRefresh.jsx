import { useState, useRef, useCallback, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'

const THRESHOLD = 80       // px to pull before triggering refresh
const MAX_PULL = 120       // max pull distance
const RESISTANCE = 0.45    // resistance factor for overscroll

/**
 * PullToRefresh wrapper — only active on touch devices (mobile).
 * Wraps children and triggers onRefresh when user pulls down from top.
 *
 * @param {Function} onRefresh - async function called on pull-to-refresh
 * @param {React.ReactNode} children - content to wrap
 * @param {boolean} disabled - disables pull-to-refresh
 */
export default function PullToRefresh({ onRefresh, children, disabled = false }) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const touchStartY = useRef(0)
  const touchStartX = useRef(0)
  const isPulling = useRef(false)
  const containerRef = useRef(null)

  const handleTouchStart = useCallback((e) => {
    if (disabled || refreshing) return
    // Only start pull if scrolled to top
    const scrollTop = window.scrollY || document.documentElement.scrollTop
    if (scrollTop > 5) return

    touchStartY.current = e.touches[0].clientY
    touchStartX.current = e.touches[0].clientX
    isPulling.current = false
  }, [disabled, refreshing])

  const handleTouchMove = useCallback((e) => {
    if (disabled || refreshing) return
    if (touchStartY.current === 0) return

    const currentY = e.touches[0].clientY
    const currentX = e.touches[0].clientX
    const deltaY = currentY - touchStartY.current
    const deltaX = Math.abs(currentX - touchStartX.current)

    // If horizontal movement is bigger, this is a swipe — abort pull
    if (!isPulling.current && deltaX > Math.abs(deltaY)) {
      touchStartY.current = 0
      return
    }

    // Only activate on downward pull
    if (deltaY <= 0) {
      if (isPulling.current) {
        isPulling.current = false
        setPullDistance(0)
      }
      return
    }

    // Check we're at scroll top
    const scrollTop = window.scrollY || document.documentElement.scrollTop
    if (scrollTop > 5) return

    isPulling.current = true
    const distance = Math.min(deltaY * RESISTANCE, MAX_PULL)
    setPullDistance(distance)

    // Prevent default scroll when pulling
    if (distance > 10) {
      e.preventDefault()
    }
  }, [disabled, refreshing])

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current || disabled) {
      touchStartY.current = 0
      setPullDistance(0)
      return
    }

    touchStartY.current = 0
    isPulling.current = false

    if (pullDistance >= THRESHOLD) {
      setRefreshing(true)
      setPullDistance(THRESHOLD * 0.5) // settle to loading position
      try {
        await onRefresh?.()
      } finally {
        setRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }, [pullDistance, onRefresh, disabled])

  // Attach touch listeners with passive: false for preventDefault
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const opts = { passive: false }
    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, opts)
    el.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  const isActive = pullDistance > 0 || refreshing
  const progress = Math.min(pullDistance / THRESHOLD, 1)
  const canRelease = pullDistance >= THRESHOLD

  return (
    <div ref={containerRef} className="relative">
      {/* Pull indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200 ease-out"
        style={{
          height: isActive ? `${pullDistance}px` : 0,
          transition: isPulling.current ? 'none' : undefined,
        }}
      >
        <div
          className={`flex items-center justify-center w-10 h-10 rounded-full border transition-all duration-200 ${
            canRelease || refreshing
              ? 'border-red-500 bg-red-500/10 text-red-400'
              : 'border-zinc-700 bg-zinc-900 text-zinc-400'
          }`}
          style={{
            transform: refreshing ? undefined : `rotate(${progress * 360}deg)`,
            opacity: Math.max(progress, refreshing ? 1 : 0),
          }}
        >
          <RefreshCw
            className={`w-5 h-5 ${refreshing ? 'animate-ptr-spin' : ''}`}
          />
        </div>
      </div>

      {/* Release hint text */}
      {isActive && !refreshing && (
        <div className="absolute top-1 left-0 right-0 flex justify-center pointer-events-none">
          <span
            className="text-xs text-zinc-500 transition-opacity duration-200"
            style={{ opacity: progress > 0.3 ? 1 : 0 }}
          >
            {canRelease ? 'Release to refresh' : 'Pull to refresh'}
          </span>
        </div>
      )}

      {children}
    </div>
  )
}
