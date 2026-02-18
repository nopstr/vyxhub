import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Calendar, MapPin, LinkIcon, ShieldCheck, Settings, Mail,
  Grid3x3, Video, Lock, MoreHorizontal, Image, Film, Play, DollarSign, Zap
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useSubscriptionCache } from '../../stores/subscriptionCache'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import PostCard from '../../components/feed/PostCard'
import { SkeletonProfile, SkeletonPost } from '../../components/ui/Spinner'
import { formatNumber, formatRelativeTime, cn } from '../../lib/utils'
import { toast } from 'sonner'
import { PLATFORM_FEE_PERCENT } from '../../lib/constants'

export default function ProfilePage() {
  const { username } = useParams()
  const { user, profile: myProfile } = useAuthStore()
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('posts')
  const [isFollowing, setIsFollowing] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [subLoading, setSubLoading] = useState(false)
  const { addSubscription } = useSubscriptionCache()

  const cleanUsername = username?.replace('@', '')
  const isOwnProfile = myProfile?.username === cleanUsername

  useEffect(() => {
    if (cleanUsername) {
      fetchProfile()
    }
  }, [cleanUsername])

  const fetchProfile = async () => {
    setLoading(true)
    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', cleanUsername)
        .single()

      if (error || !profileData) {
        setLoading(false)
        return
      }

      setProfile(profileData)

      // Check follow status
      if (user && !isOwnProfile) {
        const { data: followData } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', profileData.id)
          .single()

        setIsFollowing(!!followData)

        const { data: subData } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('subscriber_id', user.id)
          .eq('creator_id', profileData.id)
          .eq('status', 'active')
          .single()

        setIsSubscribed(!!subData)
      }

      // Fetch posts
      const { data: postsData } = await supabase
        .from('posts')
        .select(`
          *,
          author:profiles!author_id(*),
          media(*),
          likes(user_id, reaction_type),
          bookmarks(user_id)
        `)
        .eq('author_id', profileData.id)
        .order('created_at', { ascending: false })

      setPosts(postsData || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleFollow = async () => {
    if (!user) return toast.error('Sign in to follow')
    setFollowLoading(true)

    try {
      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', profile.id)
        setIsFollowing(false)
        setProfile(p => ({ ...p, follower_count: p.follower_count - 1 }))
      } else {
        await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: profile.id })
        setIsFollowing(true)
        setProfile(p => ({ ...p, follower_count: p.follower_count + 1 }))
      }
    } catch (err) {
      toast.error('Failed to update follow')
    } finally {
      setFollowLoading(false)
    }
  }

  const handleSubscribe = async () => {
    if (!user) return toast.error('Sign in to subscribe')
    setSubLoading(true)
    try {
      const { error } = await supabase
        .from('subscriptions')
        .insert({
          subscriber_id: user.id,
          creator_id: profile.id,
          status: 'active',
          amount: profile.subscription_price,
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
      if (error) throw error
      setIsSubscribed(true)
      addSubscription(profile.id)
      setProfile(p => ({ ...p, subscriber_count: (p.subscriber_count || 0) + 1 }))
      // Also auto-follow if not already
      if (!isFollowing) {
        await supabase.from('follows').insert({ follower_id: user.id, following_id: profile.id }).catch(() => {})
        setIsFollowing(true)
        setProfile(p => ({ ...p, follower_count: p.follower_count + 1 }))
      }
      toast.success(`Subscribed to @${profile.username}!`)
    } catch (err) {
      toast.error(err.message || 'Failed to subscribe')
    } finally {
      setSubLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-5">
        <SkeletonProfile />
        <div className="mt-8">
          <SkeletonPost />
          <SkeletonPost />
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-xl font-bold text-zinc-300 mb-2">User not found</h2>
        <p className="text-sm text-zinc-500">@{cleanUsername} doesn't exist</p>
        <Link to="/explore" className="mt-4 text-sm text-indigo-400 hover:underline">
          Explore creators
        </Link>
      </div>
    )
  }

  const regularPosts = posts.filter(p => p.post_type === 'post' || !p.post_type)
  const setContent = posts.filter(p => p.post_type === 'set')
  const videoContent = posts.filter(p => p.post_type === 'video')

  return (
    <div>
      {/* Banner */}
      <div className="h-48 md:h-56 bg-gradient-to-br from-indigo-900/40 via-zinc-900 to-violet-900/40 relative">
        {profile.banner_url && (
          <img src={profile.banner_url} alt="" className="w-full h-full object-cover" />
        )}
      </div>

      {/* Profile Info */}
      <div className="px-5 pb-5 border-b border-zinc-800/50">
        <div className="flex items-end justify-between -mt-16 mb-4">
          <Avatar
            src={profile.avatar_url}
            alt={profile.display_name}
            size="2xl"
            ring
            className="border-4 border-[#050505] rounded-3xl"
          />
          <div className="flex items-center gap-2 pb-2">
            {isOwnProfile ? (
              <Link to="/settings">
                <Button variant="outline" size="sm">
                  <Settings size={16} />
                  Edit Profile
                </Button>
              </Link>
            ) : (
              <>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal size={20} />
                </Button>
                <Link to="/messages">
                  <Button variant="outline" size="icon">
                    <Mail size={18} />
                  </Button>
                </Link>
                <Button
                  variant={isFollowing ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={handleFollow}
                  loading={followLoading}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </Button>
                {profile.is_creator && profile.subscription_price > 0 && !isSubscribed && (
                  <Button variant="premium" size="sm" onClick={handleSubscribe} loading={subLoading}>
                    <Zap size={14} className="fill-current" />
                    Subscribe ${profile.subscription_price}/mo
                  </Button>
                )}
                {isSubscribed && (
                  <Badge variant="premium" className="!px-3 !py-1.5">Subscribed</Badge>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-black text-white">{profile.display_name}</h1>
            {profile.is_verified && <ShieldCheck size={20} className="text-indigo-400 fill-indigo-400/10" />}
            {profile.is_creator && <Badge variant="premium">Creator</Badge>}
          </div>
          <p className="text-zinc-500">@{profile.username}</p>
        </div>

        {profile.bio && (
          <p className="text-[15px] text-zinc-300 leading-relaxed mb-4 whitespace-pre-wrap">{profile.bio}</p>
        )}

        <div className="flex items-center gap-4 text-sm text-zinc-500 mb-4 flex-wrap">
          <span className="flex items-center gap-1">
            <Calendar size={14} />
            Joined {formatRelativeTime(profile.created_at)}
          </span>
        </div>

        <div className="flex gap-5">
          <span className="text-sm text-zinc-500">
            <strong className="text-white font-bold">{formatNumber(profile.following_count)}</strong> Following
          </span>
          <span className="text-sm text-zinc-500">
            <strong className="text-white font-bold">{formatNumber(profile.follower_count)}</strong> Followers
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800/50">
        {[
          { key: 'posts', label: 'Posts', icon: null, count: regularPosts.length },
          { key: 'sets', label: 'Sets', icon: Grid3x3, count: setContent.length },
          { key: 'videos', label: 'Videos', icon: Film, count: videoContent.length },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 py-3.5 text-sm font-semibold transition-colors relative flex items-center justify-center gap-2 cursor-pointer',
              tab === t.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            {t.icon && <t.icon size={16} />}
            {t.label}
            {t.count > 0 && (
              <span className="text-[10px] text-zinc-500 font-normal">{t.count}</span>
            )}
            {tab === t.key && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-indigo-500 rounded-full" />}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {/* Posts Tab - Timeline View */}
        {tab === 'posts' && (
          regularPosts.length > 0 ? (
            regularPosts.map(post => <PostCard key={post.id} post={post} />)
          ) : (
            <div className="text-center py-16">
              <p className="text-zinc-500">No posts yet</p>
            </div>
          )
        )}

        {/* Sets Tab - Grid View */}
        {tab === 'sets' && (
          setContent.length > 0 ? (
            <div className="grid grid-cols-3 gap-0.5 p-0.5">
              {setContent.map(post => (
                <ContentGridCard key={post.id} post={post} type="set" isOwnProfile={isOwnProfile} isSubscribed={isSubscribed} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <Grid3x3 size={40} className="mx-auto mb-3 text-zinc-700" />
              <p className="text-zinc-500">No sets yet</p>
            </div>
          )
        )}

        {/* Videos Tab - Grid View */}
        {tab === 'videos' && (
          videoContent.length > 0 ? (
            <div className="grid grid-cols-3 gap-0.5 p-0.5">
              {videoContent.map(post => (
                <ContentGridCard key={post.id} post={post} type="video" isOwnProfile={isOwnProfile} isSubscribed={isSubscribed} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <Film size={40} className="mx-auto mb-3 text-zinc-700" />
              <p className="text-zinc-500">No videos yet</p>
            </div>
          )
        )}
      </div>
    </div>
  )
}

/* Grid card for Sets and Videos on profile page */
function ContentGridCard({ post, type, isOwnProfile, isSubscribed }) {
  const isPPV = post.price && parseFloat(post.price) > 0
  const isLocked = !isOwnProfile && !isSubscribed && post.visibility === 'subscribers_only'

  // Get cover image
  const coverMedia = type === 'set'
    ? post.media?.find(m => m.is_preview) || post.media?.[0]
    : post.media?.find(m => m.media_type === 'video') || post.media?.[0]

  const coverUrl = coverMedia?.url || post.cover_image_url

  return (
    <Link
      to={`/post/${post.id}`}
      className="relative aspect-square bg-zinc-900 overflow-hidden group cursor-pointer"
    >
      {/* Cover Image / Video Thumbnail */}
      {type === 'video' && coverMedia?.media_type === 'video' ? (
        <video
          src={coverUrl}
          className={cn(
            'w-full h-full object-cover transition-transform duration-300 group-hover:scale-105',
            isLocked && !isPPV && 'blur-sm brightness-50'
          )}
          preload="metadata"
          muted
        />
      ) : (
        <img
          src={coverUrl}
          alt=""
          className={cn(
            'w-full h-full object-cover transition-transform duration-300 group-hover:scale-105',
            isLocked && !isPPV && 'blur-sm brightness-50'
          )}
          loading="lazy"
        />
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
        <div className="flex items-center gap-4 text-white">
          {type === 'set' && (
            <span className="flex items-center gap-1 font-bold text-sm">
              <Image size={16} /> {post.media?.length || 0}
            </span>
          )}
          {type === 'video' && (
            <Play size={32} className="drop-shadow-lg" fill="currentColor" />
          )}
        </div>
      </div>

      {/* Lock overlay for gated content */}
      {isLocked && (
        <div className="absolute top-2 right-2 z-10">
          <div className="bg-black/60 backdrop-blur-sm rounded-lg p-1.5">
            <Lock size={14} className="text-white" />
          </div>
        </div>
      )}

      {/* PPV price badge */}
      {isPPV && (
        <div className="absolute bottom-2 left-2 z-10">
          <span className="inline-flex items-center gap-0.5 bg-amber-500/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
            <DollarSign size={10} />{parseFloat(post.price).toFixed(2)}
          </span>
        </div>
      )}

      {/* Image count badge for sets */}
      {type === 'set' && post.media?.length > 1 && (
        <div className="absolute top-2 left-2 z-10">
          <span className="inline-flex items-center gap-0.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
            <Grid3x3 size={10} /> {post.media.length}
          </span>
        </div>
      )}

      {/* Video indicator */}
      {type === 'video' && !isLocked && (
        <div className="absolute top-2 left-2 z-10">
          <div className="bg-black/60 backdrop-blur-sm rounded-lg p-1.5">
            <Play size={12} className="text-white" fill="currentColor" />
          </div>
        </div>
      )}
    </Link>
  )
}
