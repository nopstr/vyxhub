import { useEffect, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import PostCard from '../../components/feed/PostCard'
import { PageLoader } from '../../components/ui/Spinner'
import { Bookmark } from 'lucide-react'

export default function BookmarksPage() {
  const { user } = useAuthStore()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) fetchBookmarks()
  }, [user])

  const fetchBookmarks = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('bookmarks')
      .select(`
        post:posts(
          *,
          author:profiles!author_id(*),
          media(*),
          likes(user_id),
          bookmarks(user_id)
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setPosts(data?.map(b => b.post).filter(Boolean) || [])
    setLoading(false)
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <h1 className="text-xl font-bold text-white">Bookmarks</h1>
      </header>

      {posts.length > 0 ? (
        posts.map(post => <PostCard key={post.id} post={post} />)
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-zinc-800/50 rounded-3xl flex items-center justify-center mb-4">
            <Bookmark size={28} className="text-zinc-600" />
          </div>
          <h3 className="text-lg font-bold text-zinc-300 mb-1">No bookmarks yet</h3>
          <p className="text-sm text-zinc-500">Save posts to view them later</p>
        </div>
      )}
    </div>
  )
}
