import { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import ProtectedImage from './ProtectedImage'

export default function ImageModal({ images, initialIndex = 0, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') handlePrev()
      if (e.key === 'ArrowRight') handleNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [currentIndex])

  const handlePrev = (e) => {
    e?.stopPropagation()
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1))
  }

  const handleNext = (e) => {
    e?.stopPropagation()
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0))
  }

  if (!images || images.length === 0) return null

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <button 
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
      >
        <X size={24} />
      </button>

      {images.length > 1 && (
        <>
          <button 
            onClick={handlePrev}
            className="absolute left-4 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors z-10"
          >
            <ChevronLeft size={28} />
          </button>
          <button 
            onClick={handleNext}
            className="absolute right-4 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors z-10"
          >
            <ChevronRight size={28} />
          </button>
        </>
      )}

      <div className="relative w-full h-full flex items-center justify-center p-4 md:p-12">
        <ProtectedImage
          src={images[currentIndex]?.signedUrl || images[currentIndex]?.url}
          alt=""
          className="max-w-full max-h-full object-contain"
          containerClassName="max-w-full max-h-full flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {images.map((_, i) => (
            <div 
              key={i} 
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                i === currentIndex ? "bg-white scale-125" : "bg-white/30"
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
