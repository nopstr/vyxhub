import { create } from 'zustand'
import { supabase } from '../lib/supabase'

/**
 * Subscription cache to avoid N+1 queries per PostCard.
 * Batch-loads all active subscriptions for the logged-in user once,
 * then provides O(1) lookups.
 */
export const useSubscriptionCache = create((set, get) => ({
  // Set of creator IDs the current user is subscribed to
  subscribedTo: new Set(),
  // Set of post IDs the user has purchased
  purchasedPosts: new Set(),
  // Loading state
  loaded: false,
  loading: false,
  userId: null,

  /** Load all subscriptions + purchases for a user (called once on feed mount) */
  loadForUser: async (userId) => {
    if (!userId) return
    // Skip if already loaded for this user
    if (get().loaded && get().userId === userId) return
    if (get().loading) return

    set({ loading: true })

    try {
      // Batch fetch subscriptions and purchases in parallel
      const [subResult, purchResult] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('creator_id')
          .eq('subscriber_id', userId)
          .eq('status', 'active')
          .gt('expires_at', new Date().toISOString()),
        supabase
          .from('purchases')
          .select('post_id')
          .eq('buyer_id', userId),
      ])

      const subscribedTo = new Set(
        (subResult.data || []).map((s) => s.creator_id)
      )
      const purchasedPosts = new Set(
        (purchResult.data || []).map((p) => p.post_id)
      )

      set({ subscribedTo, purchasedPosts, loaded: true, loading: false, userId })
    } catch {
      set({ loading: false })
    }
  },

  /** O(1) check if subscribed to a creator */
  isSubscribedTo: (creatorId) => get().subscribedTo.has(creatorId),

  /** O(1) check if a post was purchased */
  hasPurchasedPost: (postId) => get().purchasedPosts.has(postId),

  /** Add a subscription (after subscribing) */
  addSubscription: (creatorId) => {
    const next = new Set(get().subscribedTo)
    next.add(creatorId)
    set({ subscribedTo: next })
  },

  /** Add a purchase (after buying PPV) */
  addPurchase: (postId) => {
    const next = new Set(get().purchasedPosts)
    next.add(postId)
    set({ purchasedPosts: next })
  },

  /** Clear cache on logout */
  clear: () => set({ subscribedTo: new Set(), purchasedPosts: new Set(), loaded: false, userId: null }),
}))
