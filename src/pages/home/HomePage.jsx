import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { usePostStore } from '../../stores/postStore'
import { useSubscriptionCache } from '../../stores/subscriptionCache'
import CreatePost from '../../components/feed/CreatePost'

import VirtualizedPost from '../../components/feed/VirtualizedPost'
import { SkeletonPost } from '../../components/ui/Spinner'
import { useInView } from 'react-intersection-observer'
import EmptyState from '../../components/ui/EmptyState'
import PullToRefresh from '../../components/ui/PullToRefresh'
import useSwipeGesture from '../../components/ui/useSwipeGesture'
import { Compass, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'

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
    if (newTab === tab) {
      // If clicking the active tab, reload content and scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' })
      initialLoadDone.current = false
      if (tab === 'following' && user) {
        fetchFollowingFeed(user.id, true).then(() => { initialLoadDone.current = true })
      } else {
        fetchFeed(true, user?.id || null).then(() => { initialLoadDone.current = true })
      }
      return
    }
    setTab(newTab)
  }

  // Pull-to-refresh handler
  const handlePullRefresh = useCallback(async () => {
    initialLoadDone.current = false
    if (tab === 'following' && user) {
      await fetchFollowingFeed(user.id, true)
    } else {
      await fetchFeed(true, user?.id || null)
    }
    initialLoadDone.current = true
  }, [tab, user, fetchFeed, fetchFollowingFeed])

  // Swipe between tabs on mobile
  const swipeRef = useSwipeGesture({
    onSwipeLeft: useCallback(() => {
      if (tab === 'foryou' && user) setTab('following')
    }, [tab, user]),
    onSwipeRight: useCallback(() => {
      if (tab === 'following') setTab('foryou')
    }, [tab]),
  })

  return (
    <PullToRefresh onRefresh={handlePullRefresh} disabled={loading}>
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
            Following & Subscribed
            {tab === 'following' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-indigo-500 rounded-full" />
            )}
          </button>
        </div>
      </header>

      {/* Create Post — only for creators */}
      {user && profile?.is_creator && <CreatePost />}

      {/* Posts Feed */}
      <div ref={swipeRef}>
        {!loading && posts.length === 0 ? (
          <EmptyState
            icon={tab === 'foryou' ? Compass : Users}
            title={tab === 'foryou' ? "No posts yet" : "Your feed is empty"}
            description={tab === 'foryou' ? "Check back later for new content." : "Follow or subscribe to some creators to see their posts here."}
            action={
              tab === 'following' && (
                <Link to="/explore">
                  <Button variant="primary">Explore Creators</Button>
                </Link>
              )
            }
          />
        ) : (
          posts.map((post, index) => (
            <VirtualizedPost key={post.id} post={post} index={index} />
          ))
        )}

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
      </div>
    </PullToRefresh>
  )
}
