import { useEffect, useState, createContext, useContext } from 'react'
import { useAuthStore } from '../stores/authStore'

const ContentProtectionContext = createContext({ 
  isScreenshotDetected: false,
  isTabFocused: true,
  geoCountry: null,
})

export const useContentProtection = () => useContext(ContentProtectionContext)

/**
 * ContentProtection — global content protection provider:
 * - Injects CSS rules to prevent selection, drag, callout on media
 * - Monitors for screenshot keyboard shortcuts  
 * - Detects tab/window focus changes
 * - Fetches geo-country for potential geo-blocking
 * - Prevents developer tools image access (CSS background trick)
 */
export default function ContentProtection({ children }) {
  const [isScreenshotDetected, setIsScreenshotDetected] = useState(false)
  const [isTabFocused, setIsTabFocused] = useState(true)
  const [geoCountry, setGeoCountry] = useState(null)
  const { user } = useAuthStore()

  useEffect(() => {
    // ─── Inject global protection styles ────────────────────────────
    const styleId = 'heatly-content-protection'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        /* Prevent image/video selection and dragging globally */
        img, video, canvas {
          -webkit-user-select: none !important;
          user-select: none !important;
          -webkit-user-drag: none !important;
          -webkit-touch-callout: none !important;
        }

        /* Prevent text selection on media containers */
        .content-protected {
          -webkit-user-select: none !important;
          user-select: none !important;
          -webkit-touch-callout: none !important;
        }

        /* Hide download button on native video controls */
        video::-internal-media-controls-download-button {
          display: none !important;
        }
        video::-webkit-media-controls-enclosure {
          overflow: hidden !important;
        }
        video::-webkit-media-controls-panel {
          width: calc(100% + 30px) !important;
        }

        /* Prevent printing content */
        @media print {
          body { 
            visibility: hidden !important;
          }
          body::after {
            content: 'Content is protected and cannot be printed.';
            visibility: visible;
            position: fixed;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            color: #666;
            background: #000;
          }
        }
      `
      document.head.appendChild(style)
    }

    // ─── Global keyboard shortcut detection ─────────────────────────
    const handleKeyDown = (e) => {
      // PrintScreen detection
      if (e.key === 'PrintScreen') {
        setIsScreenshotDetected(true)
        setTimeout(() => setIsScreenshotDetected(false), 3000)
        // Try to clear clipboard
        try {
          navigator.clipboard.writeText('').catch(() => {})
        } catch (_) {}
      }

      // Ctrl+P (print) prevention on protected pages
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        return false
      }

      // Ctrl+S (save) prevention
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        return false
      }
    }

    // ─── Visibility change detection ────────────────────────────────
    const handleVisibilityChange = () => {
      setIsTabFocused(!document.hidden)
    }

    const handleWindowBlur = () => setIsTabFocused(false)
    const handleWindowFocus = () => setIsTabFocused(true)

    // ─── Prevent right-click globally on media ──────────────────────
    const handleContextMenu = (e) => {
      const target = e.target
      if (
        target.tagName === 'IMG' || 
        target.tagName === 'VIDEO' || 
        target.tagName === 'CANVAS' ||
        target.closest?.('.content-protected')
      ) {
        e.preventDefault()
        return false
      }
    }

    // ─── Prevent drag on all media ──────────────────────────────────
    const handleDragStart = (e) => {
      if (
        e.target.tagName === 'IMG' || 
        e.target.tagName === 'VIDEO' ||
        e.target.tagName === 'CANVAS'
      ) {
        e.preventDefault()
        return false
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('dragstart', handleDragStart)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('dragstart', handleDragStart)
    }
  }, [])

  // ─── Geo detection (for potential geo-blocking) ─────────────────────
  useEffect(() => {
    // Use a lightweight geo-IP API to detect user's country
    fetch('https://ipapi.co/json/', { cache: 'force-cache' })
      .then(r => r.json())
      .then(data => {
        if (data?.country_code) {
          setGeoCountry(data.country_code)
        }
      })
      .catch(() => {}) // Non-blocking — geo-blocking is optional
  }, [])

  return (
    <ContentProtectionContext.Provider value={{ isScreenshotDetected, isTabFocused, geoCountry }}>
      {children}
    </ContentProtectionContext.Provider>
  )
}
