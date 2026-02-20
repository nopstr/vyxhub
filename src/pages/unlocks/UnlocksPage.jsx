import { useEffect, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { resolvePostMediaUrls } from '../../lib/storage'
import VirtualizedPost from '../../components/feed/VirtualizedPost'
import { PageLoader } from '../../components/ui/Spinner'
import { Unlock } from 'lucide-react'

export default function UnlocksPage() {
  const { user } = useAuthStore()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) fetchUnlocks()
  }, [user])

  const fetchUnlocks = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('purchases')
      .select(`
        post:posts(
          *,
          author:profiles!author_id(*),
          media(*),
          likes(user_id, reaction_type),
          bookmarks(user_id)
        )
      `)
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false })

    const purchasedPosts = data?.map(p => p.post).filter(Boolean) || []
    if (purchasedPosts.length) await resolvePostMediaUrls(purchasedPosts)
    setPosts(purchasedPosts)
    setLoading(false)
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <h1 className="text-xl font-bold text-white">My Unlocks</h1>
      </header>

      {posts.length > 0 ? (
        posts.map(post => <VirtualizedPost key={post.id} post={post} />)
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-zinc-800/50 rounded-3xl flex items-center justify-center mb-4">
            <Unlock size={28} className="text-zinc-600" />
          </div>
          <h3 className="text-lg font-bold text-zinc-300 mb-1">No unlocked content yet</h3>
          <p className="text-sm text-zinc-500">Content you purchase will appear here permanently</p>
        </div>
      )}
    </div>
  )
}
