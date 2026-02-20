import { useEffect, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { resolvePostMediaUrls } from '../../lib/storage'
import VirtualizedPost from '../../components/feed/VirtualizedPost'
import { PageLoader } from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
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
          likes(user_id, reaction_type),
          bookmarks(user_id)
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    const bookmarkedPosts = data?.map(b => b.post).filter(Boolean) || []
    if (bookmarkedPosts.length) await resolvePostMediaUrls(bookmarkedPosts)
    setPosts(bookmarkedPosts)
    setLoading(false)
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <h1 className="text-xl font-bold text-white">Bookmarks</h1>
      </header>

      {posts.length > 0 ? (
        posts.map(post => <VirtualizedPost key={post.id} post={post} />)
      ) : (
        <EmptyState
          icon={Bookmark}
          title="No bookmarks yet"
          description="Save posts to view them later."
        />
      )}
    </div>
  )
}
