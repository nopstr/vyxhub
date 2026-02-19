import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Send, Lock, Loader2, Reply, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { resolvePostMediaUrls } from '../../lib/storage'
import { useAuthStore } from '../../stores/authStore'
import { useCommentStore } from '../../stores/commentStore'
import PostCard from '../../components/feed/PostCard'
import Avatar from '../../components/ui/Avatar'
import { SkeletonPost } from '../../components/ui/Spinner'
import { cn, formatRelativeTime } from '../../lib/utils'
import { toast } from 'sonner'

function Comment({ comment, postAuthorId, onReply, depth = 0, canComment }) {
  const { user } = useAuthStore()
  const { deleteComment } = useCommentStore()
  const isAuthor = comment.author?.id === postAuthorId
  const isOwnComment = user?.id === comment.author_id
  const [collapsed, setCollapsed] = useState(false)
  const hasReplies = comment.replies?.length > 0

  const handleDelete = async () => {
    if (!confirm('Delete this comment?')) return
    try {
      await deleteComment(comment.post_id, comment.id)
      toast.success('Comment deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  return (
    <div className={cn(depth > 0 && 'ml-8 border-l border-zinc-800/40 pl-4')}>
      <div className="flex gap-3 py-3">
        <Link to={`/@${comment.author?.username}`} className="flex-shrink-0">
          <Avatar src={comment.author?.avatar_url} alt={comment.author?.display_name} size="sm" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Link to={`/@${comment.author?.username}`} className="text-sm font-bold text-zinc-200 hover:underline">
              {comment.author?.display_name || 'User'}
            </Link>
            {isAuthor && (
              <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">CREATOR</span>
            )}
            <span className="text-xs text-zinc-600">{formatRelativeTime(comment.created_at)}</span>
            {comment._optimistic && (
              <span className="text-[10px] text-zinc-600 italic">sending...</span>
            )}
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
            {comment.content}
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            {canComment && depth === 0 && (
              <button
                onClick={() => onReply(comment)}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-indigo-400 transition-colors cursor-pointer"
              >
                <Reply size={13} />
                Reply
              </button>
            )}
            {isOwnComment && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
              >
                <Trash2 size={12} />
                Delete
              </button>
            )}
            {hasReplies && (
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                {comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Nested replies (1 level deep) */}
      {hasReplies && !collapsed && (
        <div>
          {comment.replies.map(reply => (
            <Comment
              key={reply.id}
              comment={reply}
              postAuthorId={postAuthorId}
              onReply={onReply}
              depth={1}
              canComment={canComment}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PostDetailPage() {
  const { postId } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const { fetchComments, addComment, getThreaded, loading: commentsLoading } = useCommentStore()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null)
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
          bookmarks(user_id),
          polls(
            id,
            question,
            ends_at,
            poll_options(id, option_text, votes_count, sort_order),
            poll_votes(user_id, option_id)
          )
        `)
        .eq('id', postId)
        .single()

      if (postError || !postData) {
        setLoading(false)
        return
      }

      setPost(postData)

      // Resolve protected media to signed URLs
      await resolvePostMediaUrls(postData)

      // Fetch comments via centralized store (cached, threaded)
      await fetchComments(postId)

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
        setIsSubscribed(true)
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
      const result = await addComment(
        postId,
        user.id,
        commentText.trim(),
        replyingTo?.id || null
      )
      if (!result) throw new Error('Failed')
      setCommentText('')
      setReplyingTo(null)
      toast.success(replyingTo ? 'Reply posted' : 'Comment posted')
    } catch (err) {
      toast.error('Failed to post comment')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReply = (comment) => {
    setReplyingTo({ id: comment.id, author: comment.author })
    setCommentText(`@${comment.author?.username} `)
    inputRef.current?.focus()
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
  const threadedComments = getThreaded(postId)

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
            Comments {threadedComments.length > 0 && `(${threadedComments.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0)})`}
          </h3>
        </div>

        {/* Threaded Comment List */}
        <div className="px-5 divide-y divide-zinc-800/30">
          {threadedComments.length > 0 ? (
            threadedComments.map(comment => (
              <Comment
                key={comment.id}
                comment={comment}
                postAuthorId={post.author_id}
                onReply={handleReply}
                canComment={canComment}
              />
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
            <div className="sticky bottom-0 border-t border-zinc-800/50 bg-[#050505]/95 backdrop-blur-xl">
              {/* Reply indicator */}
              {replyingTo && (
                <div className="px-4 pt-2 flex items-center gap-2 text-xs text-zinc-500">
                  <Reply size={12} className="text-indigo-400" />
                  <span>Replying to <strong className="text-zinc-300">@{replyingTo.author?.username}</strong></span>
                  <button
                    onClick={() => { setReplyingTo(null); setCommentText('') }}
                    className="ml-auto text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}
              <form onSubmit={handleSubmitComment} className="px-4 py-3 flex items-center gap-3">
                <Avatar src={profile?.avatar_url} alt={profile?.display_name} size="sm" />
                <input
                  ref={inputRef}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={replyingTo ? 'Write a reply...' : 'Write a comment...'}
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
            </div>
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
