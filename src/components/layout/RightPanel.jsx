import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { Search, Flame, ShieldCheck, Hash, TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import Avatar from '../ui/Avatar'
import Badge from '../ui/Badge'
import { debounce, formatNumber } from '../../lib/utils'

function TrendingSection() {
  const [trending, setTrending] = useState([])

  const fetchTrending = async () => {
    // A3: Try materialized view first (velocity-based trending)
    const { data: matData, error: matError } = await supabase
      .from('trending_creators')
      .select('*')
      .order('trending_score', { ascending: false })
      .limit(4)

    if (!matError && matData?.length > 0) {
      setTrending(matData)
      return
    }

    // Fallback: popularity sort
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_verified, follower_count')
      .eq('is_creator', true)
      .order('follower_count', { ascending: false })
      .limit(4)

    setTrending(data || [])
  }

  useEffect(() => {
    fetchTrending()
  }, [])

  if (trending.length === 0) return null

  return (
    <section>
      <h3 className="font-bold text-sm text-zinc-400 uppercase tracking-wider mb-4 px-1 flex items-center gap-1.5">
        <TrendingUp size={14} className="text-orange-400" />
        Trending Creators
      </h3>
      <div className="space-y-1">
        {trending.map(creator => (
          <Link
            key={creator.username || creator.id}
            to={`/@${creator.username}`}
            className="block p-3 rounded-2xl hover:bg-zinc-800/30 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <Avatar src={creator.avatar_url} alt={creator.display_name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <p className="font-bold text-sm text-white truncate">{creator.display_name}</p>
                  {creator.is_verified && <ShieldCheck size={12} className="text-indigo-400 flex-shrink-0" />}
                </div>
                <p className="text-xs text-zinc-500">@{creator.username}</p>
              </div>
              {creator.new_followers_24h > 0 && (
                <span className="text-[10px] text-orange-400 font-bold bg-orange-500/10 px-1.5 py-0.5 rounded-md">
                  +{formatNumber(creator.new_followers_24h)}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function TrendingHashtags() {
  const [hashtags, setHashtags] = useState([])

  const fetchHashtags = async () => {
    const { data } = await supabase.rpc('trending_hashtags', { p_limit: 5 })
    setHashtags(data || [])
  }

  useEffect(() => {
    fetchHashtags()
  }, [])

  if (hashtags.length === 0) return null

  return (
    <section>
      <h3 className="font-bold text-sm text-zinc-400 uppercase tracking-wider mb-4 px-1 flex items-center gap-1.5">
        <Hash size={14} className="text-indigo-400" />
        Trending Tags
      </h3>
      <div className="space-y-1">
        {hashtags.map(tag => (
          <Link
            key={tag.hashtag_name}
            to={`/explore?tag=${tag.hashtag_name}`}
            className="block p-2.5 rounded-2xl hover:bg-zinc-800/30 cursor-pointer transition-colors"
          >
            <p className="text-sm font-bold text-white">#{tag.hashtag_name}</p>
            <p className="text-xs text-zinc-500">{formatNumber(tag.hashtag_post_count)} posts · {formatNumber(tag.recent_posts)} today</p>
          </Link>
        ))}
      </div>
    </section>
  )
}

function SuggestedCreators() {
  const { user } = useAuthStore()
  const [suggestions, setSuggestions] = useState([])

  const fetchSuggestions = async () => {
    // A4: Try collaborative filtering RPC first
    if (user) {
      const { data: cfData, error: cfError } = await supabase
        .rpc('suggest_creators', { p_user_id: user.id, p_limit: 5 })

      if (!cfError && cfData?.length > 0) {
        setSuggestions(cfData)
        return
      }
    }

    // Fallback: popularity with exclusion
    let excludeIds = []
    if (user) {
      excludeIds.push(user.id)
      const { data: followed } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
      if (followed?.length) {
        excludeIds.push(...followed.map(f => f.following_id))
      }
    }

    let query = supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_verified, follower_count')
      .eq('is_creator', true)
      .order('follower_count', { ascending: false })
      .limit(5)

    if (excludeIds.length > 0) {
      query = query.not('id', 'in', `(${excludeIds.join(',')})`)
    }

    const { data } = await query
    setSuggestions(data || [])
  }

  useEffect(() => {
    fetchSuggestions()
  }, [user])

  if (suggestions.length === 0) return null

  return (
    <section>
      <h3 className="font-bold text-sm text-zinc-400 uppercase tracking-wider mb-4 px-1">Suggested Creators</h3>
      <div className="space-y-2">
        {suggestions.map(creator => (
          <Link
            key={creator.creator_id || creator.id}
            to={`/@${creator.username}`}
            className="flex items-center gap-3 p-3 rounded-2xl hover:bg-zinc-800/30 transition-colors"
          >
            <Avatar src={creator.avatar_url} alt={creator.display_name} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-white truncate">{creator.display_name}</span>
                {creator.is_verified && <ShieldCheck size={14} className="text-indigo-400 flex-shrink-0" />}
              </div>
              <span className="text-xs text-zinc-500">@{creator.username}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function RightPanel() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showResults, setShowResults] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const performSearch = useCallback(
    debounce(async (query) => {
      if (!query || query.length < 2) {
        setSearchResults([])
        setShowResults(false)
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_verified, is_creator')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(5)

      setSearchResults(data || [])
      setShowResults(true)
    }, 300),
    []
  )

  // Hide on certain pages
  if (['/messages', '/settings'].some(p => location.pathname.startsWith(p))) {
    return null
  }

  const handleSearch = (e) => {
    const q = e.target.value
    setSearchQuery(q)
    performSearch(q)
  }

  return (
    <aside className="hidden lg:block w-80 sticky top-0 h-screen overflow-y-auto no-scrollbar py-6 pl-6 pr-4 border-l border-zinc-800/50">
      {/* Search */}
      <div className="relative mb-8">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearch}
          onFocus={() => searchResults.length > 0 && setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
          placeholder="Search VyxHub..."
          className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-indigo-500/50 transition-colors"
        />

        {/* Search results dropdown */}
        {showResults && searchResults.length > 0 && (
          <div className="absolute top-full mt-2 left-0 right-0 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl z-50 py-2 max-h-64 overflow-y-auto">
            {searchResults.map(user => (
              <button
                key={user.id}
                onMouseDown={() => { navigate(`/@${user.username}`); setShowResults(false); setSearchQuery('') }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/50 transition-colors cursor-pointer"
              >
                <Avatar src={user.avatar_url} alt={user.display_name} size="sm" />
                <div className="text-left min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold text-white truncate">{user.display_name}</span>
                    {user.is_verified && <ShieldCheck size={12} className="text-indigo-400" />}
                  </div>
                  <span className="text-xs text-zinc-500">@{user.username}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-8">
        <TrendingSection />
        <TrendingHashtags />
        <SuggestedCreators />

        {/* Footer Links */}
        <div className="text-[11px] text-zinc-600 space-x-2 px-1 leading-relaxed">
          <span className="hover:text-zinc-400 cursor-pointer">Terms</span>
          <span>·</span>
          <span className="hover:text-zinc-400 cursor-pointer">Privacy</span>
          <span>·</span>
          <span className="hover:text-zinc-400 cursor-pointer">DMCA</span>
          <span>·</span>
          <span className="hover:text-zinc-400 cursor-pointer">Support</span>
          <p className="mt-2">© 2026 VyxHub</p>
        </div>
      </div>
    </aside>
  )
}
