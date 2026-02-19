import { useState, useEffect, useRef, useCallback } from 'react'
import { Heart, MessageCircle, Share2, Play, Pause, Volume2, VolumeX, ChevronUp, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { resolvePostMediaUrls } from '../../lib/storage'
import { useAuthStore } from '../../stores/authStore'
import Avatar from '../../components/ui/Avatar'
import { PageLoader } from '../../components/ui/Spinner'
import { cn, formatNumber } from '../../lib/utils'

function ReelCard({ reel, isActive, userLikes }) {
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  // Initialize liked state from existing user likes
  const [liked, setLiked] = useState(userLikes?.has(reel.id) || false)
  const [likeCount, setLikeCount] = useState(reel.like_count || 0)
  const { user } = useAuthStore()

  useEffect(() => {
    if (!videoRef.current) return
    if (isActive) {
      videoRef.current.play().catch(() => {})
      setPlaying(true)
    } else {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
      setPlaying(false)
    }
  }, [isActive])

  const togglePlay = () => {
    if (!videoRef.current) return
    if (playing) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
    }
    setPlaying(!playing)
  }

  const handleLike = async () => {
    if (!user) return
    setLiked(!liked)
    setLikeCount(c => liked ? c - 1 : c + 1)
    try {
      if (liked) {
        await supabase.from('likes').delete().match({ post_id: reel.id, user_id: user.id })
      } else {
        await supabase.from('likes').insert({ post_id: reel.id, user_id: user.id })
      }
    } catch { /* revert silently */ }
  }

  const mediaUrl = reel.media?.[0]?.signedUrl || reel.media?.[0]?.url || ''

  return (
    <div className="relative w-full h-full bg-black snap-start snap-always flex items-center justify-center">
      {mediaUrl ? (
        <video
          ref={videoRef}
          src={mediaUrl}
          className="w-full h-full object-cover"
          loop
          muted={muted}
          playsInline
          onClick={togglePlay}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-zinc-900 to-zinc-800 flex items-center justify-center">
          <p className="text-zinc-600 text-sm">No video available</p>
        </div>
      )}

      {/* Play/Pause overlay */}
      {!playing && mediaUrl && (
        <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center cursor-pointer">
          <div className="p-4 rounded-full bg-black/30 backdrop-blur-sm">
            <Play size={32} className="text-white fill-white" />
          </div>
        </button>
      )}

      {/* Mute toggle */}
      <button
        onClick={() => setMuted(!muted)}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/30 backdrop-blur-sm cursor-pointer"
      >
        {muted ? <VolumeX size={18} className="text-white" /> : <Volume2 size={18} className="text-white" />}
      </button>

      {/* Bottom Info */}
      <div className="absolute bottom-0 left-0 right-16 p-4 bg-gradient-to-t from-black/60 to-transparent">
        <div className="flex items-center gap-2 mb-2">
          <Avatar src={reel.author?.avatar_url} alt={reel.author?.display_name} size="sm" />
          <span className="text-sm font-semibold text-white">{reel.author?.display_name}</span>
          <span className="text-xs text-zinc-400">@{reel.author?.username}</span>
        </div>
        {reel.content && (
          <p className="text-sm text-white/90 line-clamp-2">{reel.content}</p>
        )}
      </div>

      {/* Side Actions */}
      <div className="absolute right-3 bottom-20 flex flex-col items-center gap-5">
        <button onClick={handleLike} className="flex flex-col items-center gap-1 cursor-pointer">
          <div className={cn('p-2 rounded-full', liked ? 'bg-red-500/20' : 'bg-black/30 backdrop-blur-sm')}>
            <Heart size={22} className={cn(liked ? 'text-red-500 fill-red-500' : 'text-white')} />
          </div>
          <span className="text-xs text-white font-medium">{formatNumber(likeCount)}</span>
        </button>

        <button className="flex flex-col items-center gap-1 cursor-pointer">
          <div className="p-2 rounded-full bg-black/30 backdrop-blur-sm">
            <MessageCircle size={22} className="text-white" />
          </div>
          <span className="text-xs text-white font-medium">{formatNumber(reel.comment_count || 0)}</span>
        </button>

        <button
          onClick={() => {
            if (navigator.share) {
              navigator.share({ title: reel.content || 'Check this out', url: `/post/${reel.id}` }).catch(() => {})
            } else {
              navigator.clipboard?.writeText(`${window.location.origin}/post/${reel.id}`)
            }
          }}
          className="flex flex-col items-center gap-1 cursor-pointer"
        >
          <div className="p-2 rounded-full bg-black/30 backdrop-blur-sm">
            <Share2 size={22} className="text-white" />
          </div>
          <span className="text-xs text-white font-medium">Share</span>
        </button>
      </div>
    </div>
  )
}

export default function ReelsPage() {
  const [reels, setReels] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [userLikes, setUserLikes] = useState(new Set())
  const containerRef = useRef(null)
  const { user } = useAuthStore()

  useEffect(() => {
    fetchReels()
  }, [])

  const fetchReels = async () => {
    try {
      const { data } = await supabase
        .from('posts')
        .select('*, author:profiles!author_id(id, username, display_name, avatar_url, is_verified), media(*), likes(user_id, reaction_type)')
        .order('created_at', { ascending: false })
        .limit(50)

      // Filter to posts that actually have video media
      const videoReels = (data || []).filter(p =>
        p.media?.some(m => m.media_type === 'video')
      )

      // Resolve storage paths to signed URLs
      await resolvePostMediaUrls(videoReels)

      // Initialize user's like state from fetched data
      if (user) {
        const likedSet = new Set()
        videoReels.forEach(reel => {
          if (reel.likes?.some(l => l.user_id === user.id)) {
            likedSet.add(reel.id)
          }
        })
        setUserLikes(likedSet)
      }

      setReels(videoReels)
    } catch (err) {
      console.error('Failed to fetch reels:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const scrollTop = container.scrollTop
    const height = container.clientHeight
    const newIndex = Math.round(scrollTop / height)
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex)
    }
  }, [activeIndex])

  const scrollTo = (direction) => {
    if (!containerRef.current) return
    const nextIndex = direction === 'up'
      ? Math.max(0, activeIndex - 1)
      : Math.min(reels.length - 1, activeIndex + 1)
    containerRef.current.scrollTo({
      top: nextIndex * containerRef.current.clientHeight,
      behavior: 'smooth',
    })
  }

  if (loading) return <PageLoader />

  if (!reels.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh] gap-4 px-6 text-center">
        <div className="p-4 rounded-full bg-indigo-500/10">
          <Play size={32} className="text-indigo-400" />
        </div>
        <h2 className="text-xl font-bold">No Reels Yet</h2>
        <p className="text-zinc-500 text-sm max-w-sm">
          Video reels from creators you follow will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="relative h-[100dvh] bg-black">
      {/* Scroll container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar"
      >
        {reels.map((reel, i) => (
          <div key={reel.id} className="h-[100dvh] w-full">
            <ReelCard reel={reel} isActive={i === activeIndex} userLikes={userLikes} />
          </div>
        ))}
      </div>

      {/* Navigation arrows (desktop) */}
      <div className="hidden md:flex absolute right-8 top-1/2 -translate-y-1/2 flex-col gap-2">
        <button
          onClick={() => scrollTo('up')}
          disabled={activeIndex === 0}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors cursor-pointer"
        >
          <ChevronUp size={20} className="text-white" />
        </button>
        <button
          onClick={() => scrollTo('down')}
          disabled={activeIndex === reels.length - 1}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 transition-colors cursor-pointer"
        >
          <ChevronDown size={20} className="text-white" />
        </button>
      </div>
    </div>
  )
}
