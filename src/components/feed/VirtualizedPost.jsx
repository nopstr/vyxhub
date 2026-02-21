import React, { useEffect } from 'react'
import { useInView } from 'react-intersection-observer'
import PostCard from './PostCard'
import AffiliateAdCard from './AffiliateAdCard'
import { recordImpression } from '../../stores/postStore'
import { useAuthStore } from '../../stores/authStore'

export default function VirtualizedPost({ post }) {
  const user = useAuthStore((s) => s.user)
  const { ref, inView } = useInView({
    triggerOnce: true,
    rootMargin: '400px 0px', // Load when within 400px of viewport
  })

  // Record impression when post enters viewport (feed algorithm signal)
  useEffect(() => {
    if (inView && post?.id && user?.id && !post._affiliateAd) {
      recordImpression(post.id, user.id)
    }
  }, [inView, post?.id, user?.id])

  // Render affiliate ad card instead of PostCard
  if (post._affiliateAd) {
    return <AffiliateAdCard ad={post} />
  }

  return (
    <div ref={ref}>
      {inView ? <PostCard post={post} /> : <div className="h-[300px] bg-zinc-900/10 animate-pulse rounded-xl my-4 mx-5" />}
    </div>
  )
}
