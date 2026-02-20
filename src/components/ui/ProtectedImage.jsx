import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { cn } from '../../lib/utils'

/**
 * ProtectedImage — wraps images with content protection:
 * - Tiled watermark overlay (viewer's @username)
 * - Right-click prevention
 * - Drag prevention
 * - Touch callout prevention (iOS)
 * - PrintScreen / DevTools blackout
 * - Window blur detection (blurs image when tab loses focus)
 */
export default function ProtectedImage({ 
  src, 
  alt = '', 
  className, 
  containerClassName,
  watermark = true,
  loading = 'lazy',
  onClick,
  style,
}) {
  const { user, profile } = useAuthStore()
  const [isFocused, setIsFocused] = useState(true)
  const [isBlackedOut, setIsBlackedOut] = useState(false)

  const watermarkText = profile?.username ? `@${profile.username}` : user?.id?.slice(0, 8) || ''

  useEffect(() => {
    const handleBlur = () => setIsFocused(false)
    const handleFocus = () => setIsFocused(true)

    const handleKeyDown = (e) => {
      if (
        e.key === 'PrintScreen' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.metaKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        e.key === 'F12'
      ) {
        setIsBlackedOut(true)
        setTimeout(() => setIsBlackedOut(false), 3000)
      }
    }

    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const handleContextMenu = useCallback((e) => {
    e.preventDefault()
    return false
  }, [])

  const handleDragStart = useCallback((e) => {
    e.preventDefault()
    return false
  }, [])

  return (
    <div 
      className={cn('relative overflow-hidden select-none', containerClassName)}
      onContextMenu={handleContextMenu}
      onDragStart={handleDragStart}
      style={{ WebkitTouchCallout: 'none' }}
    >
      <img
        src={src}
        alt={alt}
        className={cn(
          'transition-all duration-200',
          (!isFocused || isBlackedOut) && 'blur-2xl brightness-0',
          className
        )}
        loading={loading}
        draggable={false}
        onClick={onClick}
        style={{ ...style, WebkitUserDrag: 'none' }}
      />

      {/* Tiled Watermark */}
      {watermark && watermarkText && isFocused && !isBlackedOut && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-10 opacity-[0.04] flex flex-wrap gap-6 justify-center items-center rotate-[-25deg] scale-150">
          {Array.from({ length: 30 }).map((_, i) => (
            <span key={i} className="text-white font-bold text-sm whitespace-nowrap">
              {watermarkText}
            </span>
          ))}
        </div>
      )}

      {/* Blackout overlay */}
      {isBlackedOut && (
        <div className="absolute inset-0 bg-black z-20 flex items-center justify-center">
          <p className="text-zinc-600 text-xs font-medium">Content protected</p>
        </div>
      )}
    </div>
  )
}
