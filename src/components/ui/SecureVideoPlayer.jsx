import { useState, useEffect, useRef } from 'react'
import { Stream } from '@cloudflare/stream-react'
import { useAuthStore } from '../../stores/authStore'
import { cn } from '../../lib/utils'

export default function SecureVideoPlayer({ 
  cloudflareUid, 
  src, 
  className, 
  controls = true, 
  autoPlay = false, 
  muted = false, 
  loop = false,
  watermark = true,
  onTimeUpdate,
  videoRef: externalRef
}) {
  const { user, profile } = useAuthStore()
  const [isFocused, setIsFocused] = useState(true)
  const [isBlackedOut, setIsBlackedOut] = useState(false)
  const internalRef = useRef(null)
  const videoRef = externalRef || internalRef

  // Watermark text (user's username or ID to deter screen recording)
  const watermarkText = profile?.username ? `@${profile.username}` : user?.id?.slice(0, 8) || 'Guest'

  useEffect(() => {
    // Blur video when window loses focus (deters some screen recording tools)
    const handleBlur = () => setIsFocused(false)
    const handleFocus = () => setIsFocused(true)

    // Blackout video on PrintScreen or common devtools shortcuts
    const handleKeyDown = (e) => {
      if (
        e.key === 'PrintScreen' || 
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.metaKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        e.key === 'F12'
      ) {
        setIsBlackedOut(true)
        setTimeout(() => setIsBlackedOut(false), 3000) // Blackout for 3 seconds
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

  // Prevent right-click context menu
  const handleContextMenu = (e) => {
    e.preventDefault()
    return false
  }

  // Prevent drag and drop of the video element
  const handleDragStart = (e) => {
    e.preventDefault()
    return false
  }

  return (
    <div 
      className={cn("relative overflow-hidden group select-none", className)}
      onContextMenu={handleContextMenu}
      onDragStart={handleDragStart}
    >
      {/* The actual video player */}
      <div className={cn(
        "w-full h-full transition-all duration-200",
        (!isFocused || isBlackedOut) ? "blur-2xl brightness-0" : ""
      )}>
        {cloudflareUid ? (
          <Stream
            streamRef={videoRef}
            src={cloudflareUid}
            controls={controls}
            autoPlay={autoPlay}
            muted={muted}
            loop={loop}
            onTimeUpdate={onTimeUpdate}
            className="w-full h-full object-contain bg-black"
            responsive={true}
          />
        ) : (
          <video
            ref={videoRef}
            src={src}
            controls={controls}
            autoPlay={autoPlay}
            muted={muted}
            loop={loop}
            onTimeUpdate={onTimeUpdate}
            playsInline
            controlsList="nodownload nofullscreen noremoteplayback"
            disablePictureInPicture
            preload="metadata"
            className="w-full h-full object-contain bg-black"
          />
        )}
      </div>

      {/* Dynamic Watermark Overlay (Tiled) */}
      {watermark && isFocused && !isBlackedOut && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-50 opacity-[0.03] mix-blend-overlay flex flex-wrap gap-8 justify-center items-center rotate-[-20deg]">
          {Array.from({ length: 50 }).map((_, i) => (
            <span key={i} className="text-white font-bold text-xl whitespace-nowrap">
              {watermarkText}
            </span>
          ))}
        </div>
      )}

      {/* Blackout Message */}
      {isBlackedOut && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black text-white font-bold text-sm">
          Screenshots disabled
        </div>
      )}
      
      {/* Focus Lost Message */}
      {!isFocused && !isBlackedOut && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 text-white font-bold text-sm">
          Video paused. Click to resume.
        </div>
      )}
    </div>
  )
}
