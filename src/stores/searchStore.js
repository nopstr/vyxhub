import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useSearchStore = create((set, get) => ({
  // Autocomplete state
  suggestions: [],
  loadingSuggestions: false,

  // Full search state
  results: { creators: [], posts: [], hashtags: [] },
  loading: false,
  totalResults: { creators: 0, posts: 0, hashtags: 0 },

  // Search history
  recentSearches: [],

  // Filters
  filters: {
    type: 'all',      // 'all', 'creators', 'posts', 'hashtags'
    sort: 'relevance', // 'relevance', 'latest', 'popular'
    mediaType: null,   // null, 'image', 'video', 'set'
    dateFrom: null,
    dateTo: null,
    verifiedOnly: false,
  },

  query: '',
  page: 0,
  hasMore: true,
  PAGE_SIZE: 20,

  setQuery: (query) => set({ query }),

  setFilter: (key, value) => {
    set(state => ({
      filters: { ...state.filters, [key]: value },
      results: { creators: [], posts: [], hashtags: [] },
      page: 0,
      hasMore: true,
    }))
  },

  resetFilters: () => set({
    filters: {
      type: 'all',
      sort: 'relevance',
      mediaType: null,
      dateFrom: null,
      dateTo: null,
      verifiedOnly: false,
    },
    page: 0,
    hasMore: true,
  }),

  // ── Autocomplete (fast, lightweight) ─────────────────────────
  fetchAutocomplete: async (query, userId) => {
    if (!query || query.length < 1) {
      // Show recent searches
      const state = get()
      set({ suggestions: state.recentSearches.map(s => ({ item_type: 'recent', label: s.query, item_id: s.id })) })
      return
    }

    set({ loadingSuggestions: true })
    try {
      const { data, error } = await supabase.rpc('search_autocomplete', {
        p_user_id: userId || null,
        p_query: query,
        p_limit: 8,
      })

      if (error) throw error
      set({ suggestions: data || [] })
    } catch (err) {
      console.error('Autocomplete error:', err)
      set({ suggestions: [] })
    } finally {
      set({ loadingSuggestions: false })
    }
  },

  clearSuggestions: () => set({ suggestions: [] }),

  // ── Full search (with filters) ──────────────────────────────
  search: async (query, userId, reset = true) => {
    const state = get()
    const q = query?.trim()
    if (!q) return

    const offset = reset ? 0 : state.page * state.PAGE_SIZE
    set({ loading: true, ...(reset ? { results: { creators: [], posts: [], hashtags: [] }, page: 0, hasMore: true } : {}) })

    try {
      const { data, error } = await supabase.rpc('unified_search', {
        p_user_id: userId || null,
        p_query: q,
        p_type: state.filters.type,
        p_sort: state.filters.sort,
        p_media_type: state.filters.mediaType,
        p_date_from: state.filters.dateFrom,
        p_date_to: state.filters.dateTo,
        p_verified_only: state.filters.verifiedOnly,
        p_limit: state.PAGE_SIZE,
        p_offset: offset,
      })

      if (error) throw error

      const rows = data || []
      const creators = rows.filter(r => r.result_type === 'creator').map(r => ({
        id: r.result_id,
        username: r.username,
        display_name: r.display_name,
        avatar_url: r.avatar_url,
        banner_url: r.banner_url,
        bio: r.bio,
        is_verified: r.is_verified,
        is_creator: r.is_creator,
        follower_count: r.follower_count,
        post_count: r.post_count,
        subscription_price: r.subscription_price,
        relevance: r.relevance_score,
      }))

      const posts = rows.filter(r => r.result_type === 'post').map(r => ({
        id: r.result_id,
        content: r.post_content,
        post_type: r.post_type,
        visibility: r.post_visibility,
        author_id: r.post_author_id,
        author: {
          username: r.post_author_username,
          display_name: r.post_author_display_name,
          avatar_url: r.post_author_avatar,
          is_verified: r.post_author_verified,
        },
        like_count: r.post_like_count,
        comment_count: r.post_comment_count,
        created_at: r.post_created_at,
        media_count: r.post_media_count,
        relevance: r.relevance_score,
      }))

      const hashtags = rows.filter(r => r.result_type === 'hashtag').map(r => ({
        id: r.result_id,
        name: r.hashtag_name,
        post_count: r.hashtag_post_count,
        relevance: r.relevance_score,
      }))

      // Get total counts from first row of each type
      const creatorTotal = rows.find(r => r.result_type === 'creator')?.total_results || 0
      const postTotal = rows.find(r => r.result_type === 'post')?.total_results || 0
      const hashtagTotal = rows.find(r => r.result_type === 'hashtag')?.total_results || 0

      set(prev => ({
        results: reset
          ? { creators, posts, hashtags }
          : {
            creators: [...prev.results.creators, ...creators],
            posts: [...prev.results.posts, ...posts],
            hashtags: [...prev.results.hashtags, ...hashtags],
          },
        totalResults: { creators: Number(creatorTotal), posts: Number(postTotal), hashtags: Number(hashtagTotal) },
        page: reset ? 1 : prev.page + 1,
        hasMore: rows.length >= state.PAGE_SIZE,
      }))

      // Save to search history (fire & forget)
      if (userId && reset) {
        supabase.rpc('save_search_query', {
          p_user_id: userId,
          p_query: q,
          p_result_type: state.filters.type,
          p_result_count: Number(creatorTotal) + Number(postTotal) + Number(hashtagTotal),
        }).catch(() => {})
      }
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      set({ loading: false })
    }
  },

  loadMore: async (query, userId) => {
    const state = get()
    if (state.loading || !state.hasMore) return
    await get().search(query, userId, false)
  },

  // ── Search history ──────────────────────────────────────────
  fetchSearchHistory: async (userId) => {
    if (!userId) return
    const { data } = await supabase
      .from('search_history')
      .select('id, query, result_type, result_count, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)

    set({ recentSearches: data || [] })
  },

  deleteSearchItem: async (id) => {
    await supabase.from('search_history').delete().eq('id', id)
    set(state => ({
      recentSearches: state.recentSearches.filter(s => s.id !== id),
    }))
  },

  clearSearchHistory: async (userId) => {
    if (!userId) return
    await supabase.rpc('clear_search_history', { p_user_id: userId })
    set({ recentSearches: [] })
  },

  clearResults: () => set({
    results: { creators: [], posts: [], hashtags: [] },
    totalResults: { creators: 0, posts: 0, hashtags: 0 },
    query: '',
    page: 0,
    hasMore: true,
  }),
}))
