import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Heart, MessageCircle, Share, Bookmark, MoreHorizontal,
  Lock, Zap, ShieldCheck, Trash2, Flag, UserX, Pin,
  Flame, ThumbsUp, Sparkles
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { usePostStore } from '../../stores/postStore'
import Avatar from '../ui/Avatar'
import Badge from '../ui/Badge'
import Dropdown, { DropdownItem, DropdownDivider } from '../ui/Dropdown'
import { cn, formatRelativeTime, formatNumber } from '../../lib/utils'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'

const REACTION_TYPES = [
  { type: 'heart', icon: Heart, label: 'Love', color: 'text-rose-500', bg: 'bg-rose-500/10', fill: true },
  { type: 'fire', icon: Flame, label: 'Hot', color: 'text-orange-500', bg: 'bg-orange-500/10', fill: true },
  { type: 'nice', icon: ThumbsUp, label: 'Nice', color: 'text-emerald-500', bg: 'bg-emerald-500/10', fill: false },
  { type: 'sparkle', icon: Sparkles, label: 'Amazing', color: 'text-indigo-400', bg: 'bg-indigo-500/10', fill: true },
]

function MediaGrid({ media }) {
  if (!media || media.length === 0) return null

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
              src={item.url}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
              controls
              preload="metadata"
            />
          ) : (
            <img
              src={item.url}
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

function PaywallGate({ creator }) {
  return (
    <div className="relative mt-3 rounded-2xl overflow-hidden border border-zinc-800/50 bg-zinc-950 aspect-[16/10] flex items-center justify-center">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 to-violet-900/20" />
      <div className="relative z-10 flex flex-col items-center text-center p-8 bg-black/40 backdrop-blur-xl rounded-3xl border border-white/5 mx-4 max-w-sm">
        <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center mb-5">
          <Lock size={24} className="text-white" />
        </div>
        <h3 className="text-xl font-black text-white mb-1.5">Subscriber Only</h3>
        <p className="text-zinc-400 text-sm mb-5">Subscribe to @{creator.username} to unlock this content</p>
        <Link
          to={`/@${creator.username}`}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-95"
        >
          <Zap size={16} className="fill-current" />
          Subscribe for {creator.subscription_price > 0 ? `$${creator.subscription_price}/mo` : 'Free'}
        </Link>
      </div>
    </div>
  )
}

export default function PostCard({ post }) {
  const { user, profile } = useAuthStore()
  const { toggleReaction, toggleBookmark, deletePost } = usePostStore()
  const navigate = useNavigate()
  const author = post.author
  const [showReactions, setShowReactions] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const reactionsRef = useRef(null)
  const reactionsTimeout = useRef(null)

  if (!author) return null

  const isOwn = user?.id === author.id

  // Check if current user is subscribed to this creator
  useEffect(() => {
    if (!user || isOwn) return
    const checkSubscription = async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('subscriber_id', user.id)
        .eq('creator_id', author.id)
        .eq('status', 'active')
        .maybeSingle()
      setIsSubscribed(!!data)
    }
    checkSubscription()
  }, [user, author.id, isOwn])

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

  const isBookmarked = post.bookmarks?.some(b => b.user_id === user?.id)
  const isLocked = post.visibility === 'subscribers_only' && !isOwn

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

  return (
    <article className="px-5 py-4 border-b border-zinc-800/50 hover:bg-zinc-900/20 transition-colors">
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
                  <DropdownItem icon={Pin}>Pin to profile</DropdownItem>
                  <DropdownDivider />
                  <DropdownItem icon={Trash2} danger onClick={handleDelete}>Delete post</DropdownItem>
                </>
              ) : (
                <>
                  <DropdownItem icon={UserX}>Mute @{author.username}</DropdownItem>
                  <DropdownItem icon={Flag} danger>Report post</DropdownItem>
                </>
              )}
            </Dropdown>
          </div>

          {/* Content */}
          {post.content && (
            <p className="text-[15px] text-zinc-200 leading-relaxed mb-1 whitespace-pre-wrap break-words">
              {post.content}
            </p>
          )}

          {/* Media or Paywall */}
          {isLocked ? (
            <PaywallGate creator={author} />
          ) : (
            <MediaGrid media={post.media} />
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
    </article>
  )
}
