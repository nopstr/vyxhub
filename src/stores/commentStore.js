import { create } from 'zustand'
import { supabase } from '../lib/supabase'

/**
 * Comment store — centralised CRUD for post comments.
 * Supports threaded replies (1 level deep via parent_id).
 * Optimistic updates on create/delete for instant UI feedback.
 */
export const useCommentStore = create((set, get) => ({
  // Map<postId, Comment[]> — avoids re-fetching when switching posts
  commentsByPost: {},
  loading: false,

  /**
   * Fetch all comments for a post, including author profiles and replies.
   * Flat list — threading is done client-side via parent_id.
   */
  fetchComments: async (postId) => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('comments')
      .select(`
        *,
        author:profiles!author_id(id, username, display_name, avatar_url, is_verified)
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true })

    if (!error) {
      set(state => ({
        commentsByPost: {
          ...state.commentsByPost,
          [postId]: data || [],
        },
        loading: false,
      }))
    } else {
      set({ loading: false })
    }
    return data || []
  },

  /**
   * Add a comment (or reply if parentId is provided).
   * Optimistically appends to the local list before the server confirms.
   */
  addComment: async (postId, authorId, content, parentId = null) => {
    // Optimistic: insert a temporary comment
    const tempId = `temp-${Date.now()}`
    const tempComment = {
      id: tempId,
      post_id: postId,
      author_id: authorId,
      content,
      parent_id: parentId,
      like_count: 0,
      created_at: new Date().toISOString(),
      author: null, // Will be filled on re-fetch
      _optimistic: true,
    }

    set(state => ({
      commentsByPost: {
        ...state.commentsByPost,
        [postId]: [...(state.commentsByPost[postId] || []), tempComment],
      },
    }))

    const { data, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        author_id: authorId,
        content,
        parent_id: parentId,
      })
      .select(`
        *,
        author:profiles!author_id(id, username, display_name, avatar_url, is_verified)
      `)
      .single()

    if (error) {
      // Revert optimistic insert
      set(state => ({
        commentsByPost: {
          ...state.commentsByPost,
          [postId]: (state.commentsByPost[postId] || []).filter(c => c.id !== tempId),
        },
      }))
      return null
    }

    // Replace temp with real comment
    set(state => ({
      commentsByPost: {
        ...state.commentsByPost,
        [postId]: (state.commentsByPost[postId] || []).map(c =>
          c.id === tempId ? data : c
        ),
      },
    }))

    return data
  },

  /**
   * Delete a comment. Optimistically removes from list.
   */
  deleteComment: async (postId, commentId) => {
    const prev = get().commentsByPost[postId] || []

    // Optimistic remove
    set(state => ({
      commentsByPost: {
        ...state.commentsByPost,
        [postId]: prev.filter(c => c.id !== commentId),
      },
    }))

    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)

    if (error) {
      // Revert
      set(state => ({
        commentsByPost: {
          ...state.commentsByPost,
          [postId]: prev,
        },
      }))
    }
  },

  /**
   * Get comments for a specific post from the cache.
   * Returns [] if not yet loaded.
   */
  getComments: (postId) => {
    return get().commentsByPost[postId] || []
  },

  /**
   * Build a threaded structure from the flat comment list.
   * Returns top-level comments with a `replies` array.
   */
  getThreaded: (postId) => {
    const comments = get().commentsByPost[postId] || []
    const topLevel = comments.filter(c => !c.parent_id)
    const byParent = {}
    comments.forEach(c => {
      if (c.parent_id) {
        if (!byParent[c.parent_id]) byParent[c.parent_id] = []
        byParent[c.parent_id].push(c)
      }
    })
    return topLevel.map(c => ({
      ...c,
      replies: byParent[c.id] || [],
    }))
  },
}))
