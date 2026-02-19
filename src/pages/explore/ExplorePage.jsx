import { useState, useEffect } from 'react'
import { Search, TrendingUp, Filter, ShieldCheck, FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { resolvePostMediaUrls } from '../../lib/storage'
import Avatar from '../../components/ui/Avatar'
import Badge from '../../components/ui/Badge'
import PostCard from '../../components/feed/PostCard'
import { SkeletonPost } from '../../components/ui/Spinner'
import { Link } from 'react-router-dom'
import { debounce, formatNumber } from '../../lib/utils'

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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchContent()
  }, [tab])

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

      // Fetch posts — trending (by engagement) or latest (by date)
      let postQuery = supabase
        .from('posts')
        .select(`
          *,
          author:profiles!author_id(*),
          media(*),
          likes(user_id, reaction_type),
          bookmarks(user_id)
        `)
        .eq('visibility', 'public')
        .limit(20)

      if (tab === 'latest') {
        postQuery = postQuery.order('created_at', { ascending: false })
      } else {
        postQuery = postQuery.order('like_count', { ascending: false })
      }

      const { data: postData } = await postQuery

      setPosts(postData || [])

      // Resolve protected media to signed URLs
      if (postData?.length) await resolvePostMediaUrls(postData)
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
      .select(`
        *,
        author:profiles!author_id(*),
        media(*),
        likes(user_id, reaction_type),
        bookmarks(user_id)
      `)
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
            placeholder="Search creators, posts..."
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
