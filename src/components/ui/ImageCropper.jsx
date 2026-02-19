import { useState, useRef } from 'react'
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { X, Check, RotateCcw } from 'lucide-react'
import Button from './Button'

function centerAspectCrop(mediaWidth, mediaHeight, aspect) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  )
}

export default function ImageCropper({ imageUrl, onCropComplete, onCancel, aspect = 1 }) {
  const [crop, setCrop] = useState()
  const [completedCrop, setCompletedCrop] = useState()
  const imgRef = useRef(null)

  function onImageLoad(e) {
    if (aspect) {
      const { width, height } = e.currentTarget
      setCrop(centerAspectCrop(width, height, aspect))
    }
  }

  const handleSave = async () => {
    if (!completedCrop || !imgRef.current) {
      onCancel()
      return
    }

    const image = imgRef.current
    const canvas = document.createElement('canvas')
    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height
    
    canvas.width = completedCrop.width * scaleX
    canvas.height = completedCrop.height * scaleY
    
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('No 2d context')
    }

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY
    )

    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('Canvas is empty')
        return
      }
      const croppedUrl = URL.createObjectURL(blob)
      // Create a new File object from the blob
      const file = new File([blob], 'cropped-image.jpg', { type: 'image/jpeg' })
      onCropComplete(croppedUrl, file)
    }, 'image/jpeg', 0.95)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 rounded-2xl overflow-hidden max-w-3xl w-full max-h-[90vh] flex flex-col border border-zinc-800">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="text-lg font-bold text-white">Crop Image</h3>
          <button onClick={onCancel} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-black/50 min-h-[300px]">
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={aspect}
            className="max-h-[60vh]"
          >
            <img
              ref={imgRef}
              alt="Crop me"
              src={imageUrl}
              onLoad={onImageLoad}
              className="max-h-[60vh] object-contain"
            />
          </ReactCrop>
        </div>

        <div className="p-4 border-t border-zinc-800 flex items-center justify-between bg-zinc-900">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCrop(undefined)}>
              <RotateCcw size={16} className="mr-1.5" />
              Reset
            </Button>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button onClick={handleSave}>
              <Check size={16} className="mr-1.5" />
              Apply Crop
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
