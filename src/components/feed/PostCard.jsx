import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Heart, MessageCircle, Share, Bookmark, MoreHorizontal,
  Lock, Zap, ShieldCheck, Trash2, Flag, UserX, Pin,
  Flame, ThumbsUp, Sparkles, Play, DollarSign, Grid3x3, Film, Image,
  Repeat2, VolumeX, Edit2, EyeOff
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { usePostStore } from '../../stores/postStore'
import { useSubscriptionCache } from '../../stores/subscriptionCache'
import { getBlurPreviewUrl } from '../../lib/storage'
import Avatar from '../ui/Avatar'
import Badge from '../ui/Badge'
import Dropdown, { DropdownItem, DropdownDivider } from '../ui/Dropdown'
import ReportModal from '../ReportModal'
import EditPostModal from './EditPostModal'
import { cn, formatRelativeTime, formatNumber } from '../../lib/utils'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { PLATFORM_FEE_PERCENT } from '../../lib/constants'

const REACTION_TYPES = [
  { type: 'heart', icon: Heart, label: 'Love', color: 'text-rose-500', bg: 'bg-rose-500/10', fill: true },
  { type: 'fire', icon: Flame, label: 'Hot', color: 'text-orange-500', bg: 'bg-orange-500/10', fill: true },
  { type: 'nice', icon: ThumbsUp, label: 'Nice', color: 'text-emerald-500', bg: 'bg-emerald-500/10', fill: false },
  { type: 'sparkle', icon: Sparkles, label: 'Amazing', color: 'text-indigo-400', bg: 'bg-indigo-500/10', fill: true },
]

// A2: Render text with clickable hashtags
function RichContent({ text }) {
  if (!text) return null
  const parts = text.split(/(#[a-zA-Z0-9_]{1,50})/g)
  return parts.map((part, i) => {
    if (/^#[a-zA-Z0-9_]{1,50}$/.test(part)) {
      return (
        <Link key={i} to={`/explore?tag=${part.slice(1)}`} className="text-indigo-400 hover:text-indigo-300 hover:underline">
          {part}
        </Link>
      )
    }
    return part
  })
}

function MediaGrid({ media, isUnlocked = true }) {
  if (!media || media.length === 0) return null

  // Locked: show blurred low-res thumbnails
  if (!isUnlocked) {
    const previewItems = media.slice(0, 4)
    return (
      <div className="relative mt-3 rounded-2xl overflow-hidden border border-zinc-800/50">
        <div className={cn(
          'grid',
          previewItems.length === 1 && 'grid-cols-1',
          previewItems.length === 2 && 'grid-cols-2 gap-0.5',
          previewItems.length >= 3 && 'grid-cols-2 grid-rows-2 gap-0.5',
        )}>
          {previewItems.map((item, i) => {
            const blurSrc = getBlurPreviewUrl(item.signedUrl || item.url)
            return (
              <div
                key={item.id}
                className={cn(
                  'relative overflow-hidden bg-zinc-950',
                  previewItems.length === 1 && 'aspect-[16/10]',
                  previewItems.length === 2 && 'aspect-square',
                  previewItems.length === 3 && i === 0 && 'row-span-2 aspect-auto h-full',
                  previewItems.length >= 3 && i > 0 && 'aspect-square',
                )}
              >
                {blurSrc && (
                  <img
                    src={blurSrc}
                    alt=""
                    className="w-full h-full object-cover scale-110 blur-xl brightness-75"
                    loading="lazy"
                    draggable={false}
                  />
                )}
              </div>
            )
          })}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 text-white/80 bg-black/30 backdrop-blur-sm px-4 py-2 rounded-full">
            <Lock size={14} />
            <span className="text-sm font-semibold">Subscriber content</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'mt-3 rounded-2xl overflow-hidden border border-zinc-800/50',
      media.length === 1 && 'grid-cols-1',
      media.length === 2 && 'grid grid-cols-2 gap-0.5',
      media.length === 3 && 'grid grid-cols-2 grid-rows-2 gap-0.5',
      media.length >= 4 && 'grid grid-cols-2 grid-rows-2 gap-0.5'
    )}>
      {media.slice(0, 4).map((item, i) => (
        <div
          key={item.id}
          className={cn(
            'relative overflow-hidden bg-zinc-950 cursor-pointer group',
            media.length === 1 && 'aspect-[16/10]',
            media.length === 2 && 'aspect-square',
            media.length === 3 && i === 0 && 'row-span-2 aspect-auto h-full',
            media.length >= 3 && i > 0 && 'aspect-square',
          )}
        >
          {item.media_type === 'video' ? (
            <video
              src={item.signedUrl || item.url}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
              controls
              preload="metadata"
            />
          ) : (
            <img
              src={item.signedUrl || item.url}
              alt=""
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
              loading="lazy"
            />
          )}
          {i === 3 && media.length > 4 && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-2xl font-bold text-white">+{media.length - 4}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* Set Preview: first image clear, second blurred + "Unlock to view X more" when locked */
function SetPreview({ media, isUnlocked, totalMediaCount }) {
  if (!media || media.length === 0) return null

  const allMedia = media.filter(m => m.signedUrl || m.url)
  const totalCount = totalMediaCount || media.length

  // Unlocked: show all media in a grid
  if (isUnlocked) {
    return (
      <div className="mt-3">
        <div className={cn(
          'grid gap-1 rounded-2xl overflow-hidden border border-zinc-800/50',
          allMedia.length === 1 && 'grid-cols-1',
          allMedia.length === 2 && 'grid-cols-2',
          allMedia.length >= 3 && 'grid-cols-3',
        )}>
          {allMedia.map((item) => (
            <div key={item.id} className="relative aspect-square overflow-hidden bg-zinc-950 group">
              <img
                src={item.signedUrl || item.url}
                alt=""
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Locked: first image clear, second blurred with "Unlock to view X more"
  const firstItem = allMedia[0]
  const secondItem = allMedia.length > 1 ? allMedia[1] : null
  const remainingCount = Math.max(totalCount - 1, 0)

  return (
    <div className="mt-3">
      <div className={cn(
        'grid gap-1 rounded-2xl overflow-hidden border border-zinc-800/50',
        secondItem ? 'grid-cols-2' : 'grid-cols-1',
      )}>
        {/* First image — shown clear as preview */}
        {firstItem && (
          <div className="relative aspect-square overflow-hidden bg-zinc-950">
            <img
              src={firstItem.signedUrl || firstItem.url}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Second image — blurred with unlock overlay */}
        {secondItem && (
          <div className="relative aspect-square overflow-hidden bg-zinc-950">
            {(() => {
              const blurSrc = getBlurPreviewUrl(secondItem.signedUrl || secondItem.url)
              return blurSrc ? (
                <img
                  src={blurSrc}
                  alt=""
                  className="w-full h-full object-cover scale-110 blur-xl brightness-50"
                  loading="lazy"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-zinc-800/80 via-zinc-900 to-zinc-950" />
              )
            })()}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-1.5 text-white/90">
                <Lock size={18} />
                <span className="text-sm font-bold text-center px-2">Unlock to view {remainingCount} more</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* Video Preview: shows player for unlocked, blurred low-res thumbnail for locked — NEVER loads actual video when locked */
function VideoPreview({ media, isUnlocked, post }) {
  const videoMedia = media?.find(m => m.media_type === 'video')
  if (!videoMedia) return null

  if (isUnlocked && (videoMedia.signedUrl || videoMedia.url)) {
    return (
      <div className="mt-3 rounded-2xl overflow-hidden border border-zinc-800/50">
        <video
          src={videoMedia.signedUrl || videoMedia.url}
          className="w-full aspect-video object-contain bg-black"
          controls
          preload="metadata"
        />
      </div>
    )
  }

  // LOCKED: show blurred low-res thumbnail, never load actual video
  const isPPV = post?.price && parseFloat(post.price) > 0
  // Try to get a poster image for blur (first image media, or the video URL for Unsplash)
  const posterMedia = media?.find(m => m.media_type === 'image') || videoMedia
  const blurSrc = getBlurPreviewUrl(posterMedia?.signedUrl || posterMedia?.url)

  return (
    <div className="relative mt-3 rounded-2xl overflow-hidden border border-zinc-800/50 aspect-video bg-zinc-950">
      {/* Blurred low-res background */}
      {blurSrc && (
        <img
          src={blurSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl brightness-50"
          loading="lazy"
          draggable={false}
        />
      )}
      {!blurSrc && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-800/60 via-zinc-900 to-zinc-950" />
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-indigo-600/20 blur-[80px] rounded-full" />
            <div className="absolute bottom-1/4 right-1/4 w-24 h-24 bg-violet-600/20 blur-[60px] rounded-full" />
          </div>
        </>
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 bg-white/10 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/20">
            <Play size={28} className="text-white ml-1" fill="currentColor" />
          </div>
          <div className="flex items-center gap-1.5 text-white/80">
            <Lock size={14} />
            <span className="text-sm font-semibold">{isPPV ? 'Purchase to watch' : 'Subscribe to watch'}</span>
          </div>
          {videoMedia.duration_seconds > 0 && (
            <span className="text-xs text-zinc-500">{Math.floor(videoMedia.duration_seconds / 60)}:{String(videoMedia.duration_seconds % 60).padStart(2, '0')}</span>
          )}
        </div>
      </div>
    </div>
  )
}

function PaywallGate({ creator, post }) {
  const isPPV = post?.price && post.price > 0
  const isSet = post?.post_type === 'set'
  const mediaCount = post?.media?.length || post?.media_count || 0
  // For sets, 1 image is already shown clear
  const lockedCount = isSet ? Math.max(mediaCount - 1, 0) : mediaCount
  const { user } = useAuthStore()
  const { addSubscription, addPurchase } = useSubscriptionCache()
  const [loading, setLoading] = useState(false)

  // Get blur preview from first media item
  const firstMedia = post?.media?.[0]
  const blurSrc = firstMedia ? getBlurPreviewUrl(firstMedia.signedUrl || firstMedia.url) : null

  const handleSubscribe = async () => {
    if (!user) return toast.error('Sign in to subscribe')
    setLoading(true)
    try {
      const { error } = await supabase
        .from('subscriptions')
        .insert({
          subscriber_id: user.id,
          creator_id: creator.id,
          status: 'active',
          price_paid: creator.subscription_price,
          starts_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
      if (error) throw error
      addSubscription(creator.id)
      // Record transaction for financial tracking
      const amount = parseFloat(creator.subscription_price) || 0
      if (amount > 0) {
        const fee = +(amount * PLATFORM_FEE_PERCENT / 100).toFixed(2)
        await supabase.from('transactions').insert({
          from_user_id: user.id,
          to_user_id: creator.id,
          transaction_type: 'subscription',
          amount,
          platform_fee: fee,
          net_amount: +(amount - fee).toFixed(2),
          status: 'completed',
        }).catch(() => {}) // non-blocking
      }
      // Auto-follow
      await supabase.from('follows').insert({ follower_id: user.id, following_id: creator.id }).catch(() => {})
      toast.success(`Subscribed to @${creator.username}!`)
    } catch (err) {
      toast.error(err.message || 'Failed to subscribe')
    } finally {
      setLoading(false)
    }
  }

  const handlePurchase = async () => {
    if (!user) return toast.error('Sign in to purchase')
    setLoading(true)
    try {
      const { error } = await supabase
        .from('purchases')
        .insert({
          buyer_id: user.id,
          post_id: post.id,
          amount: post.price,
        })
      if (error) throw error
      addPurchase(post.id)
      // Record transaction for financial tracking
      const amount = parseFloat(post.price) || 0
      if (amount > 0) {
        // Look up post author for the to_user_id
        const fee = +(amount * PLATFORM_FEE_PERCENT / 100).toFixed(2)
        await supabase.from('transactions').insert({
          from_user_id: user.id,
          to_user_id: creator.id,
          transaction_type: 'ppv_post',
          amount,
          platform_fee: fee,
          net_amount: +(amount - fee).toFixed(2),
          reference_id: post.id,
          status: 'completed',
        }).catch(() => {}) // non-blocking
      }
      toast.success('Content unlocked!')
    } catch (err) {
      toast.error(err.message || 'Failed to purchase')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative mt-3 rounded-2xl overflow-hidden border border-zinc-800/50 bg-zinc-950 aspect-[16/10] flex items-center justify-center">
      {blurSrc ? (
        <img
          src={blurSrc}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl brightness-[0.35]"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-violet-900/20" />
      )}
      <div className="relative z-10 flex flex-col items-center text-center p-8 bg-black/40 backdrop-blur-xl rounded-3xl border border-white/5 mx-4 max-w-sm">
        <div className={cn(
          'w-14 h-14 rounded-2xl flex items-center justify-center mb-5',
          isPPV
            ? 'bg-gradient-to-br from-amber-500 to-orange-600'
            : 'bg-gradient-to-br from-indigo-500 to-violet-600'
        )}>
          {isPPV ? <DollarSign size={24} className="text-white" /> : <Lock size={24} className="text-white" />}
        </div>
        <h3 className="text-xl font-black text-white mb-1.5">
          {isPPV ? `Unlock to view ${lockedCount} more` : 'Subscriber Only'}
        </h3>
        <p className="text-zinc-400 text-sm mb-5">
          {isPPV
            ? `One-time purchase to unlock ${lockedCount > 1 ? `all ${lockedCount} items` : 'this content'}`
            : `Subscribe to @${creator.username} to unlock this content`
          }
        </p>
        {isPPV ? (
          <button
            onClick={handlePurchase}
            disabled={loading}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <DollarSign size={16} />
                Buy for ${parseFloat(post.price).toFixed(2)}
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Zap size={16} className="fill-current" />
                Subscribe for {creator.subscription_price > 0 ? `$${creator.subscription_price}/mo` : 'Free'}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export default function PostCard({ post }) {
  const { user } = useAuthStore()
  const { toggleReaction, toggleBookmark, deletePost, togglePin, repost, hidePost } = usePostStore()
  const { isSubscribedTo, hasPurchasedPost } = useSubscriptionCache()
  const navigate = useNavigate()
  const author = post.author
  const [showReactions, setShowReactions] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editedContent, setEditedContent] = useState(post.content)
  const reactionsRef = useRef(null)
  const reactionsTimeout = useRef(null)

  if (!author) return null

  const isOwn = user?.id === author.id
  const isPPV = post.price && parseFloat(post.price) > 0
  const isSet = post.post_type === 'set'
  const isVideo = post.post_type === 'video'

  // O(1) lookups from subscription cache (no per-card DB queries)
  const isSubscribed = isOwn || isSubscribedTo(author.id)
  const hasPurchased = hasPurchasedPost(post.id)

  // Determine if content is unlocked
  const isContentUnlocked = isOwn || isSubscribed || hasPurchased || post.visibility === 'public'

  // Get the user's own reactions on this post
  const userReactions = post.likes?.filter(l => l.user_id === user?.id) || []
  const hasReacted = userReactions.length > 0

  // Count reactions by type
  const reactionCounts = REACTION_TYPES.reduce((acc, r) => {
    acc[r.type] = post.likes?.filter(l => l.reaction_type === r.type).length || 0
    return acc
  }, {})
  const totalReactions = post.likes?.length || post.like_count || 0

  // Find primary reaction to display (first one user made, or heart as default display)
  const primaryUserReaction = userReactions[0]?.reaction_type
  const primaryDef = REACTION_TYPES.find(r => r.type === primaryUserReaction) || REACTION_TYPES[0]

  const isLocked = post.visibility === 'subscribers_only' && !isOwn
  const showPaywall = (isLocked && !isSubscribed && !hasPurchased) || (isPPV && !isOwn && !hasPurchased)
  const isBookmarked = post.bookmarks?.some(b => b.user_id === user?.id)

  const handleReaction = (reactionType, e) => {
    e?.stopPropagation()
    if (!user) return toast.error('Sign in to react to posts')
    toggleReaction(post.id, user.id, reactionType)
    setShowReactions(false)
  }

  const handleReactionHover = () => {
    clearTimeout(reactionsTimeout.current)
    setShowReactions(true)
  }

  const handleReactionLeave = () => {
    reactionsTimeout.current = setTimeout(() => setShowReactions(false), 300)
  }

  const handleComment = (e) => {
    e.stopPropagation()
    if (!user) return toast.error('Sign in to interact')
    if (!isOwn && !isSubscribed) {
      return toast.error(`Subscribe to @${author.username} to comment`)
    }
    navigate(`/post/${post.id}`)
  }

  const handleBookmark = (e) => {
    e.stopPropagation()
    if (!user) return toast.error('Sign in to bookmark posts')
    toggleBookmark(post.id, user.id)
  }

  const handleDelete = async () => {
    try {
      await deletePost(post.id)
      toast.success('Post deleted')
    } catch {
      toast.error('Failed to delete post')
    }
  }

  const handleShare = (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`)
    toast.success('Link copied!')
  }

  const handlePublishDraft = async (e) => {
    e.stopPropagation()
    try {
      const { error } = await supabase
        .from('posts')
        .update({ is_draft: false, created_at: new Date().toISOString() })
        .eq('id', post.id)
      if (error) throw error
      toast.success('Draft published!')
      // Optimistic update or rely on realtime
      window.location.reload() // Simple refresh for now to update lists
    } catch (err) {
      toast.error('Failed to publish draft')
    }
  }

  const handlePin = async () => {
    if (!user) return
    try {
      await togglePin(post.id, !post.is_pinned)
      toast.success(post.is_pinned ? 'Post unpinned' : 'Post pinned to profile')
    } catch (err) {
      toast.error(err.message || 'Failed to pin post')
    }
  }

  const handleBlock = async (isMute = false) => {
    if (!user) return toast.error('Sign in first')
    try {
      const { error } = await supabase.from('blocks').upsert({
        blocker_id: user.id,
        blocked_id: author.id,
        is_mute: isMute,
      }, { onConflict: 'blocker_id,blocked_id' })
      if (error) throw error
      toast.success(isMute ? `Muted @${author.username}` : `Blocked @${author.username}`)
    } catch (err) {
      toast.error(err.message || 'Failed')
    }
  }

  const handleRepost = async (e) => {
    e?.stopPropagation()
    if (!user) return toast.error('Sign in to repost')
    // Can't repost own posts or already-reposted
    if (isOwn) return toast.error("Can't repost your own post")
    try {
      await repost(post.id, user.id)
      toast.success('Reposted!')
    } catch (err) {
      toast.error(err.message || 'Failed to repost')
    }
  }

  const handleHide = async (e) => {
    e?.stopPropagation()
    if (!user) return toast.error('Sign in to hide posts')
    try {
      await hidePost(post.id, user.id)
      toast.success('Post hidden')
    } catch (err) {
      toast.error('Failed to hide post')
    }
  }

  const isRepost = !!post.repost_of

  return (
    <article className="px-5 py-4 border-b border-zinc-800/50 hover:bg-zinc-900/20 transition-colors">
      {/* Repost indicator */}
      {isRepost && post.reposted_by_profile && (
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2 ml-12">
          <Repeat2 size={14} />
          <Link to={`/@${post.reposted_by_profile?.username}`} className="hover:underline">
            {post.reposted_by_profile?.display_name} reposted
          </Link>
        </div>
      )}

      {/* Pinned indicator */}
      {post.is_pinned && (
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2 ml-12">
          <Pin size={14} className="text-indigo-400" />
          <span className="text-indigo-400 font-medium">Pinned</span>
        </div>
      )}

      <div className="flex gap-3.5">
        <Link to={`/@${author.username}`} className="flex-shrink-0">
          <Avatar src={author.avatar_url} alt={author.display_name} size="lg" ring />
        </Link>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <Link to={`/@${author.username}`} className="flex items-center gap-1.5 min-w-0 hover:underline">
                <span className="font-bold text-zinc-100 truncate">{author.display_name}</span>
                {author.is_verified && <ShieldCheck size={15} className="text-indigo-400 fill-indigo-400/10 flex-shrink-0" />}
              </Link>
              <span className="text-zinc-500 text-sm flex-shrink-0">@{author.username}</span>
              <span className="text-zinc-700 text-sm flex-shrink-0">·</span>
              <span className="text-zinc-500 text-sm flex-shrink-0">{formatRelativeTime(post.created_at)}</span>
              {post.visibility !== 'public' && (
                <Badge variant={post.visibility === 'subscribers_only' ? 'premium' : 'default'} className="ml-1">
                  {post.visibility === 'subscribers_only' ? 'VIP' : 'Followers'}
                </Badge>
              )}
            </div>

            <Dropdown
              trigger={
                <button className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors cursor-pointer">
                  <MoreHorizontal size={18} />
                </button>
              }
            >
              {isOwn ? (
                <>
                  {post.is_draft && (
                    <DropdownItem icon={Zap} onClick={handlePublishDraft}>Publish Draft</DropdownItem>
                  )}
                  <DropdownItem icon={Edit2} onClick={() => setShowEditModal(true)}>Edit post</DropdownItem>
                  <DropdownItem icon={Pin} onClick={handlePin}>
                    {post.is_pinned ? 'Unpin from profile' : 'Pin to profile'}
                  </DropdownItem>
                  <DropdownDivider />
                  <DropdownItem icon={Trash2} danger onClick={handleDelete}>Delete post</DropdownItem>
                </>
              ) : (
                <>
                  <DropdownItem icon={EyeOff} onClick={handleHide}>Hide post</DropdownItem>
                  <DropdownItem icon={VolumeX} onClick={() => handleBlock(true)}>Mute @{author.username}</DropdownItem>
                  <DropdownItem icon={UserX} onClick={() => handleBlock(false)}>Block @{author.username}</DropdownItem>
                  <DropdownDivider />
                  <DropdownItem icon={Flag} danger onClick={() => setShowReportModal(true)}>Report post</DropdownItem>
                </>
              )}
            </Dropdown>
          </div>

          {/* Content — gate text for subscriber-only posts */}
          {editedContent && (
            <p className="text-[15px] text-zinc-200 leading-relaxed mb-1 whitespace-pre-wrap break-words">
              {isContentUnlocked || post.visibility === 'public'
                ? <RichContent text={editedContent} />
                : editedContent.length > 60
                  ? editedContent.slice(0, 60) + '…'
                  : editedContent
              }
              {!isContentUnlocked && post.visibility !== 'public' && editedContent.length > 60 && (
                <span className="text-indigo-400 text-sm ml-1">Subscribe to see full post</span>
              )}
            </p>
          )}

          {/* Post type badge */}
          {(isSet || isVideo || post.is_draft) && (
            <div className="flex items-center gap-2 mt-1 mb-1">
              {post.is_draft && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-400 bg-zinc-500/10 px-2 py-0.5 rounded-md">
                  Draft
                </span>
              )}
              {isSet && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-md">
                  <Grid3x3 size={12} /> Set · {post.media?.length || 0} photos
                </span>
              )}
              {isVideo && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md">
                  <Film size={12} /> Video
                </span>
              )}
              {isPPV && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">
                  <DollarSign size={12} /> ${parseFloat(post.price).toFixed(2)}
                </span>
              )}
            </div>
          )}

          {/* Media / Set / Video / Paywall */}
          {showPaywall && !isSet && !isVideo ? (
            <PaywallGate creator={author} post={post} />
          ) : isSet ? (
            <SetPreview media={post.media} isUnlocked={isContentUnlocked} totalMediaCount={post.media_count || post.media?.length} />
          ) : isVideo ? (
            <VideoPreview media={post.media} isUnlocked={isContentUnlocked} post={post} />
          ) : (
            <MediaGrid media={post.media} isUnlocked={isContentUnlocked} />
          )}

          {/* PPV gate below set/video if not unlocked */}
          {(isSet || isVideo) && showPaywall && (
            <div className="mt-2">
              <PaywallGate creator={author} post={post} />
            </div>
          )}

          {/* Poll */}
          {post.polls && post.polls.length > 0 && (
            <div className="mt-3 p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
              <h4 className="text-sm font-medium text-zinc-200 mb-3">{post.polls[0].question}</h4>
              <div className="space-y-2">
                {post.polls[0].poll_options?.sort((a, b) => a.sort_order - b.sort_order).map(opt => {
                  const totalVotes = post.polls[0].poll_options.reduce((sum, o) => sum + (o.votes_count || 0), 0)
                  const percent = totalVotes > 0 ? Math.round(((opt.votes_count || 0) / totalVotes) * 100) : 0
                  const hasVoted = post.polls[0].poll_votes?.some(v => v.user_id === user?.id)
                  const isMyVote = post.polls[0].poll_votes?.some(v => v.user_id === user?.id && v.option_id === opt.id)
                  const isExpired = new Date(post.polls[0].ends_at) < new Date()

                  return (
                    <button
                      key={opt.id}
                      disabled={hasVoted || isExpired || !user}
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (!user) return toast.error('Sign in to vote')
                        try {
                          const { error } = await supabase.from('poll_votes').insert({
                            poll_id: post.polls[0].id,
                            option_id: opt.id,
                            user_id: user.id
                          })
                          if (error) throw error
                          toast.success('Vote recorded!')
                          // Optimistic update would go here, but for now we rely on realtime or refetch
                        } catch (err) {
                          toast.error('Failed to vote')
                        }
                      }}
                      className={cn(
                        "relative w-full text-left overflow-hidden rounded-lg border transition-all",
                        hasVoted || isExpired ? "border-zinc-800 cursor-default" : "border-zinc-700 hover:border-indigo-500/50 cursor-pointer",
                        isMyVote ? "border-indigo-500/50" : ""
                      )}
                    >
                      {(hasVoted || isExpired) && (
                        <div 
                          className={cn(
                            "absolute inset-y-0 left-0 opacity-20 transition-all duration-1000",
                            isMyVote ? "bg-indigo-500" : "bg-zinc-500"
                          )}
                          style={{ width: `${percent}%` }}
                        />
                      )}
                      <div className="relative flex items-center justify-between px-4 py-2.5">
                        <span className={cn("text-sm font-medium", isMyVote ? "text-indigo-400" : "text-zinc-300")}>
                          {opt.option_text}
                        </span>
                        {(hasVoted || isExpired) && (
                          <span className="text-xs text-zinc-500 font-medium">{percent}%</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                <span>{post.polls[0].poll_options?.reduce((sum, o) => sum + (o.votes_count || 0), 0)} votes</span>
                <span>
                  {new Date(post.polls[0].ends_at) < new Date() 
                    ? 'Poll ended' 
                    : `${Math.ceil((new Date(post.polls[0].ends_at) - new Date()) / (1000 * 60 * 60 * 24))} days left`}
                </span>
              </div>
            </div>
          )}

          {/* Reaction Summary */}
          {totalReactions > 0 && (
            <div className="flex items-center gap-1 mt-2.5 px-1">
              <div className="flex -space-x-0.5">
                {REACTION_TYPES.filter(r => reactionCounts[r.type] > 0)
                  .slice(0, 3)
                  .map(r => (
                    <div key={r.type} className={cn('w-5 h-5 rounded-full flex items-center justify-center', r.bg)}>
                      <r.icon size={11} className={r.color} fill={r.fill ? 'currentColor' : 'none'} />
                    </div>
                  ))}
              </div>
              <span className="text-xs text-zinc-500 font-medium">{formatNumber(totalReactions)}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1 mt-2 -ml-2">
            {/* Reaction Button with Picker */}
            <div
              className="relative"
              ref={reactionsRef}
              onMouseEnter={handleReactionHover}
              onMouseLeave={handleReactionLeave}
            >
              <button
                onClick={(e) => handleReaction(primaryDef.type, e)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors group cursor-pointer',
                  hasReacted ? primaryDef.color : 'text-zinc-500 hover:text-rose-400'
                )}
              >
                <primaryDef.icon
                  size={18}
                  fill={hasReacted && primaryDef.fill ? 'currentColor' : 'none'}
                  className="group-hover:scale-110 transition-transform"
                />
                <span className="text-xs font-semibold">{formatNumber(totalReactions)}</span>
              </button>

              {/* Reaction Picker Popup */}
              {showReactions && (
                <div
                  className="absolute bottom-full left-0 mb-2 flex items-center gap-0.5 bg-zinc-900 border border-zinc-700/50 rounded-2xl p-1.5 shadow-xl z-20 animate-dropdown-in"
                  onMouseEnter={handleReactionHover}
                  onMouseLeave={handleReactionLeave}
                >
                  {REACTION_TYPES.map(r => {
                    const isActive = userReactions.some(ur => ur.reaction_type === r.type)
                    return (
                      <button
                        key={r.type}
                        onClick={(e) => handleReaction(r.type, e)}
                        title={r.label}
                        className={cn(
                          'p-2 rounded-xl transition-all hover:scale-125 cursor-pointer',
                          isActive ? cn(r.bg, r.color) : 'text-zinc-400 hover:bg-zinc-800'
                        )}
                      >
                        <r.icon size={20} fill={isActive && r.fill ? 'currentColor' : 'none'} />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Comment Button — subscriber-only */}
            <button
              onClick={handleComment}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors group cursor-pointer',
                !user || (!isOwn && !isSubscribed)
                  ? 'text-zinc-600'
                  : 'text-zinc-500 hover:text-indigo-400'
              )}
              title={!user ? 'Sign in' : (!isOwn && !isSubscribed) ? 'Subscribe to comment' : 'Comment'}
            >
              {(!user || (!isOwn && !isSubscribed)) && <Lock size={12} className="mr-0.5 opacity-70" />}
              <MessageCircle size={18} className="group-hover:scale-110 transition-transform" />
              <span className="text-xs font-semibold">{formatNumber(post.comment_count)}</span>
            </button>

            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-zinc-500 hover:text-indigo-400 transition-colors group cursor-pointer"
            >
              <Share size={18} className="group-hover:scale-110 transition-transform" />
            </button>

            {/* Repost Button */}
            {!isOwn && (
              <button
                onClick={handleRepost}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors group cursor-pointer',
                  'text-zinc-500 hover:text-emerald-400'
                )}
                title="Repost"
              >
                <Repeat2 size={18} className="group-hover:scale-110 transition-transform" />
                {post.repost_count > 0 && (
                  <span className="text-xs font-semibold">{formatNumber(post.repost_count)}</span>
                )}
              </button>
            )}

            <button
              onClick={handleBookmark}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-colors group ml-auto cursor-pointer',
                isBookmarked ? 'text-indigo-400' : 'text-zinc-500 hover:text-indigo-400'
              )}
            >
              <Bookmark size={18} fill={isBookmarked ? 'currentColor' : 'none'} className="group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <ReportModal
          open={showReportModal}
          onClose={() => setShowReportModal(false)}
          postId={post.id}
          userId={author.id}
          username={author.username}
        />
      )}

      {/* Edit Post Modal */}
      {showEditModal && (
        <EditPostModal
          post={{ ...post, content: editedContent }}
          onClose={() => setShowEditModal(false)}
          onUpdate={(newContent) => setEditedContent(newContent)}
        />
      )}
    </article>
  )
}
