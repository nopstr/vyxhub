import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { FEED_PAGE_SIZE } from '../lib/constants'

export const usePostStore = create((set, get) => ({
  posts: [],
  loading: false,
  hasMore: true,
  page: 0,

  fetchFeed: async (reset = false) => {
    const currentPage = reset ? 0 : get().page
    if (get().loading) return
    set({ loading: true })

    const from = currentPage * FEED_PAGE_SIZE
    const to = from + FEED_PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        author:profiles!author_id(*),
        media(*),
        likes(user_id, reaction_type),
        bookmarks(user_id)
      `)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      set({ loading: false })
      throw error
    }

    const newPosts = reset ? data : [...get().posts, ...data]
    set({
      posts: newPosts,
      loading: false,
      hasMore: data.length === FEED_PAGE_SIZE,
      page: currentPage + 1,
    })
    return data
  },

  fetchUserPosts: async (userId, reset = false) => {
    set({ loading: true })

    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        author:profiles!author_id(*),
        media(*),
        likes(user_id, reaction_type),
        bookmarks(user_id)
      `)
      .eq('author_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      set({ loading: false })
      throw error
    }

    set({ posts: data, loading: false })
    return data
  },

  createPost: async ({ content, visibility, postType, mediaFiles, userId, price, previewIndices, coverImageUrl }) => {
    const postInsert = {
      author_id: userId,
      content,
      visibility: visibility || 'public',
      post_type: postType || 'post',
    }

    if (price && price > 0) postInsert.price = price
    if (coverImageUrl) postInsert.cover_image_url = coverImageUrl

    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert(postInsert)
      .select(`
        *,
        author:profiles!author_id(*)
      `)
      .single()

    if (postError) throw postError

    if (mediaFiles?.length > 0) {
      const mediaInserts = []
      for (let i = 0; i < mediaFiles.length; i++) {
        const file = mediaFiles[i]
        const ext = file.name.split('.').pop()
        const filePath = `${userId}/${post.id}/${i}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('posts')
          .upload(filePath, file)

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
          .from('posts')
          .getPublicUrl(filePath)

        const isPreview = previewIndices ? previewIndices.includes(i) : false

        mediaInserts.push({
          post_id: post.id,
          uploader_id: userId,
          media_type: file.type.startsWith('video') ? 'video' : 'image',
          url: publicUrl,
          sort_order: i,
          file_size_bytes: file.size,
          is_preview: isPreview,
        })
      }

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

    post.likes = [] // reactions stored in likes table with reaction_type
    post.bookmarks = []
    set({ posts: [post, ...get().posts] })
    return post
  },

  deletePost: async (postId) => {
    const { error } = await supabase.from('posts').delete().eq('id', postId)
    if (error) throw error
    set({ posts: get().posts.filter(p => p.id !== postId) })
  },

  toggleReaction: async (postId, userId, reactionType = 'heart') => {
    const posts = get().posts
    const post = posts.find(p => p.id === postId)
    if (!post) return

    const existingReaction = post.likes?.find(
      l => l.user_id === userId && l.reaction_type === reactionType
    )

    if (existingReaction) {
      await supabase.from('likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId)
        .eq('reaction_type', reactionType)
    } else {
      await supabase.from('likes')
        .insert({ post_id: postId, user_id: userId, reaction_type: reactionType })
    }

    set({
      posts: posts.map(p => {
        if (p.id !== postId) return p
        const newLikes = existingReaction
          ? p.likes.filter(l => !(l.user_id === userId && l.reaction_type === reactionType))
          : [...(p.likes || []), { user_id: userId, reaction_type: reactionType }]
        return {
          ...p,
          like_count: existingReaction ? p.like_count - 1 : p.like_count + 1,
          likes: newLikes,
        }
      }),
    })
  },

  toggleBookmark: async (postId, userId) => {
    const posts = get().posts
    const post = posts.find(p => p.id === postId)
    if (!post) return

    const isBookmarked = post.bookmarks?.some(b => b.user_id === userId)

    if (isBookmarked) {
      await supabase.from('bookmarks').delete().eq('post_id', postId).eq('user_id', userId)
    } else {
      await supabase.from('bookmarks').insert({ post_id: postId, user_id: userId })
    }

    set({
      posts: posts.map(p => {
        if (p.id !== postId) return p
        return {
          ...p,
          bookmarks: isBookmarked
            ? p.bookmarks.filter(b => b.user_id !== userId)
            : [...(p.bookmarks || []), { user_id: userId }],
        }
      }),
    })
  },
}))
