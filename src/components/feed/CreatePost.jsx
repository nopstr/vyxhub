import { useState, useRef } from 'react'
import {
  Image, Video, Lock, Globe, Users, X, DollarSign,
  Grid3x3, Film, FileText, Eye, EyeOff, Calendar, Clock, Tag, AlertTriangle, BarChart2, Save, GripVertical, Crop
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAuthStore } from '../../stores/authStore'
import { usePostStore } from '../../stores/postStore'
import { supabase } from '../../lib/supabase'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import ImageCropper from '../ui/ImageCropper'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { MAX_POST_LENGTH, VISIBILITY_OPTIONS, MAX_MEDIA_PER_POST } from '../../lib/constants'

const visibilityIcons = { public: Globe, followers_only: Users, subscribers_only: Lock }

const POST_TYPES = [
  { key: 'post', label: 'Post', icon: FileText, description: 'Text & media post' },
  { key: 'set', label: 'Set', icon: Grid3x3, description: 'Photo set with previews' },
  { key: 'video', label: 'Video', icon: Film, description: 'Video content' },
]

// A2: Content categories
const CATEGORIES = [
  'Photos', 'Videos', 'Fitness', 'Cosplay', 'Lifestyle', 'Artistic', 'Gaming', 'Fashion', 'Other'
]

function SortableMediaItem({ id, preview, index, isPreview, togglePreview, removeMedia, postType, onCrop }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative aspect-square group rounded-lg overflow-hidden border-2 transition-all',
        postType === 'set' && isPreview ? 'border-emerald-500' : 'border-zinc-700',
        postType === 'set' ? 'cursor-pointer' : ''
      )}
      onClick={() => postType === 'set' && togglePreview(index)}
    >
      {preview.type === 'video' ? (
        <video src={preview.url} className="w-full h-full object-cover" />
      ) : (
        <img
          src={preview.url}
          alt=""
          className={cn(
            'w-full h-full object-cover transition-all',
            postType === 'set' && !isPreview && 'blur-lg brightness-50'
          )}
        />
      )}
      
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-1 left-1 p-1 bg-black/50 rounded-md cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={14} className="text-white" />
      </div>

      {postType === 'set' && (
        <div className={cn(
          'absolute inset-0 flex items-center justify-center transition-all pointer-events-none',
          isPreview ? 'bg-emerald-500/10' : 'bg-black/40'
        )}>
          {isPreview ? (
            <Eye size={20} className="text-emerald-400" />
          ) : (
            <EyeOff size={20} className="text-zinc-400" />
          )}
        </div>
      )}
      
      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {preview.type === 'image' && (
          <button
            onClick={(e) => { e.stopPropagation(); onCrop(index) }}
            className="p-1 bg-black/70 rounded-full hover:bg-black transition-colors"
            title="Crop image"
          >
            <Crop size={12} className="text-white" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); removeMedia(index) }}
          className="p-1 bg-black/70 rounded-full hover:bg-black transition-colors"
          title="Remove media"
        >
          <X size={12} className="text-white" />
        </button>
      </div>

      {postType === 'set' && isPreview && (
        <span className="absolute bottom-1 left-1 text-[10px] bg-emerald-500/90 text-white px-1.5 py-0.5 rounded-md font-bold">
          PREVIEW
        </span>
      )}
    </div>
  )
}

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
  const [scheduling, setScheduling] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [category, setCategory] = useState('')
  const [showPoll, setShowPoll] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [pollDuration, setPollDuration] = useState(1)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [cropIndex, setCropIndex] = useState(null)
  const fileRef = useRef(null)
  const textRef = useRef(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement required before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

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
      setMediaPreviews([{ id: `media-${Date.now()}-${Math.random()}`, url, type: 'video' }])
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
        setMediaPreviews(prev => [...prev, { id: `media-${Date.now()}-${Math.random()}`, url, type: 'image' }])
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
      // Add a unique ID for dnd-kit
      setMediaPreviews(prev => [...prev, { id: `media-${Date.now()}-${Math.random()}`, url, type: file.type.startsWith('video') ? 'video' : 'image' }])
    })
  }

  const handleDragEnd = (event) => {
    const { active, over } = event

    if (active.id !== over.id) {
      setMediaPreviews((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id)
        const newIndex = items.findIndex(item => item.id === over.id)
        
        // Also reorder the actual files array to match
        setMediaFiles((files) => {
          const newFiles = [...files]
          const [movedFile] = newFiles.splice(oldIndex, 1)
          newFiles.splice(newIndex, 0, movedFile)
          return newFiles
        })

        // Update preview indices if needed (for sets)
        if (postType === 'set') {
          setPreviewIndices(prev => {
            const next = new Set()
            prev.forEach(i => {
              if (i === oldIndex) next.add(newIndex)
              else if (oldIndex < newIndex && i > oldIndex && i <= newIndex) next.add(i - 1)
              else if (oldIndex > newIndex && i >= newIndex && i < oldIndex) next.add(i + 1)
              else next.add(i)
            })
            return next
          })
        }

        return arrayMove(items, oldIndex, newIndex)
      })
    }
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

  const handleCropComplete = (croppedUrl, file) => {
    if (cropIndex === null) return

    setMediaPreviews(prev => {
      const next = [...prev]
      // Revoke old URL to prevent memory leaks
      URL.revokeObjectURL(next[cropIndex].url)
      next[cropIndex] = { ...next[cropIndex], url: croppedUrl }
      return next
    })

    setMediaFiles(prev => {
      const next = [...prev]
      next[cropIndex] = file
      return next
    })

    setCropIndex(null)
  }

  const handleSubmit = async (isDraft = false) => {
    if (postType === 'set' && mediaFiles.length < 3 && !isDraft) {
      toast.error('Sets need at least 3 images')
      return
    }
    if (postType === 'video' && mediaFiles.length === 0 && !isDraft) {
      toast.error('Please add a video')
      return
    }
    if (!content.trim() && mediaFiles.length === 0) return

    // Validate schedule
    if (scheduling && !isDraft) {
      if (!scheduleDate || !scheduleTime) {
        toast.error('Set date and time for scheduled post')
        return
      }
      const scheduledFor = new Date(`${scheduleDate}T${scheduleTime}`)
      if (scheduledFor <= new Date()) {
        toast.error('Schedule must be in the future')
        return
      }
    }

    // Validate poll
    if (showPoll && !isDraft) {
      if (!pollQuestion.trim()) {
        toast.error('Poll question is required')
        return
      }
      const validOptions = pollOptions.filter(opt => opt.trim())
      if (validOptions.length < 2) {
        toast.error('Poll needs at least 2 options')
        return
      }
    }

    setLoading(true)

    try {
      const parsedPrice = price ? parseFloat(price) : null

      if (scheduling && scheduleDate && scheduleTime && !isDraft) {
        const scheduledFor = new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
        await usePostStore.getState().createScheduledPost({
          content: content.trim(),
          visibility,
          postType,
          mediaFiles,
          userId: user.id,
          price: parsedPrice && parsedPrice > 0 ? parsedPrice : 0,
          previewIndices: postType === 'set' ? Array.from(previewIndices) : null,
          scheduledFor,
          onProgress: (progress) => setUploadProgress(progress)
        })
        toast.success(`Post scheduled for ${scheduleDate} ${scheduleTime}`)
      } else {
        const pollData = showPoll ? {
          question: pollQuestion.trim(),
          options: pollOptions.filter(opt => opt.trim()),
          durationDays: pollDuration
        } : null

        await createPost({
          content: content.trim(),
          visibility,
          postType,
          mediaFiles,
          userId: user.id,
          price: parsedPrice && parsedPrice > 0 ? parsedPrice : null,
          previewIndices: postType === 'set' ? Array.from(previewIndices) : null,
          category: category || null,
          isDraft,
          pollData,
          language: profile?.preferred_language || navigator.language?.split('-')[0] || 'en',
          country_code: profile?.country_code || null,
          onProgress: (progress) => setUploadProgress(progress)
        })
        toast.success(
          isDraft ? 'Draft saved!' :
          postType === 'set' ? 'Set published!' :
          postType === 'video' ? 'Video published!' :
          'Post created!'
        )
      }

      setContent('')
      setMediaFiles([])
      setMediaPreviews([])
      setPreviewIndices(new Set([0]))
      setPrice('')
      setPostType('post')
      setScheduling(false)
      setScheduleDate('')
      setScheduleTime('')
      setShowPoll(false)
      setPollQuestion('')
      setPollOptions(['', ''])
      setPollDuration(1)
      setUploadProgress(0)
      onSuccess?.()
    } catch (err) {
      toast.error(err.message || 'Failed to create post')
    } finally {
      setLoading(false)
      setUploadProgress(0)
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
                ? 'bg-red-600 text-white shadow-lg'
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
                Click images to toggle preview (unblurred). Drag to reorder. {previewIndices.size}/3 previews selected.
              </p>
              <DndContext 
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext 
                  items={mediaPreviews.map(p => p.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-3 gap-2 mt-2 rounded-2xl overflow-hidden">
                    {mediaPreviews.map((preview, i) => (
                      <SortableMediaItem
                        key={preview.id}
                        id={preview.id}
                        preview={preview}
                        index={i}
                        isPreview={previewIndices.has(i)}
                        togglePreview={togglePreview}
                        removeMedia={removeMedia}
                        postType="set"
                        onCrop={setCropIndex}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
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
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext 
                items={mediaPreviews.map(p => p.id)}
                strategy={rectSortingStrategy}
              >
                <div className={cn(
                  'grid gap-2 mt-3 rounded-2xl overflow-hidden',
                  mediaPreviews.length === 1 && 'grid-cols-1',
                  mediaPreviews.length === 2 && 'grid-cols-2',
                  mediaPreviews.length >= 3 && 'grid-cols-2 grid-rows-2'
                )}>
                  {mediaPreviews.map((preview, i) => (
                    <SortableMediaItem
                      key={preview.id}
                      id={preview.id}
                      preview={preview}
                      index={i}
                      removeMedia={removeMedia}
                      postType="post"
                      onCrop={setCropIndex}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
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

          {/* Poll UI */}
          {showPoll && (
            <div className="mt-3 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-zinc-200 flex items-center gap-2">
                  <BarChart2 size={16} className="text-red-400" />
                  Create Poll
                </h4>
                <button onClick={() => setShowPoll(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X size={16} />
                </button>
              </div>
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Ask a question..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 mb-3 outline-none focus:border-red-500/50"
              />
              <div className="space-y-2 mb-3">
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const newOpts = [...pollOptions]
                        newOpts[i] = e.target.value
                        setPollOptions(newOpts)
                      }}
                      placeholder={`Option ${i + 1}`}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 outline-none focus:border-red-500/50"
                    />
                    {pollOptions.length > 2 && (
                      <button
                        onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))}
                        className="p-2 text-zinc-500 hover:text-red-400"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {pollOptions.length < 4 && (
                <button
                  onClick={() => setPollOptions([...pollOptions, ''])}
                  className="text-xs text-red-400 hover:text-red-300 font-medium mb-4"
                >
                  + Add Option
                </button>
              )}
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-400">Duration:</span>
                <select
                  value={pollDuration}
                  onChange={(e) => setPollDuration(Number(e.target.value))}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-200 outline-none"
                >
                  <option value={1}>1 Day</option>
                  <option value={3}>3 Days</option>
                  <option value={7}>7 Days</option>
                </select>
              </div>
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
                className="p-2.5 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                title={postType === 'video' ? 'Select video' : 'Add media'}
              >
                {postType === 'video' ? <Video size={20} /> : <Image size={20} />}
              </button>

              {postType === 'post' && (
                <button
                  onClick={() => setShowPoll(!showPoll)}
                  className={cn(
                    "p-2.5 rounded-xl transition-colors cursor-pointer",
                    showPoll ? "text-red-400 bg-red-500/10" : "text-zinc-400 hover:bg-zinc-800/50"
                  )}
                  title="Add poll"
                >
                  <BarChart2 size={20} />
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
                            visibility === opt.value ? 'text-red-400 bg-red-500/10' : 'text-zinc-300 hover:bg-zinc-800'
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

              {/* A2: Category selector */}
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-zinc-400 bg-transparent hover:bg-zinc-800/50 transition-colors cursor-pointer border-none outline-none appearance-none"
                style={{ backgroundImage: 'none' }}
              >
                <option value="" className="bg-zinc-900">Category</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat.toLowerCase()} className="bg-zinc-900">{cat}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              {/* Schedule toggle */}
              <button
                onClick={() => setScheduling(!scheduling)}
                className={cn(
                  'p-2 rounded-xl transition-colors cursor-pointer',
                  scheduling ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                )}
                title="Schedule post"
              >
                <Calendar size={18} />
              </button>

              {content.length > 0 && (
                <span className={cn('text-xs font-medium', charsLeft < 50 ? 'text-amber-400' : 'text-zinc-600')}>
                  {charsLeft}
                </span>
              )}
              <Button
                onClick={() => handleSubmit(true)}
                disabled={(!canPost && !content.trim()) || loading}
                loading={loading}
                variant="secondary"
                size="sm"
                className="px-4"
              >
                <Save size={16} className="mr-1.5" />
                Draft
              </Button>
              <Button
                onClick={() => handleSubmit(false)}
                disabled={!canPost || loading}
                loading={loading}
                size="sm"
                className="px-5 relative overflow-hidden"
              >
                {loading && uploadProgress > 0 && (
                  <div 
                    className="absolute inset-y-0 left-0 bg-white/20 transition-all duration-300" 
                    style={{ width: `${uploadProgress}%` }} 
                  />
                )}
                <span className="relative z-10">
                  {loading && uploadProgress > 0 
                    ? `Uploading ${uploadProgress}%` 
                    : scheduling
                      ? 'Schedule'
                      : postType === 'set' ? 'Publish Set' : postType === 'video' ? 'Publish Video' : 'Post'}
                </span>
              </Button>
            </div>
          </div>

          {/* Schedule date/time picker */}
          {scheduling && (
            <div className="flex items-center gap-2 mt-2 pl-1">
              <Clock size={14} className="text-blue-400" />
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-2 py-1 text-xs text-zinc-200"
              />
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-2 py-1 text-xs text-zinc-200"
              />
            </div>
          )}
        </div>
      </div>

      {cropIndex !== null && mediaPreviews[cropIndex] && (
        <ImageCropper
          imageUrl={mediaPreviews[cropIndex].url}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropIndex(null)}
        />
      )}
    </div>
  )
}
