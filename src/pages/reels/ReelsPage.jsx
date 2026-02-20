import { useState, useEffect, useRef, useCallback } from 'react'
import { Heart, MessageCircle, Share2, Play, Pause, Volume2, VolumeX, ChevronUp, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { resolvePostMediaUrls } from '../../lib/storage'
import { useAuthStore } from '../../stores/authStore'
import Avatar from '../../components/ui/Avatar'
import { PageLoader } from '../../components/ui/Spinner'
import { cn, formatNumber } from '../../lib/utils'
import SecureVideoPlayer from '../../components/ui/SecureVideoPlayer'

function ReelCard({ reel, isActive, userLikes, onWatchTime }) {
  const videoRef = useRef(null)
  const watchTimeRef = useRef(0)
  const watchIntervalRef = useRef(null)
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
      // A8: Start tracking watch time
      watchTimeRef.current = 0
      watchIntervalRef.current = setInterval(() => {
        watchTimeRef.current += 1
      }, 1000)
    } else {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
      setPlaying(false)
      // Report watch time when leaving this reel
      if (watchIntervalRef.current) {
        clearInterval(watchIntervalRef.current)
        if (watchTimeRef.current > 0) {
          onWatchTime?.(reel.id, watchTimeRef.current)
        }
      }
    }
    return () => {
      if (watchIntervalRef.current) clearInterval(watchIntervalRef.current)
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
    const wasLiked = liked
    setLiked(!wasLiked)
    setLikeCount(c => wasLiked ? c - 1 : c + 1)
    try {
      if (wasLiked) {
        const { error } = await supabase.from('likes').delete().match({ post_id: reel.id, user_id: user.id, reaction_type: 'heart' })
        if (error) throw error
      } else {
        const { error } = await supabase.from('likes').insert({ post_id: reel.id, user_id: user.id, reaction_type: 'heart' })
        if (error) throw error
      }
    } catch {
      // Revert on failure
      setLiked(wasLiked)
      setLikeCount(c => wasLiked ? c + 1 : c - 1)
    }
  }

  const mediaUrl = reel.media?.[0]?.signedUrl || reel.media?.[0]?.url || ''
  const cloudflareUid = reel.media?.[0]?.cloudflare_uid

  return (
    <div className="relative w-full h-full bg-black snap-start snap-always flex items-center justify-center">
      {cloudflareUid || mediaUrl ? (
        <div className="w-full h-full absolute inset-0" onClick={togglePlay}>
          <SecureVideoPlayer
            videoRef={videoRef}
            cloudflareUid={cloudflareUid}
            src={mediaUrl}
            className="w-full h-full object-cover"
            loop={true}
            muted={muted}
            controls={false}
            watermark={reel.author?.watermark_enabled !== false}
          />
        </div>
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-zinc-900 to-zinc-800 flex items-center justify-center">
          <p className="text-zinc-600 text-sm">No video available</p>
        </div>
      )}

      {/* Play/Pause overlay */}
      {!playing && (cloudflareUid || mediaUrl) && (
        <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center cursor-pointer z-20">
          <div className="p-4 rounded-full bg-black/30 backdrop-blur-sm">
            <Play size={32} className="text-white fill-white" />
          </div>
        </button>
      )}

      {/* Mute toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          setMuted(!muted)
        }}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/30 backdrop-blur-sm cursor-pointer z-20"
      >
        {muted ? <VolumeX size={18} className="text-white" /> : <Volume2 size={18} className="text-white" />}
      </button>

      {/* Bottom Info */}
      <div className="absolute bottom-0 left-0 right-16 p-4 bg-gradient-to-t from-black/60 to-transparent z-20 pointer-events-none">
        <div className="flex items-center gap-2 mb-2 pointer-events-auto">
          <Avatar src={reel.author?.avatar_url} alt={reel.author?.display_name} size="sm" />
          <span className="text-sm font-semibold text-white">{reel.author?.display_name}</span>
          <span className="text-xs text-zinc-400">@{reel.author?.username}</span>
        </div>
        {reel.content && (
          <p className="text-sm text-white/90 line-clamp-2 pointer-events-auto">{reel.content}</p>
        )}
      </div>

      {/* Side Actions */}
      <div className="absolute right-3 bottom-20 flex flex-col items-center gap-5 z-20">
        <button onClick={(e) => { e.stopPropagation(); handleLike(); }} className="flex flex-col items-center gap-1 cursor-pointer">
          <div className={cn('p-2 rounded-full', liked ? 'bg-red-500/20' : 'bg-black/30 backdrop-blur-sm')}>
            <Heart size={22} className={cn(liked ? 'text-red-500 fill-red-500' : 'text-white')} />
          </div>
          <span className="text-xs text-white font-medium drop-shadow-md">{formatNumber(likeCount)}</span>
        </button>

        <button onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-1 cursor-pointer">
          <div className="p-2 rounded-full bg-black/30 backdrop-blur-sm">
            <MessageCircle size={22} className="text-white" />
          </div>
          <span className="text-xs text-white font-medium drop-shadow-md">{formatNumber(reel.comment_count || 0)}</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()
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
          <span className="text-xs text-white font-medium drop-shadow-md">Share</span>
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
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const containerRef = useRef(null)
  const { user } = useAuthStore()
  const PAGE_SIZE = 20

  useEffect(() => {
    fetchReels(true)
  }, [])

  const fetchReels = async (reset = false) => {
    if (!reset && loadingMore) return
    if (reset) setLoading(true)
    else setLoadingMore(true)

    try {
      const currentPage = reset ? 0 : page
      const offset = currentPage * PAGE_SIZE
      let videoReels = []

      // A8: Use personalized_reels RPC for engagement-weighted feed
      const { data: reelData, error: reelError } = await supabase.rpc('personalized_reels', {
        p_user_id: user?.id || null,
        p_limit: PAGE_SIZE,
        p_offset: offset,
      })

      if (!reelError && reelData?.length > 0) {
        const postIds = reelData.map(r => r.post_id)
        const { data: fullPosts } = await supabase
          .from('posts')
          .select('*, author:profiles!author_id(id, username, display_name, avatar_url, is_verified), media(*), likes(user_id, reaction_type)')
          .in('id', postIds)

        // Sort by personalized order
        const idOrder = new Map(postIds.map((id, i) => [id, i]))
        videoReels = (fullPosts || [])
          .filter(p => p.media?.some(m => m.media_type === 'video'))
          .sort((a, b) => (idOrder.get(a.id) ?? 99) - (idOrder.get(b.id) ?? 99))
      } else {
        // Fallback to direct query
        const { data } = await supabase
          .from('posts')
          .select('*, author:profiles!author_id(id, username, display_name, avatar_url, is_verified), media(*), likes(user_id, reaction_type)')
          .eq('post_type', 'video')
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1)

        videoReels = (data || []).filter(p => p.media?.some(m => m.media_type === 'video'))
      }

      // Resolve storage paths to signed URLs
      await resolvePostMediaUrls(videoReels)

      // Initialize user's like state from fetched data
      if (user) {
        const likedSet = reset ? new Set() : new Set(userLikes)
        videoReels.forEach(reel => {
          if (reel.likes?.some(l => l.user_id === user.id)) {
            likedSet.add(reel.id)
          }
        })
        setUserLikes(likedSet)
      }

      if (reset) {
        setReels(videoReels)
        setPage(1)
      } else {
        setReels(prev => [...prev, ...videoReels])
        setPage(currentPage + 1)
      }
      setHasMore(videoReels.length === PAGE_SIZE)
    } catch (err) {
      console.error('Failed to fetch reels:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  // A8: Track watch time
  const handleWatchTime = useCallback((postId, seconds) => {
    if (!user || seconds < 2) return
    supabase.rpc('track_reel_view', {
      p_user_id: user.id,
      p_post_id: postId,
      p_watch_time: seconds,
      p_completed: seconds >= 10,
    }).catch(() => {})
  }, [user])

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const scrollTop = container.scrollTop
    const height = container.clientHeight
    const newIndex = Math.round(scrollTop / height)
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex)
    }
    // A8: Infinite scroll — load more when near end
    if (newIndex >= reels.length - 3 && hasMore && !loadingMore) {
      fetchReels(false)
    }
  }, [activeIndex, reels.length, hasMore, loadingMore])

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
            <ReelCard reel={reel} isActive={i === activeIndex} userLikes={userLikes} onWatchTime={handleWatchTime} />
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
