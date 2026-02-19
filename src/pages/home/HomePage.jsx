import { useEffect, useState, useRef } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { usePostStore } from '../../stores/postStore'
import { useSubscriptionCache } from '../../stores/subscriptionCache'
import CreatePost from '../../components/feed/CreatePost'

import PostCard from '../../components/feed/PostCard'
import { SkeletonPost } from '../../components/ui/Spinner'
import { useInView } from 'react-intersection-observer'

export default function HomePage() {
  const { user, profile } = useAuthStore()
  const { posts, loading, hasMore, fetchFeed, fetchFollowingFeed } = usePostStore()
  const loadForUser = useSubscriptionCache((s) => s.loadForUser)
  const [tab, setTab] = useState('foryou')
  const { ref, inView } = useInView({ threshold: 0 })
  const initialLoadDone = useRef(false)

  // Pre-load subscription cache once when user is available
  useEffect(() => {
    if (user?.id) loadForUser(user.id)
  }, [user?.id, loadForUser])

  // Initial load + tab change
  useEffect(() => {
    initialLoadDone.current = false
    if (tab === 'following' && user) {
      fetchFollowingFeed(user.id, true).then(() => { initialLoadDone.current = true })
    } else {
      fetchFeed(true, user?.id || null).then(() => { initialLoadDone.current = true })
    }
  }, [tab, user?.id, fetchFeed, fetchFollowingFeed])

  // Infinite scroll — only after initial load
  useEffect(() => {
    if (!initialLoadDone.current) return
    if (inView && hasMore && !loading) {
      if (tab === 'following' && user) {
        fetchFollowingFeed(user.id, false)
      } else {
        fetchFeed(false, user?.id || null)
      }
    }
  }, [inView, hasMore, loading, tab, user?.id, fetchFeed, fetchFollowingFeed])

  const handleTabChange = (newTab) => {
    if (newTab === tab) return
    setTab(newTab)
  }

  return (
    <div>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50">
        <div className="flex">
          <button
            onClick={() => handleTabChange('foryou')}
            className={`flex-1 py-4 text-sm font-semibold transition-colors relative cursor-pointer ${
              tab === 'foryou' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            For You
            {tab === 'foryou' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-indigo-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => handleTabChange('following')}
            className={`flex-1 py-4 text-sm font-semibold transition-colors relative cursor-pointer ${
              tab === 'following' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Following
            {tab === 'following' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-indigo-500 rounded-full" />
            )}
          </button>
        </div>
      </header>

      {/* Create Post — only for creators */}
      {user && profile?.is_creator && <CreatePost />}

      {/* Posts Feed */}
      <div>
        {posts.map(post => (
          <PostCard key={post.id} post={post} />
        ))}

        {/* Loading */}
        {loading && (
          <div className="px-5 py-4">
            <SkeletonPost />
            <SkeletonPost />
            <SkeletonPost />
          </div>
        )}

        {/* Infinite scroll trigger */}
        {hasMore && <div ref={ref} className="h-10" />}

        {/* Empty state */}
        {!loading && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-20 h-20 bg-zinc-800/50 rounded-3xl flex items-center justify-center mb-6">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600">
                <path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-zinc-300 mb-2">No posts yet</h3>
            <p className="text-sm text-zinc-500 max-w-xs">
              {user ? 'Follow some creators or create your first post!' : 'Sign in to see posts from creators you follow.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
