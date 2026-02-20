import React from 'react'
import { useInView } from 'react-intersection-observer'
import PostCard from './PostCard'

export default function VirtualizedPost({ post }) {
  const { ref, inView } = useInView({
    triggerOnce: false,
    rootMargin: '400px 0px', // Load when within 400px of viewport
  })

  return (
    <div ref={ref} style={{ minHeight: '300px' }}>
      {inView ? <PostCard post={post} /> : <div className="h-[300px] bg-zinc-900/10 animate-pulse rounded-xl my-4 mx-5" />}
    </div>
  )
}
