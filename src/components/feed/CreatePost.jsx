import { useState, useRef } from 'react'
import {
  Image, Video, Lock, Globe, Users, X, DollarSign,
  Grid3x3, Film, FileText, Eye, EyeOff
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { usePostStore } from '../../stores/postStore'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { MAX_POST_LENGTH, VISIBILITY_OPTIONS, MAX_MEDIA_PER_POST } from '../../lib/constants'

const visibilityIcons = { public: Globe, followers_only: Users, subscribers_only: Lock }

const POST_TYPES = [
  { key: 'post', label: 'Post', icon: FileText, description: 'Text & media post' },
  { key: 'set', label: 'Set', icon: Grid3x3, description: 'Photo set with previews' },
  { key: 'video', label: 'Video', icon: Film, description: 'Video content' },
]

export default function CreatePost({ onSuccess }) {
  const { profile, user } = useAuthStore()
  const { createPost } = usePostStore()
  const [content, setContent] = useState('')
  const [postType, setPostType] = useState('post')
  const [visibility, setVisibility] = useState('public')
  const [mediaFiles, setMediaFiles] = useState([])
  const [mediaPreviews, setMediaPreviews] = useState([])
  const [previewIndices, setPreviewIndices] = useState(new Set([0])) // which images are unblurred previews
  const [price, setPrice] = useState('')
  const [loading, setLoading] = useState(false)
  const [showVisibility, setShowVisibility] = useState(false)
  const fileRef = useRef(null)
  const textRef = useRef(null)

  if (!profile || !profile.is_creator) return null

  const handlePostTypeChange = (type) => {
    setPostType(type)
    // Auto-set visibility for sets and videos
    if (type === 'set' || type === 'video') {
      setVisibility('subscribers_only')
    }
    // Reset media when switching types
    mediaPreviews.forEach(p => URL.revokeObjectURL(p.url))
    setMediaFiles([])
    setMediaPreviews([])
    setPreviewIndices(new Set([0]))
    setPrice('')
  }

  const handleMedia = (e) => {
    const files = Array.from(e.target.files || [])

    if (postType === 'video') {
      // Video type: only allow 1 video
      const videoFile = files.find(f => f.type.startsWith('video/'))
      if (!videoFile) {
        toast.error('Please select a video file')
        return
      }
      mediaPreviews.forEach(p => URL.revokeObjectURL(p.url))
      const url = URL.createObjectURL(videoFile)
      setMediaFiles([videoFile])
      setMediaPreviews([{ url, type: 'video' }])
      return
    }

    if (postType === 'set') {
      // Set type: only images
      const imageFiles = files.filter(f => f.type.startsWith('image/'))
      if (imageFiles.length === 0) {
        toast.error('Sets only support images')
        return
      }
      if (mediaFiles.length + imageFiles.length > MAX_MEDIA_PER_POST) {
        toast.error(`Maximum ${MAX_MEDIA_PER_POST} images per set`)
        return
      }
      setMediaFiles(prev => [...prev, ...imageFiles])
      imageFiles.forEach(file => {
        const url = URL.createObjectURL(file)
        setMediaPreviews(prev => [...prev, { url, type: 'image' }])
      })
      return
    }

    // Regular post: any media
    if (mediaFiles.length + files.length > MAX_MEDIA_PER_POST) {
      toast.error(`Maximum ${MAX_MEDIA_PER_POST} files per post`)
      return
    }

    const validFiles = files.filter(f =>
      f.type.startsWith('image/') || f.type.startsWith('video/')
    )

    setMediaFiles(prev => [...prev, ...validFiles])
    validFiles.forEach(file => {
      const url = URL.createObjectURL(file)
      setMediaPreviews(prev => [...prev, { url, type: file.type.startsWith('video') ? 'video' : 'image' }])
    })
  }

  const removeMedia = (index) => {
    URL.revokeObjectURL(mediaPreviews[index].url)
    setMediaFiles(prev => prev.filter((_, i) => i !== index))
    setMediaPreviews(prev => prev.filter((_, i) => i !== index))
    setPreviewIndices(prev => {
      const next = new Set()
      prev.forEach(i => {
        if (i < index) next.add(i)
        else if (i > index) next.add(i - 1)
      })
      // Ensure at least one preview
      if (next.size === 0 && mediaPreviews.length > 1) next.add(0)
      return next
    })
  }

  const togglePreview = (index) => {
    setPreviewIndices(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        if (next.size <= 1) {
          toast.error('At least 1 image must be unblurred')
          return prev
        }
        next.delete(index)
      } else {
        if (next.size >= 3) {
          toast.error('Maximum 3 preview images')
          return prev
        }
        next.add(index)
      }
      return next
    })
  }

  const handleSubmit = async () => {
    if (postType === 'set' && mediaFiles.length < 3) {
      toast.error('Sets need at least 3 images')
      return
    }
    if (postType === 'video' && mediaFiles.length === 0) {
      toast.error('Please add a video')
      return
    }
    if (!content.trim() && mediaFiles.length === 0) return

    setLoading(true)

    try {
      const parsedPrice = price ? parseFloat(price) : null

      await createPost({
        content: content.trim(),
        visibility,
        postType,
        mediaFiles,
        userId: user.id,
        price: parsedPrice && parsedPrice > 0 ? parsedPrice : null,
        previewIndices: postType === 'set' ? Array.from(previewIndices) : null,
      })

      setContent('')
      setMediaFiles([])
      setMediaPreviews([])
      setPreviewIndices(new Set([0]))
      setPrice('')
      setPostType('post')
      toast.success(
        postType === 'set' ? 'Set published!' :
        postType === 'video' ? 'Video published!' :
        'Post created!'
      )
      onSuccess?.()
    } catch (err) {
      toast.error(err.message || 'Failed to create post')
    } finally {
      setLoading(false)
    }
  }

  const VisIcon = visibilityIcons[visibility]
  const charsLeft = MAX_POST_LENGTH - content.length
  const canPost = postType === 'post'
    ? (content.trim() || mediaFiles.length > 0) && charsLeft >= 0
    : postType === 'set'
    ? mediaFiles.length >= 3
    : mediaFiles.length > 0

  const fileAccept = postType === 'video' ? 'video/*' : postType === 'set' ? 'image/*' : 'image/*,video/*'

  return (
    <div className="p-5 border-b border-zinc-800/50">
      {/* Post Type Selector */}
      <div className="flex gap-1 mb-4 bg-zinc-900/50 rounded-xl p-1">
        {POST_TYPES.map(pt => (
          <button
            key={pt.key}
            onClick={() => handlePostTypeChange(pt.key)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all cursor-pointer',
              postType === pt.key
                ? 'bg-indigo-600 text-white shadow-lg'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            )}
          >
            <pt.icon size={16} />
            {pt.label}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        <Avatar src={profile.avatar_url} alt={profile.display_name} size="lg" />
        <div className="flex-1 min-w-0">
          <textarea
            ref={textRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              postType === 'set' ? 'Describe this set...' :
              postType === 'video' ? 'Describe this video...' :
              "What's on your mind?"
            }
            rows={postType === 'post' ? 3 : 2}
            maxLength={MAX_POST_LENGTH}
            className="w-full bg-transparent text-lg text-zinc-200 placeholder:text-zinc-600 outline-none resize-none py-2 leading-relaxed"
          />

          {/* Set: Media Preview Grid with Preview Toggle */}
          {postType === 'set' && mediaPreviews.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1.5">
                <Eye size={12} />
                Click images to toggle preview (unblurred). {previewIndices.size}/3 previews selected.
              </p>
              <div className="grid grid-cols-3 gap-2 mt-2 rounded-2xl overflow-hidden">
                {mediaPreviews.map((preview, i) => {
                  const isPreview = previewIndices.has(i)
                  return (
                    <div
                      key={i}
                      className={cn(
                        'relative aspect-square group cursor-pointer rounded-lg overflow-hidden border-2 transition-all',
                        isPreview ? 'border-emerald-500' : 'border-zinc-700'
                      )}
                      onClick={() => togglePreview(i)}
                    >
                      <img
                        src={preview.url}
                        alt=""
                        className={cn(
                          'w-full h-full object-cover transition-all',
                          !isPreview && 'blur-lg brightness-50'
                        )}
                      />
                      <div className={cn(
                        'absolute inset-0 flex items-center justify-center transition-all',
                        isPreview ? 'bg-emerald-500/10' : 'bg-black/40'
                      )}>
                        {isPreview ? (
                          <Eye size={20} className="text-emerald-400" />
                        ) : (
                          <EyeOff size={20} className="text-zinc-400" />
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeMedia(i) }}
                        className="absolute top-1 right-1 p-1 bg-black/70 rounded-full hover:bg-black transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X size={12} className="text-white" />
                      </button>
                      {isPreview && (
                        <span className="absolute bottom-1 left-1 text-[10px] bg-emerald-500/90 text-white px-1.5 py-0.5 rounded-md font-bold">
                          PREVIEW
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Video: Single Video Preview */}
          {postType === 'video' && mediaPreviews.length > 0 && (
            <div className="mt-3 relative rounded-2xl overflow-hidden border border-zinc-800/50">
              <video
                src={mediaPreviews[0].url}
                className="w-full max-h-80 object-contain bg-black rounded-2xl"
                controls
                preload="metadata"
              />
              <button
                onClick={() => removeMedia(0)}
                className="absolute top-2 right-2 p-1.5 bg-black/70 rounded-full hover:bg-black transition-colors"
              >
                <X size={14} className="text-white" />
              </button>
            </div>
          )}

          {/* Regular Post: Media Preview */}
          {postType === 'post' && mediaPreviews.length > 0 && (
            <div className={cn(
              'grid gap-2 mt-3 rounded-2xl overflow-hidden',
              mediaPreviews.length === 1 && 'grid-cols-1',
              mediaPreviews.length === 2 && 'grid-cols-2',
              mediaPreviews.length >= 3 && 'grid-cols-2 grid-rows-2'
            )}>
              {mediaPreviews.map((preview, i) => (
                <div key={i} className="relative aspect-square group">
                  {preview.type === 'video' ? (
                    <video src={preview.url} className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <img src={preview.url} alt="" className="w-full h-full object-cover rounded-lg" />
                  )}
                  <button
                    onClick={() => removeMedia(i)}
                    className="absolute top-2 right-2 p-1.5 bg-black/70 rounded-full hover:bg-black transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X size={14} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* PPV Price (for sets and videos) */}
          {(postType === 'set' || postType === 'video') && (
            <div className="mt-3 flex items-center gap-3 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
              <DollarSign size={16} className="text-amber-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-zinc-400 mb-1">Pay-per-view price (optional)</p>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Free for subscribers"
                  min="0"
                  step="0.01"
                  className="w-full bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
                />
              </div>
              {price && parseFloat(price) > 0 && (
                <span className="text-xs text-amber-400 font-bold">${parseFloat(price).toFixed(2)}</span>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-800/50">
            <div className="flex items-center gap-1">
              <input
                ref={fileRef}
                type="file"
                multiple={postType !== 'video'}
                accept={fileAccept}
                className="hidden"
                onChange={handleMedia}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="p-2.5 rounded-xl text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer"
                title={postType === 'video' ? 'Select video' : 'Add media'}
              >
                {postType === 'video' ? <Video size={20} /> : <Image size={20} />}
              </button>

              {postType === 'post' && (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="p-2.5 rounded-xl text-indigo-400 hover:bg-indigo-500/10 transition-colors cursor-pointer"
                  title="Add video"
                >
                  <Video size={20} />
                </button>
              )}

              <div className="relative">
                <button
                  onClick={() => setShowVisibility(!showVisibility)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                >
                  <VisIcon size={14} />
                  <span className="hidden sm:inline">{VISIBILITY_OPTIONS.find(v => v.value === visibility)?.label}</span>
                </button>
                {showVisibility && (
                  <div className="absolute bottom-full left-0 mb-2 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl py-1 z-10 min-w-[200px]">
                    {VISIBILITY_OPTIONS.map(opt => {
                      const OptIcon = visibilityIcons[opt.value]
                      return (
                        <button
                          key={opt.value}
                          onClick={() => { setVisibility(opt.value); setShowVisibility(false) }}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors cursor-pointer',
                            visibility === opt.value ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-300 hover:bg-zinc-800'
                          )}
                        >
                          <OptIcon size={16} />
                          <div className="text-left">
                            <p className="font-medium">{opt.label}</p>
                            <p className="text-xs text-zinc-500">{opt.description}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {content.length > 0 && (
                <span className={cn('text-xs font-medium', charsLeft < 50 ? 'text-amber-400' : 'text-zinc-600')}>
                  {charsLeft}
                </span>
              )}
              <Button
                onClick={handleSubmit}
                disabled={!canPost}
                loading={loading}
                size="sm"
                className="px-5"
              >
                {postType === 'set' ? 'Publish Set' : postType === 'video' ? 'Publish Video' : 'Post'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
