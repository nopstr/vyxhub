import { useState, useEffect } from 'react'
import { Search, TrendingUp, Filter, ShieldCheck, FileText, Hash, Grid3x3 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { resolvePostMediaUrls } from '../../lib/storage'
import { useAuthStore } from '../../stores/authStore'
import Avatar from '../../components/ui/Avatar'
import Badge from '../../components/ui/Badge'
import PostCard from '../../components/feed/PostCard'
import { SkeletonPost } from '../../components/ui/Spinner'
import { Link, useSearchParams } from 'react-router-dom'
import { debounce, formatNumber, cn } from '../../lib/utils'

const CATEGORIES = [
  { key: null, label: 'All' },
  { key: 'photos', label: 'Photos' },
  { key: 'videos', label: 'Videos' },
  { key: 'fitness', label: 'Fitness' },
  { key: 'cosplay', label: 'Cosplay' },
  { key: 'lifestyle', label: 'Lifestyle' },
  { key: 'artistic', label: 'Artistic' },
  { key: 'gaming', label: 'Gaming' },
  { key: 'fashion', label: 'Fashion' },
]

const POST_SELECT = `
  *,
  author:profiles!author_id(*),
  media(*),
  likes(user_id, reaction_type),
  bookmarks(user_id),
  polls(
    id,
    question,
    ends_at,
    poll_options(id, option_text, votes_count, sort_order),
    poll_votes(user_id, option_id)
  )
`

function CreatorCard({ profile }) {
  return (
    <Link
      to={`/@${profile.username}`}
      className="bg-zinc-900/30 border border-zinc-800/50 rounded-3xl p-5 hover:border-zinc-700/50 transition-all group"
    >
      {/* Banner */}
      <div className="h-24 rounded-2xl bg-gradient-to-br from-indigo-900/30 to-violet-900/30 mb-4 overflow-hidden">
        {profile.banner_url && (
          <img src={profile.banner_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        )}
      </div>

      {/* Avatar and Info */}
      <div className="flex items-start gap-3 -mt-10 px-2">
        <Avatar src={profile.avatar_url} alt={profile.display_name} size="xl" ring />
        <div className="pt-8 min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-white truncate group-hover:text-indigo-300 transition-colors">
              {profile.display_name}
            </h3>
            {profile.is_verified && <ShieldCheck size={15} className="text-indigo-400 flex-shrink-0" />}
          </div>
          <p className="text-xs text-zinc-500">@{profile.username}</p>
        </div>
      </div>

      {profile.bio && (
        <p className="text-sm text-zinc-400 mt-3 line-clamp-2 leading-relaxed">{profile.bio}</p>
      )}

      <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-800/50">
        <div className="flex gap-4">
          <span className="text-xs text-zinc-500">
            <strong className="text-zinc-300">{formatNumber(profile.follower_count)}</strong> followers
          </span>
          <span className="text-xs text-zinc-500">
            <strong className="text-zinc-300">{formatNumber(profile.post_count)}</strong> posts
          </span>
        </div>
        {profile.subscription_price > 0 && (
          <Badge variant="premium">${profile.subscription_price}/mo</Badge>
        )}
      </div>
    </Link>
  )
}

export default function ExplorePage() {
  const [tab, setTab] = useState('trending')
  const [search, setSearch] = useState('')
  const [creators, setCreators] = useState([])
  const [posts, setPosts] = useState([])
  const [trendingHashtags, setTrendingHashtags] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuthStore()
  const [searchParams] = useSearchParams()

  // Check URL for ?tag= parameter
  useEffect(() => {
    const tagParam = searchParams.get('tag')
    if (tagParam) {
      setSearch(`#${tagParam}`)
      setTab('posts')
      handleHashtagSearch(tagParam)
    }
  }, [searchParams])

  useEffect(() => {
    if (!searchParams.get('tag')) {
      fetchContent()
    }
  }, [tab, selectedCategory])

  // Fetch trending hashtags on mount
  useEffect(() => {
    fetchTrendingHashtags()
  }, [])

  const fetchTrendingHashtags = async () => {
    const { data } = await supabase.rpc('trending_hashtags', { p_limit: 8 })
    setTrendingHashtags(data || [])
  }

  const handleHashtagSearch = async (tag) => {
    setLoading(true)
    try {
      // A2: Use explore_posts RPC with hashtag filter
      const { data: exploreData } = await supabase.rpc('explore_posts', {
        p_user_id: user?.id || null,
        p_hashtag: tag.toLowerCase(),
        p_sort: 'trending',
        p_limit: 20,
        p_offset: 0,
      })

      if (exploreData?.length > 0) {
        const postIds = exploreData.map(p => p.post_id)
        const { data: fullPosts } = await supabase
          .from('posts')
          .select(POST_SELECT)
          .in('id', postIds)

        if (fullPosts?.length) await resolvePostMediaUrls(fullPosts)
        const idOrder = new Map(postIds.map((id, i) => [id, i]))
        setPosts((fullPosts || []).sort((a, b) => (idOrder.get(a.id) ?? 99) - (idOrder.get(b.id) ?? 99)))
      } else {
        setPosts([])
      }
    } catch (err) {
      console.error('Hashtag search error:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchContent = async () => {
    setLoading(true)
    try {
      // Fetch creators
      const { data: creatorData } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_creator', true)
        .order('follower_count', { ascending: false })
        .limit(12)

      setCreators(creatorData || [])

      // A2: Use explore_posts RPC for trending/latest/top with category filter
      if (tab === 'trending' || tab === 'latest') {
        const { data: exploreData } = await supabase.rpc('explore_posts', {
          p_user_id: user?.id || null,
          p_category: selectedCategory,
          p_sort: tab === 'latest' ? 'latest' : 'trending',
          p_limit: 20,
          p_offset: 0,
        })

        if (exploreData?.length > 0) {
          const postIds = exploreData.map(p => p.post_id)
          const { data: fullPosts } = await supabase
            .from('posts')
            .select(POST_SELECT)
            .in('id', postIds)

          if (fullPosts?.length) await resolvePostMediaUrls(fullPosts)
          const idOrder = new Map(postIds.map((id, i) => [id, i]))
          setPosts((fullPosts || []).sort((a, b) => (idOrder.get(a.id) ?? 99) - (idOrder.get(b.id) ?? 99)))
        } else {
          // Fallback to direct query
          let postQuery = supabase
            .from('posts')
            .select(POST_SELECT)
            .eq('visibility', 'public')
            .limit(20)

          if (selectedCategory) postQuery = postQuery.eq('category', selectedCategory)
          if (tab === 'latest') {
            postQuery = postQuery.order('created_at', { ascending: false })
          } else {
            postQuery = postQuery.order('like_count', { ascending: false })
          }

          const { data: postData } = await postQuery
          if (postData?.length) await resolvePostMediaUrls(postData)
          setPosts(postData || [])
        }
      }
    } catch (err) {
      console.error('Explore fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = debounce(async (query) => {
    if (!query.trim()) {
      fetchContent()
      return
    }

    // Check if searching for a hashtag
    if (query.startsWith('#') && query.length > 1) {
      setTab('posts')
      handleHashtagSearch(query.slice(1))
      return
    }

    setLoading(true)

    // Search profiles
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .limit(20)

    setCreators(profileData || [])

    // Search posts using full-text search (tsvector)
    const tsQuery = query.trim().split(/\s+/).join(' & ')
    const { data: postData } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .textSearch('search_vector', tsQuery, { type: 'plain' })
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(20)

    if (postData?.length) await resolvePostMediaUrls(postData)
    setPosts(postData || [])

    setLoading(false)
  }, 300)

  return (
    <div>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); handleSearch(e.target.value) }}
            placeholder="Search creators, posts, #hashtags..."
            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl pl-12 pr-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800/50">
        {['trending', 'creators', 'latest', ...(search.trim() ? ['posts'] : [])].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-semibold transition-colors relative capitalize cursor-pointer ${
              tab === t ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t === 'posts' ? (
              <span className="flex items-center justify-center gap-1">
                <FileText size={14} /> Posts
              </span>
            ) : t}
            {tab === t && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-indigo-500 rounded-full" />}
          </button>
        ))}
      </div>

      {/* A2: Category filter bar (for trending/latest tabs) */}
      {(tab === 'trending' || tab === 'latest') && (
        <div className="flex gap-2 px-5 py-3 overflow-x-auto no-scrollbar border-b border-zinc-800/30">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key || 'all'}
              onClick={() => setSelectedCategory(cat.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer',
                selectedCategory === cat.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-700/50'
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* A2: Trending hashtags bar (on trending tab) */}
      {tab === 'trending' && trendingHashtags.length > 0 && (
        <div className="flex gap-2 px-5 py-3 overflow-x-auto no-scrollbar">
          {trendingHashtags.map(tag => (
            <Link
              key={tag.hashtag_name}
              to={`/explore?tag=${tag.hashtag_name}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-semibold whitespace-nowrap hover:bg-indigo-500/20 transition-colors"
            >
              <Hash size={12} />
              {tag.hashtag_name}
              <span className="text-indigo-500/60">{formatNumber(tag.recent_posts)}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="p-5">
        {tab === 'creators' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {creators.map(creator => (
              <CreatorCard key={creator.id} profile={creator} />
            ))}
          </div>
        )}

        {(tab === 'trending' || tab === 'latest') && (
          <div>
            {loading ? (
              <>
                <SkeletonPost />
                <SkeletonPost />
              </>
            ) : posts.length > 0 ? (
              posts.map(post => <PostCard key={post.id} post={post} />)
            ) : (
              <div className="text-center py-16">
                <TrendingUp size={48} className="text-zinc-700 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-zinc-400">Nothing trending yet</h3>
                <p className="text-sm text-zinc-600 mt-1">Be the first to post!</p>
              </div>
            )}
          </div>
        )}

        {/* Post search results */}
        {tab === 'posts' && (
          <div>
            {loading ? (
              <>
                <SkeletonPost />
                <SkeletonPost />
              </>
            ) : posts.length > 0 ? (
              posts.map(post => <PostCard key={post.id} post={post} />)
            ) : (
              <div className="text-center py-16">
                <FileText size={48} className="text-zinc-700 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-zinc-400">No posts found</h3>
                <p className="text-sm text-zinc-600 mt-1">Try a different search term</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
