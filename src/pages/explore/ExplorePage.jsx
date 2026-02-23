import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, TrendingUp, Filter, ShieldCheck, FileText, Hash, Grid3x3, X, SlidersHorizontal, Calendar, Loader2, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { resolvePostMediaUrls } from '../../lib/storage'
import { useAuthStore } from '../../stores/authStore'
import { useSearchStore } from '../../stores/searchStore'
import Avatar from '../../components/ui/Avatar'
import Badge from '../../components/ui/Badge'
import VirtualizedPost from '../../components/feed/VirtualizedPost'
import { SkeletonPost } from '../../components/ui/Spinner'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { debounce, formatNumber, cn } from '../../lib/utils'
import SearchOverlay from '../../components/ui/SearchOverlay'
import PullToRefresh from '../../components/ui/PullToRefresh'

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
      <div className="h-24 rounded-2xl bg-gradient-to-br from-indigo-900/30 to-violet-900/30 mb-4 overflow-hidden relative">
        {profile.banner_url && (
          <img src={profile.banner_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        )}
        {profile._promoted && (
          <span className="absolute top-2 right-2 text-[10px] font-medium bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full backdrop-blur-sm">
            Promoted
          </span>
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
            {profile.partner_tier === 'verified' && <ShieldCheck size={14} className="text-emerald-400 flex-shrink-0" />}
            {profile.partner_tier === 'blue' && <ShieldCheck size={14} className="text-blue-400 flex-shrink-0" />}
            {profile.partner_tier === 'gold' && <ShieldCheck size={14} className="text-amber-400 flex-shrink-0" />}
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
  const [showFilters, setShowFilters] = useState(false)
  const [showSearchOverlay, setShowSearchOverlay] = useState(false)
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const observerRef = useRef(null)
  const loadingMoreRef = useRef(false)

  const {
    results: searchResults,
    loading: searchLoading,
    totalResults,
    filters,
    setFilter,
    resetFilters,
    search: performSearch,
    loadMore,
    hasMore,
    clearResults,
  } = useSearchStore()

  // Active search mode (from URL ?q= or ?tag=)
  const urlQuery = searchParams.get('q')
  const urlTag = searchParams.get('tag')
  const isSearchMode = !!(urlQuery || urlTag || search.trim())

  // Handle URL params
  useEffect(() => {
    if (urlTag) {
      const hashQuery = `#${urlTag}`
      setSearch(hashQuery)
      setTab('posts')
      handleHashtagSearch(urlTag)
    } else if (urlQuery) {
      setSearch(urlQuery)
      setTab('all')
      performSearch(urlQuery, user?.id, true)
    }
  }, [urlQuery, urlTag])

  useEffect(() => {
    if (!urlQuery && !urlTag) {
      fetchContent()
    }
  }, [tab, selectedCategory])

  // Fetch trending hashtags on mount
  useEffect(() => {
    fetchTrendingHashtags()
  }, [])

  // Infinite scroll for search results
  const lastItemRef = useCallback((node) => {
    if (searchLoading) return
    if (observerRef.current) observerRef.current.disconnect()
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loadingMoreRef.current) {
        loadingMoreRef.current = true
        const q = urlQuery || search.trim()
        if (q) {
          loadMore(q, user?.id).finally(() => { loadingMoreRef.current = false })
        }
      }
    })
    if (node) observerRef.current.observe(node)
  }, [searchLoading, hasMore, urlQuery, search, user])

  const fetchTrendingHashtags = async () => {
    const { data } = await supabase.rpc('trending_hashtags', { p_limit: 8 })
    setTrendingHashtags(data || [])
  }

  const handleHashtagSearch = async (tag) => {
    setLoading(true)
    try {
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

      // Inject promoted profiles at top of creators list
      try {
        const { data: promoProfiles } = await supabase.rpc('get_promoted_profiles', { p_limit: 3 })
        if (promoProfiles?.length > 0) {
          const promoIds = promoProfiles.map(p => p.creator_id)
          const { data: promoCreators } = await supabase
            .from('profiles')
            .select('*')
            .in('id', promoIds)
          if (promoCreators?.length > 0) {
            const tagged = promoCreators.map(c => ({ ...c, _promoted: true }))
            const existingIds = new Set((creatorData || []).map(c => c.id))
            const unique = tagged.filter(c => !existingIds.has(c.id))
            setCreators(prev => [...unique, ...prev])
          }
        }
      } catch (e) {
        console.warn('Failed to fetch promoted profiles:', e)
      }

      // Use explore_posts RPC for trending/latest with category filter
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

  const handleSearchInput = debounce(async (query) => {
    if (!query.trim()) {
      clearResults()
      setTab('trending')
      fetchContent()
      // Clear URL params
      if (urlQuery || urlTag) navigate('/explore', { replace: true })
      return
    }

    if (query.startsWith('#') && query.length > 1) {
      setTab('posts')
      handleHashtagSearch(query.slice(1))
      return
    }

    setTab('all')
    performSearch(query, user?.id, true)
  }, 300)

  const handleFilterSearch = () => {
    const q = urlQuery || search.trim()
    if (q) performSearch(q, user?.id, true)
  }

  // Determine which tabs to show
  const searchTabs = isSearchMode && !urlTag
    ? ['all', 'creators', 'posts', 'hashtags']
    : ['trending', 'creators', 'latest', ...(search.trim() || urlTag ? ['posts'] : [])]

  const handleTabChange = (newTab) => {
    setTab(newTab)
    const q = urlQuery || search.trim()
    if (isSearchMode && !urlTag && q && !q.startsWith('#')) {
      // For unified search tabs, set filter and re-search
      const typeMap = { all: 'all', creators: 'creators', posts: 'posts', hashtags: 'hashtags' }
      setFilter('type', typeMap[newTab] || 'all')
      performSearch(q, user?.id, true)
    }
  }

  // Counts for tab badges in search mode
  const getTabBadge = (tabName) => {
    if (!isSearchMode || urlTag) return null
    const map = { creators: totalResults.creators, posts: totalResults.posts, hashtags: totalResults.hashtags }
    const count = map[tabName]
    if (!count) return null
    return count > 99 ? '99+' : count
  }

  // Pull-to-refresh handler
  const handlePullRefresh = useCallback(async () => {
    if (isSearchMode) {
      const q = urlQuery || urlTag ? `#${urlTag}` : search.trim()
      if (q) await performSearch(q, user?.id, true)
    } else {
      await fetchContent()
    }
  }, [isSearchMode, urlQuery, urlTag, search, user, performSearch, fetchContent])

  return (
    <PullToRefresh onRefresh={handlePullRefresh} disabled={loading || searchLoading}>
      {/* Search Overlay */}
      <SearchOverlay
        open={showSearchOverlay}
        onClose={() => setShowSearchOverlay(false)}
        initialQuery={search}
      />

      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); handleSearchInput(e.target.value) }}
              onFocus={() => setShowSearchOverlay(true)}
              placeholder="Search creators, posts, #hashtags..."
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl pl-12 pr-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-indigo-500/50 transition-colors"
              readOnly
            />
          </div>
          {isSearchMode && !urlTag && (
            <button
              onClick={() => setShowFilters(f => !f)}
              className={cn(
                'p-3 rounded-2xl border transition-colors cursor-pointer',
                showFilters ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-400' : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-white'
              )}
            >
              <SlidersHorizontal size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Advanced Filters Panel */}
      {showFilters && isSearchMode && !urlTag && (
        <div className="border-b border-zinc-800/50 bg-zinc-900/30 px-5 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-300 flex items-center gap-1.5">
              <SlidersHorizontal size={14} />
              Search Filters
            </h3>
            <button onClick={() => { resetFilters(); handleFilterSearch() }} className="text-xs text-zinc-500 hover:text-indigo-400 transition-colors cursor-pointer">Reset all</button>
          </div>

          {/* Sort */}
          <div>
            <label className="text-xs text-zinc-500 font-medium mb-1.5 block">Sort by</label>
            <div className="flex gap-2">
              {[
                { value: 'relevance', label: 'Relevance' },
                { value: 'latest', label: 'Latest' },
                { value: 'popular', label: 'Popular' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setFilter('sort', opt.value); setTimeout(handleFilterSearch, 50) }}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                    filters.sort === opt.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-zinc-800/50 text-zinc-400 hover:text-white'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Media type (only when searching posts) */}
          {(filters.type === 'all' || filters.type === 'posts') && (
            <div>
              <label className="text-xs text-zinc-500 font-medium mb-1.5 block">Media type</label>
              <div className="flex gap-2">
                {[
                  { value: null, label: 'Any' },
                  { value: 'image', label: 'Photos' },
                  { value: 'video', label: 'Videos' },
                  { value: 'set', label: 'Sets' },
                ].map(opt => (
                  <button
                    key={opt.value || 'any'}
                    onClick={() => { setFilter('mediaType', opt.value); setTimeout(handleFilterSearch, 50) }}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                      filters.mediaType === opt.value
                        ? 'bg-indigo-600 text-white'
                        : 'bg-zinc-800/50 text-zinc-400 hover:text-white'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date range */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-zinc-500 font-medium mb-1.5 block">From</label>
              <input
                type="date"
                value={filters.dateFrom ? filters.dateFrom.split('T')[0] : ''}
                onChange={(e) => { setFilter('dateFrom', e.target.value ? new Date(e.target.value).toISOString() : null); setTimeout(handleFilterSearch, 50) }}
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-indigo-500/50"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-zinc-500 font-medium mb-1.5 block">To</label>
              <input
                type="date"
                value={filters.dateTo ? filters.dateTo.split('T')[0] : ''}
                onChange={(e) => { setFilter('dateTo', e.target.value ? new Date(e.target.value).toISOString() : null); setTimeout(handleFilterSearch, 50) }}
                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-1.5 text-xs text-zinc-300 outline-none focus:border-indigo-500/50"
              />
            </div>
          </div>

          {/* Verified only */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.verifiedOnly}
              onChange={(e) => { setFilter('verifiedOnly', e.target.checked); setTimeout(handleFilterSearch, 50) }}
              className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-indigo-500/50"
            />
            <span className="text-xs text-zinc-400">Verified only</span>
          </label>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-zinc-800/50">
        {searchTabs.map(t => (
          <button
            key={t}
            onClick={() => handleTabChange(t)}
            className={`flex-1 py-3 text-sm font-semibold transition-colors relative capitalize cursor-pointer ${
              tab === t ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span className="flex items-center justify-center gap-1">
              {t === 'posts' ? <><FileText size={14} /> Posts</> : t === 'hashtags' ? <><Hash size={14} /> Tags</> : t}
              {getTabBadge(t) && (
                <span className="ml-1 text-[10px] bg-indigo-600/20 text-indigo-400 px-1.5 py-0.5 rounded-full font-bold">
                  {getTabBadge(t)}
                </span>
              )}
            </span>
            {tab === t && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-indigo-500 rounded-full" />}
          </button>
        ))}
      </div>

      {/* Category filter bar (for trending/latest tabs) */}
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

      {/* Trending hashtags bar (on trending tab) */}
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
        {/* ── Unified search results ─── */}
        {isSearchMode && !urlTag && tab !== 'trending' && tab !== 'latest' && (
          <div className="space-y-6">
            {/* Hashtag results */}
            {(tab === 'all' || tab === 'hashtags') && searchResults.hashtags.length > 0 && (
              <div>
                {tab === 'all' && <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Hashtags</h3>}
                <div className="flex flex-wrap gap-2">
                  {searchResults.hashtags.map(ht => (
                    <Link
                      key={ht.id}
                      to={`/explore?tag=${ht.name}`}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-semibold hover:bg-indigo-500/20 transition-colors"
                    >
                      <Hash size={14} />
                      {ht.name}
                      <span className="text-indigo-500/50 text-xs ml-1">{formatNumber(ht.post_count)} posts</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Creator results */}
            {(tab === 'all' || tab === 'creators') && searchResults.creators.length > 0 && (
              <div>
                {tab === 'all' && <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Creators</h3>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {searchResults.creators.map(creator => (
                    <CreatorCard key={creator.id} profile={creator} />
                  ))}
                </div>
              </div>
            )}

            {/* Post results (lightweight cards since we don't have full post data with media) */}
            {(tab === 'all' || tab === 'posts') && searchResults.posts.length > 0 && (
              <div>
                {tab === 'all' && <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Posts</h3>}
                <div className="space-y-3">
                  {searchResults.posts.map((post, idx) => (
                    <Link
                      key={post.id}
                      to={`/post/${post.id}`}
                      ref={idx === searchResults.posts.length - 1 ? lastItemRef : null}
                      className="block bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4 hover:border-zinc-700/50 transition-all"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Avatar src={post.author?.avatar_url} alt={post.author?.display_name} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-bold text-white truncate">{post.author?.display_name}</span>
                            {post.author?.is_verified && <ShieldCheck size={12} className="text-indigo-400" />}
                            {post.author?.partner_tier === 'verified' && <ShieldCheck size={11} className="text-emerald-400" />}
                            {post.author?.partner_tier === 'blue' && <ShieldCheck size={11} className="text-blue-400" />}
                            {post.author?.partner_tier === 'gold' && <ShieldCheck size={11} className="text-amber-400" />}
                          </div>
                          <span className="text-xs text-zinc-500">@{post.author?.username}</span>
                        </div>
                        <div className="ml-auto flex items-center gap-2 text-xs text-zinc-600">
                          {post.post_type && (
                            <span className="bg-zinc-800/50 px-2 py-0.5 rounded-md capitalize">{post.post_type}</span>
                          )}
                          {post.media_count > 0 && (
                            <span className="bg-zinc-800/50 px-2 py-0.5 rounded-md">{post.media_count} media</span>
                          )}
                        </div>
                      </div>
                      {post.content && (
                        <p className="text-sm text-zinc-400 line-clamp-3 leading-relaxed">{post.content}</p>
                      )}
                      <div className="flex items-center gap-4 mt-3 text-xs text-zinc-600">
                        <span>{formatNumber(post.like_count || 0)} likes</span>
                        <span>{formatNumber(post.comment_count || 0)} comments</span>
                        <span className="ml-auto">{new Date(post.created_at).toLocaleDateString()}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Loading more indicator */}
            {searchLoading && (
              <div className="flex justify-center py-6">
                <Loader2 size={24} className="text-indigo-500 animate-spin" />
              </div>
            )}

            {/* No results */}
            {!searchLoading && searchResults.creators.length === 0 && searchResults.posts.length === 0 && searchResults.hashtags.length === 0 && (
              <div className="text-center py-16">
                <Search size={48} className="text-zinc-700 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-zinc-400">No results found</h3>
                <p className="text-sm text-zinc-600 mt-1">Try different keywords or check your spelling</p>
              </div>
            )}
          </div>
        )}

        {/* ── Default browse views ─── */}
        {tab === 'creators' && !isSearchMode && (
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
              posts.map(post => <VirtualizedPost key={post.id} post={post} />)
            ) : (
              <div className="text-center py-16">
                <TrendingUp size={48} className="text-zinc-700 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-zinc-400">Nothing trending yet</h3>
                <p className="text-sm text-zinc-600 mt-1">Be the first to post!</p>
              </div>
            )}
          </div>
        )}

        {/* Hashtag search results (from ?tag= URL) */}
        {tab === 'posts' && urlTag && (
          <div>
            {loading ? (
              <>
                <SkeletonPost />
                <SkeletonPost />
              </>
            ) : posts.length > 0 ? (
              posts.map(post => <VirtualizedPost key={post.id} post={post} />)
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
    </PullToRefresh>
  )
}
