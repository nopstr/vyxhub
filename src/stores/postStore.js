import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { FEED_PAGE_SIZE } from '../lib/constants'
import { validateFile, resolvePostMediaUrls, optimizeImage } from '../lib/storage'

// Throttle guards for mutations — prevents spam clicks / bot abuse
const _reactionThrottle = new Map() // postId:reactionType → timestamp
const _bookmarkThrottle = new Map() // postId → timestamp
const THROTTLE_MS = 500

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

// A5: Feed diversity — cap posts per creator and interleave content types
function diversifyFeed(posts, maxPerCreator = 3) {
  const creatorCounts = new Map()
  const result = []
  const deferred = []

  for (const post of posts) {
    const count = creatorCounts.get(post.author_id) || 0
    if (count < maxPerCreator) {
      result.push(post)
      creatorCounts.set(post.author_id, count + 1)
    } else {
      deferred.push(post)
    }
  }
  return [...result, ...deferred]
}

function mixContentTypes(posts) {
  if (posts.length < 6) return posts // too few to bother mixing
  const groups = {}
  posts.forEach(p => {
    const type = p.post_type || 'post'
    if (!groups[type]) groups[type] = []
    groups[type].push(p)
  })
  const types = Object.keys(groups).filter(k => groups[k].length > 0)
  if (types.length <= 1) return posts // only one type, nothing to mix
  const result = []
  let idx = 0
  while (result.length < posts.length) {
    const type = types[idx % types.length]
    if (groups[type].length > 0) {
      result.push(groups[type].shift())
    }
    idx++
    // Safety: prevent infinite loop if groups are empty
    if (types.every(t => groups[t].length === 0)) break
  }
  return result
}

export const usePostStore = create((set, get) => ({
  posts: [],
  loading: false,
  hasMore: true,
  page: 0,
  feedType: 'foryou', // 'foryou' | 'following'
  _feedCache: {}, // { foryou: {posts,page,hasMore}, following: {posts,page,hasMore} }

  setFeedType: (type) => {
    const s = get()
    if (type === s.feedType) return
    // Save current feed state to cache
    const cache = { ...s._feedCache }
    cache[s.feedType] = { posts: s.posts, page: s.page, hasMore: s.hasMore }
    // Restore target feed from cache or start fresh
    const restored = cache[type]
    set({
      _feedCache: cache,
      feedType: type,
      posts: restored?.posts || [],
      page: restored?.page || 0,
      hasMore: restored?.hasMore ?? true,
    })
  },

  // "For You" algorithm: personalized feed with diversity enforcement (A1 + A5 + A6)
  fetchFeed: async (reset = false, userId = null) => {
    if (get().loading) return

    if (reset) {
      const s = get()
      // Switching from another feed — save it, try to restore foryou from cache
      if (s.feedType !== 'foryou') {
        const cache = { ...s._feedCache }
        cache[s.feedType] = { posts: s.posts, page: s.page, hasMore: s.hasMore }
        const restored = cache.foryou
        if (restored?.posts.length > 0) {
          set({ _feedCache: cache, feedType: 'foryou', posts: restored.posts, page: restored.page, hasMore: restored.hasMore })
          return restored.posts
        }
        set({ _feedCache: cache, feedType: 'foryou' })
      }
    }

    const currentPage = reset ? 0 : get().page
    set({ loading: true })

    const from = currentPage * FEED_PAGE_SIZE

    try {
      let data, error

      // A1: Use personalized_feed RPC for algorithm + block filtering (A6)
      const personalized = await supabase.rpc('personalized_feed', {
        p_user_id: userId || null,
        p_limit: FEED_PAGE_SIZE,
        p_offset: from,
      })

      if (!personalized.error && personalized.data?.length > 0) {
        // RPC returns post IDs with scores — fetch full post data
        const postIds = personalized.data.map(p => p.id)
        const { data: fullPosts, error: fullError } = await supabase
          .from('posts')
          .select(POST_SELECT)
          .in('id', postIds)

        if (fullError) throw fullError

        // Sort by the personalized order
        const idOrder = new Map(postIds.map((id, i) => [id, i]))
        data = (fullPosts || []).sort((a, b) => (idOrder.get(a.id) ?? 99) - (idOrder.get(b.id) ?? 99))
        error = null
      } else {
        // Fallback: ranked_posts view or chronological
        const ranked = await supabase
          .from('ranked_posts')
          .select(POST_SELECT)
          .range(from, from + FEED_PAGE_SIZE - 1)

        if (ranked.error) {
          const fallback = await supabase
            .from('posts')
            .select(POST_SELECT)
            .order('created_at', { ascending: false })
            .range(from, from + FEED_PAGE_SIZE - 1)
          data = fallback.data
          error = fallback.error
        } else {
          data = ranked.data
          error = ranked.error
        }
      }

      if (error) throw error

      // A5: Feed diversity — cap per creator, mix content types
      data = diversifyFeed(data || [], 3)
      if (reset && currentPage === 0) {
        data = mixContentTypes(data)
      }

      // Resolve protected media to short-lived signed URLs
      await resolvePostMediaUrls(data)

      // Track views (single batch RPC instead of N individual calls)
      if (data?.length > 0) {
        const postIds = data.map(p => p.id)
        supabase.rpc('increment_view_counts', { p_post_ids: postIds }).then(({ error }) => {
          if (error) console.error('Failed to increment view counts:', error)
        })
      }

      const newPosts = reset ? data : [...get().posts, ...data]
      set({
        posts: newPosts,
        loading: false,
        hasMore: data.length === FEED_PAGE_SIZE,
        page: currentPage + 1,
      })
      return data
    } catch (error) {
      set({ loading: false, hasMore: false })
      console.error('Feed fetch error:', error)
    }
  },

  // "Following" feed: only posts from people the user follows
  fetchFollowingFeed: async (userId, reset = false) => {
    if (get().loading) return

    if (reset) {
      const s = get()
      // Switching from another feed — save it, try to restore following from cache
      if (s.feedType !== 'following') {
        const cache = { ...s._feedCache }
        cache[s.feedType] = { posts: s.posts, page: s.page, hasMore: s.hasMore }
        const restored = cache.following
        if (restored?.posts.length > 0) {
          set({ _feedCache: cache, feedType: 'following', posts: restored.posts, page: restored.page, hasMore: restored.hasMore })
          return restored.posts
        }
        set({ _feedCache: cache, feedType: 'following' })
      }
    }

    const currentPage = reset ? 0 : get().page
    set({ loading: true })

    try {
      // Get IDs of followed users and subscribed creators
      const [followsRes, subsRes] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', userId),
        supabase.from('subscriptions').select('creator_id').eq('subscriber_id', userId).eq('status', 'active')
      ])

      if (followsRes.error) throw followsRes.error
      if (subsRes.error) throw subsRes.error

      const followIds = followsRes.data?.map(f => f.following_id) || []
      const subIds = subsRes.data?.map(s => s.creator_id) || []
      
      // Combine and deduplicate IDs
      const targetIds = [...new Set([...followIds, ...subIds])]

      if (targetIds.length === 0) {
        set({ posts: reset ? [] : get().posts, loading: false, hasMore: false })
        return []
      }

      const from = currentPage * FEED_PAGE_SIZE
      const to = from + FEED_PAGE_SIZE - 1

      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .in('author_id', targetIds)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error

      // Resolve protected media to short-lived signed URLs
      await resolvePostMediaUrls(data)

      const newPosts = reset ? data : [...get().posts, ...data]
      set({
        posts: newPosts,
        loading: false,
        hasMore: data.length === FEED_PAGE_SIZE,
        page: currentPage + 1,
      })
      return data
    } catch (error) {
      set({ loading: false, hasMore: false })
      console.error('Following feed fetch error:', error)
    }
  },

  fetchUserPosts: async (userId) => {
    set({ loading: true })

    try {
      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('author_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Resolve protected media to short-lived signed URLs
      await resolvePostMediaUrls(data)

      set({ posts: data, loading: false })
      return data
    } catch (error) {
      set({ loading: false })
      throw error
    }
  },

  createScheduledPost: async ({ content, visibility, postType, mediaFiles, userId, price, previewIndices, scheduledFor, onProgress }) => {
    // 1. Insert scheduled post row
    const { data: scheduledPost, error: postError } = await supabase
      .from('scheduled_posts')
      .insert({
        author_id: userId,
        scheduled_by: userId,
        content,
        post_type: postType,
        visibility,
        price: price || 0,
        scheduled_for: scheduledFor,
      })
      .select()
      .single()

    if (postError) throw postError

    // 2. Upload media if any
    if (mediaFiles?.length > 0) {
      for (const file of mediaFiles) {
        validateFile(file)
      }

      let completedUploads = 0;
      const totalUploads = mediaFiles.length;

      const uploadResults = await Promise.all(
        mediaFiles.map(async (file, i) => {
          const optimizedFile = await optimizeImage(file)
          const ext = optimizedFile.name.split('.').pop()
          const filePath = `${userId}/scheduled_${scheduledPost.id}/${i}.${ext}`
          
          const { error: uploadError } = await supabase.storage
            .from('posts')
            .upload(filePath, optimizedFile)
          if (uploadError) throw uploadError
          
          completedUploads++;
          if (onProgress) {
            onProgress(Math.round((completedUploads / totalUploads) * 100));
          }

          const isPreview = previewIndices ? previewIndices.includes(i) : false
          return {
            url: filePath,
            type: file.type.startsWith('video') ? 'video' : 'image',
            is_preview: isPreview
          }
        })
      )

      // 3. Update scheduled post with media URLs
      const { error: updateError } = await supabase
        .from('scheduled_posts')
        .update({ media_urls: uploadResults })
        .eq('id', scheduledPost.id)

      if (updateError) throw updateError
    }

    return scheduledPost
  },

  createPost: async ({ content, visibility, postType, mediaFiles, userId, price, previewIndices, coverImageUrl, category, isDraft, pollData, onProgress }) => {
    const postInsert = {
      author_id: userId,
      content,
      visibility: visibility || 'public',
      post_type: postType || 'post',
      is_draft: isDraft || false,
    }

    if (price && price > 0) postInsert.price = price
    if (coverImageUrl) postInsert.cover_image_url = coverImageUrl
    if (category) postInsert.category = category

    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert(postInsert)
      .select(`
        *,
        author:profiles!author_id(*)
      `)
      .single()

    if (postError) throw postError

    // Handle Poll Creation
    if (pollData && pollData.question && pollData.options?.length >= 2) {
      const { data: poll, error: pollError } = await supabase
        .from('polls')
        .insert({
          post_id: post.id,
          question: pollData.question,
          ends_at: new Date(Date.now() + (pollData.durationDays || 1) * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single()

      if (pollError) throw pollError

      const pollOptions = pollData.options.map((opt, idx) => ({
        poll_id: poll.id,
        option_text: opt,
        sort_order: idx
      }))

      const { error: optionsError } = await supabase
        .from('poll_options')
        .insert(pollOptions)

      if (optionsError) throw optionsError
    }

    if (mediaFiles?.length > 0) {
      // Validate all files first
      for (const file of mediaFiles) {
        validateFile(file)
      }

      let completedUploads = 0;
      const totalUploads = mediaFiles.length;

      // Upload all files in parallel for faster post creation
      const uploadResults = await Promise.all(
        mediaFiles.map(async (file, i) => {
          const optimizedFile = await optimizeImage(file)
          const ext = optimizedFile.name.split('.').pop()
          const filePath = `${userId}/${post.id}/${i}.${ext}`
          
          // We don't have a real progress callback from supabase storage upload yet,
          // but we can simulate it or just rely on the loading state.
          // For a real implementation, we'd need to use XMLHttpRequest or a custom fetch
          // to track upload progress. For now, we'll just await the upload.
          
          let cloudflareUid = null;
          let cloudflarePlaybackUrl = null;
          let cloudflareThumbnailUrl = null;

          if (file.type.startsWith('video/')) {
            // 1. Request Cloudflare Stream direct upload URL via Edge Function
            const { data: cfData, error: cfError } = await supabase.functions.invoke('cloudflare-stream-upload', {
              body: {
                uploadLength: file.size,
                metadata: btoa(JSON.stringify({ name: file.name, uploader: userId }))
              }
            });

            if (cfError) throw cfError;

            const { uploadUrl, streamMediaId } = cfData;
            cloudflareUid = streamMediaId;

            // 2. Upload directly to Cloudflare using TUS protocol (simplified for now)
            const uploadResponse = await fetch(uploadUrl, {
              method: 'PATCH',
              headers: {
                'Tus-Resumable': '1.0.0',
                'Upload-Offset': '0',
                'Content-Type': 'application/offset+octet-stream'
              },
              body: file
            });

            if (!uploadResponse.ok) {
              throw new Error('Failed to upload video to Cloudflare Stream');
            }

            // Cloudflare URLs follow a standard format based on the UID
            // Note: The video won't be ready to stream immediately, it needs to process
            cloudflarePlaybackUrl = `https://customer-${import.meta.env.VITE_CLOUDFLARE_CUSTOMER_CODE}.cloudflarestream.com/${cloudflareUid}/manifest/video.m3u8`;
            cloudflareThumbnailUrl = `https://customer-${import.meta.env.VITE_CLOUDFLARE_CUSTOMER_CODE}.cloudflarestream.com/${cloudflareUid}/thumbnails/thumbnail.jpg`;
          } else {
            // Standard image upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
              .from('posts')
              .upload(filePath, optimizedFile)
            if (uploadError) throw uploadError
          }
          
          completedUploads++;
          if (onProgress) {
            onProgress(Math.round((completedUploads / totalUploads) * 100));
          }

          return { file: optimizedFile, filePath, index: i, cloudflareUid, cloudflarePlaybackUrl, cloudflareThumbnailUrl }
        })
      )

      const mediaInserts = uploadResults.map(({ file, filePath, index, cloudflareUid, cloudflarePlaybackUrl, cloudflareThumbnailUrl }) => {
        const isPreview = previewIndices ? previewIndices.includes(index) : false
        return {
          post_id: post.id,
          uploader_id: userId,
          media_type: file.type.startsWith('video') ? 'video' : 'image',
          url: filePath, // Store storage path — resolved to signed URL at display time
          sort_order: index,
          file_size_bytes: file.size,
          is_preview: isPreview,
          cloudflare_uid: cloudflareUid,
          cloudflare_playback_url: cloudflarePlaybackUrl,
          cloudflare_thumbnail_url: cloudflareThumbnailUrl,
          cloudflare_ready_to_stream: false // Will be updated via webhook later
        }
      })

      const { error: mediaError } = await supabase
        .from('media')
        .insert(mediaInserts)

      if (mediaError) throw mediaError

      const { data: mediaData } = await supabase
        .from('media')
        .select('*')
        .eq('post_id', post.id)

      post.media = mediaData
    } else {
      post.media = []
    }

    // Resolve media to signed URLs for the newly created post
    await resolvePostMediaUrls(post)

    post.likes = [] // reactions stored in likes table with reaction_type
    post.bookmarks = []
    set({ posts: [post, ...get().posts] })
    return post
  },

  deletePost: async (postId) => {
    // M8: Clean up storage files before deleting the post row
    try {
      const { data: mediaRows } = await supabase
        .from('media')
        .select('url')
        .eq('post_id', postId)

      if (mediaRows?.length > 0) {
        const paths = mediaRows.map(m => m.url).filter(Boolean)
        if (paths.length > 0) {
          await supabase.storage.from('posts').remove(paths)
        }
      }
    } catch (cleanupErr) {
      console.warn('Storage cleanup failed (non-blocking):', cleanupErr)
    }

    const { error } = await supabase.from('posts').delete().eq('id', postId)
    if (error) throw error
    set({ posts: get().posts.filter(p => p.id !== postId) })
  },

  hidePost: async (postId, userId) => {
    if (!userId) return
    
    // Optimistic update
    set({ posts: get().posts.filter(p => p.id !== postId) })
    
    try {
      const { error } = await supabase
        .from('hidden_posts')
        .insert({ user_id: userId, post_id: postId })
        
      if (error) throw error
    } catch (err) {
      console.error('Failed to hide post:', err)
      // Revert optimistic update if needed, but usually fine to leave it hidden in UI
    }
  },

  toggleReaction: async (postId, userId, reactionType = 'heart') => {
    // Throttle: ignore rapid-fire clicks (500ms cooldown)
    const throttleKey = `${postId}:${reactionType}`
    const now = Date.now()
    if (_reactionThrottle.get(throttleKey) > now - THROTTLE_MS) return
    _reactionThrottle.set(throttleKey, now)

    const posts = get().posts
    const post = posts.find(p => p.id === postId)
    if (!post) return

    const existingReaction = post.likes?.find(
      l => l.user_id === userId && l.reaction_type === reactionType
    )

    // Optimistic update first for instant UI feedback
    const optimisticPosts = posts.map(p => {
      if (p.id !== postId) return p
      const newLikes = existingReaction
        ? p.likes.filter(l => !(l.user_id === userId && l.reaction_type === reactionType))
        : [...(p.likes || []), { user_id: userId, reaction_type: reactionType }]
      return {
        ...p,
        like_count: existingReaction ? Math.max(0, p.like_count - 1) : p.like_count + 1,
        likes: newLikes,
      }
    })
    set({ posts: optimisticPosts })

    try {
      if (existingReaction) {
        const { error } = await supabase.from('likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', userId)
          .eq('reaction_type', reactionType)
        if (error) throw error
      } else {
        const { error } = await supabase.from('likes')
          .insert({ post_id: postId, user_id: userId, reaction_type: reactionType })
        if (error) throw error
      }
    } catch (err) {
      console.error('Failed to toggle reaction:', err)
      // Revert optimistic update on failure
      set({ posts })
    }
  },

  toggleBookmark: async (postId, userId) => {
    // Throttle: ignore rapid-fire clicks (500ms cooldown)
    const now = Date.now()
    if (_bookmarkThrottle.get(postId) > now - THROTTLE_MS) return
    _bookmarkThrottle.set(postId, now)

    const posts = get().posts
    const post = posts.find(p => p.id === postId)
    if (!post) return

    const isBookmarked = post.bookmarks?.some(b => b.user_id === userId)

    // Optimistic update first
    const optimisticPosts = posts.map(p => {
      if (p.id !== postId) return p
      return {
        ...p,
        bookmarks: isBookmarked
          ? p.bookmarks.filter(b => b.user_id !== userId)
          : [...(p.bookmarks || []), { user_id: userId }],
      }
    })
    set({ posts: optimisticPosts })

    try {
      if (isBookmarked) {
        const { error } = await supabase.from('bookmarks').delete().eq('post_id', postId).eq('user_id', userId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('bookmarks').insert({ post_id: postId, user_id: userId })
        if (error) throw error
      }
    } catch {
      // Revert optimistic update on failure
      set({ posts })
    }
  },

  togglePin: async (postId, pin) => {
    const { error } = await supabase
      .from('posts')
      .update({ is_pinned: pin })
      .eq('id', postId)
    if (error) throw error
    set({
      posts: get().posts.map(p =>
        p.id === postId ? { ...p, is_pinned: pin, pinned_at: pin ? new Date().toISOString() : null } : p
      ),
    })
  },

  repost: async (originalPostId, userId) => {
    // Create a new post that references the original
    const { data, error } = await supabase
      .from('posts')
      .insert({
        author_id: userId,
        repost_of: originalPostId,
        reposted_by: userId,
        visibility: 'public',
        post_type: 'post',
      })
      .select(`
        *,
        author:profiles!author_id(*)
      `)
      .single()

    if (error) throw error

    data.likes = []
    data.bookmarks = []
    data.media = []
    set({ posts: [data, ...get().posts] })
    return data
  },
}))
