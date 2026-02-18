import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Lock, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import PostCard from '../../components/feed/PostCard'
import Avatar from '../../components/ui/Avatar'
import { SkeletonPost } from '../../components/ui/Spinner'
import { cn, formatRelativeTime } from '../../lib/utils'
import { toast } from 'sonner'

function Comment({ comment, postAuthorId, onReply }) {
  const { user } = useAuthStore()
  const isAuthor = comment.author?.id === postAuthorId

  return (
    <div className="flex gap-3 py-3">
      <Link to={`/@${comment.author?.username}`} className="flex-shrink-0">
        <Avatar src={comment.author?.avatar_url} alt={comment.author?.display_name} size="sm" />
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Link to={`/@${comment.author?.username}`} className="text-sm font-bold text-zinc-200 hover:underline">
            {comment.author?.display_name}
          </Link>
          {isAuthor && (
            <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">CREATOR</span>
          )}
          <span className="text-xs text-zinc-600">{formatRelativeTime(comment.created_at)}</span>
        </div>
        <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
          {comment.content}
        </p>
      </div>
    </div>
  )
}

export default function PostDetailPage() {
  const { postId } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (postId) fetchPost()
  }, [postId])

  const fetchPost = async () => {
    setLoading(true)
    try {
      // Fetch post
      const { data: postData, error: postError } = await supabase
        .from('posts')
        .select(`
          *,
          author:profiles!author_id(*),
          media(*),
          likes(user_id, reaction_type),
          bookmarks(user_id)
        `)
        .eq('id', postId)
        .single()

      if (postError || !postData) {
        setLoading(false)
        return
      }

      setPost(postData)

      // Fetch comments
      const { data: commentsData } = await supabase
        .from('comments')
        .select(`
          *,
          author:profiles!author_id(id, username, display_name, avatar_url, is_verified)
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true })

      setComments(commentsData || [])

      // Check subscription
      if (user && user.id !== postData.author_id) {
        const { data: subData } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('subscriber_id', user.id)
          .eq('creator_id', postData.author_id)
          .eq('status', 'active')
          .maybeSingle()
        setIsSubscribed(!!subData)
      } else if (user?.id === postData.author_id) {
        setIsSubscribed(true) // Owner can always comment
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to load post')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitComment = async (e) => {
    e.preventDefault()
    if (!commentText.trim() || submitting) return
    if (!user) return toast.error('Sign in to comment')

    const isOwn = user.id === post?.author_id
    if (!isOwn && !isSubscribed) {
      return toast.error(`Subscribe to @${post.author?.username} to comment`)
    }

    setSubmitting(true)
    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          author_id: user.id,
          content: commentText.trim(),
        })
        .select(`
          *,
          author:profiles!author_id(id, username, display_name, avatar_url, is_verified)
        `)
        .single()

      if (error) throw error

      setComments(prev => [...prev, data])
      setCommentText('')
      toast.success('Comment posted')
    } catch (err) {
      toast.error('Failed to post comment')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-5">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer">
            <ArrowLeft size={20} className="text-zinc-400" />
          </button>
          <h1 className="text-lg font-bold">Post</h1>
        </div>
        <SkeletonPost />
      </div>
    )
  }

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <h2 className="text-xl font-bold text-zinc-300 mb-2">Post not found</h2>
        <p className="text-sm text-zinc-500 mb-4">This post may have been deleted</p>
        <button onClick={() => navigate('/')} className="text-sm text-indigo-400 hover:underline cursor-pointer">
          Go home
        </button>
      </div>
    )
  }

  const canComment = user && (user.id === post.author_id || isSubscribed)

  return (
    <div>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer">
          <ArrowLeft size={20} className="text-zinc-400" />
        </button>
        <h1 className="text-lg font-bold">Post</h1>
      </header>

      {/* Post */}
      <PostCard post={post} />

      {/* Comments Section */}
      <div className="border-t border-zinc-800/50">
        <div className="px-5 py-3">
          <h3 className="text-sm font-bold text-zinc-400">
            Comments {comments.length > 0 && `(${comments.length})`}
          </h3>
        </div>

        {/* Comment List */}
        <div className="px-5 divide-y divide-zinc-800/30">
          {comments.length > 0 ? (
            comments.map(comment => (
              <Comment key={comment.id} comment={comment} postAuthorId={post.author_id} />
            ))
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-zinc-500">No comments yet</p>
              {canComment && (
                <p className="text-xs text-zinc-600 mt-1">Be the first to comment</p>
              )}
            </div>
          )}
        </div>

        {/* Comment Input */}
        {user ? (
          canComment ? (
            <form onSubmit={handleSubmitComment} className="sticky bottom-0 border-t border-zinc-800/50 bg-[#050505]/95 backdrop-blur-xl px-4 py-3 flex items-center gap-3">
              <Avatar src={profile?.avatar_url} alt={profile?.display_name} size="sm" />
              <input
                ref={inputRef}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment..."
                maxLength={1000}
                className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-2xl px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-indigo-500/50 transition-colors"
              />
              <button
                type="submit"
                disabled={!commentText.trim() || submitting}
                className={cn(
                  'p-2.5 rounded-xl transition-all cursor-pointer',
                  commentText.trim() && !submitting
                    ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                    : 'bg-zinc-800 text-zinc-600'
                )}
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </form>
          ) : (
            <div className="border-t border-zinc-800/50 px-5 py-4 flex items-center justify-center gap-2 text-sm text-zinc-500">
              <Lock size={14} />
              Subscribe to @{post.author?.username} to comment
            </div>
          )
        ) : (
          <div className="border-t border-zinc-800/50 px-5 py-4 text-center">
            <Link to="/auth" className="text-sm text-indigo-400 hover:underline">Sign in to comment</Link>
          </div>
        )}
      </div>
    </div>
  )
}
