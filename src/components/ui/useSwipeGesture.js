import { useRef, useCallback, useEffect } from 'react'

const SWIPE_THRESHOLD = 50     // min px to register a swipe
const VELOCITY_THRESHOLD = 0.3  // min px/ms for fast swipes
const MAX_VERTICAL = 75         // max vertical movement before abort

/**
 * Custom hook for detecting horizontal swipe gestures on touch devices.
 *
 * @param {Object} options
 * @param {Function} options.onSwipeLeft  - called on swipe left
 * @param {Function} options.onSwipeRight - called on swipe right
 * @param {boolean}  options.disabled     - disable gesture detection
 * @param {React.RefObject} options.ref   - optional ref to attach to (defaults to document)
 * @returns {React.RefObject} containerRef - attach to the swipeable container
 */
export default function useSwipeGesture({ onSwipeLeft, onSwipeRight, disabled = false } = {}) {
  const containerRef = useRef(null)
  const touchState = useRef({
    startX: 0,
    startY: 0,
    startTime: 0,
    tracking: false,
  })

  const handleTouchStart = useCallback((e) => {
    if (disabled) return
    const touch = e.touches[0]
    touchState.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      tracking: true,
    }
  }, [disabled])

  const handleTouchEnd = useCallback((e) => {
    if (disabled || !touchState.current.tracking) return
    touchState.current.tracking = false

    const touch = e.changedTouches[0]
    const { startX, startY, startTime } = touchState.current
    const deltaX = touch.clientX - startX
    const deltaY = Math.abs(touch.clientY - startY)
    const deltaTime = Date.now() - startTime
    const velocity = Math.abs(deltaX) / deltaTime

    // Abort if vertical movement too large (scrolling, not swiping)
    if (deltaY > MAX_VERTICAL) return

    // Check threshold OR velocity
    const isSwipe = Math.abs(deltaX) >= SWIPE_THRESHOLD || velocity >= VELOCITY_THRESHOLD

    if (!isSwipe) return

    if (deltaX < 0) {
      onSwipeLeft?.()
    } else {
      onSwipeRight?.()
    }
  }, [disabled, onSwipeLeft, onSwipeRight])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchEnd])

  return containerRef
}
