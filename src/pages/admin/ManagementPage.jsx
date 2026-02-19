import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import Input, { Textarea } from '../../components/ui/Input'
import { PageLoader } from '../../components/ui/Spinner'
import { toast } from 'sonner'
import { cn, formatRelativeTime } from '../../lib/utils'
import { optimizeImage } from '../../lib/storage'
import {
  Users, Upload, Image, Film, FileText, CheckCircle, XCircle,
  Clock, Calendar, Send, Eye, Filter, ChevronDown, ChevronUp,
  Trash2, ExternalLink, PenSquare
} from 'lucide-react'

// ─── Managed Creators List ──────────────────────────────────────────
function ManagedCreators({ onSelect, selectedId }) {
  const [creators, setCreators] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_verified, subscriber_count, post_count, management_split')
        .eq('is_managed', true)
        .order('display_name')
      setCreators(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  if (loading) return <div className="py-8 text-center text-zinc-500 text-sm">Loading...</div>

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-zinc-400 mb-2">Managed Creators ({creators.length})</h3>
      {creators.length === 0 ? (
        <p className="text-sm text-zinc-500">No managed creators yet. Admin can assign managed status.</p>
      ) : creators.map(c => (
        <button
          key={c.id}
          onClick={() => onSelect(c)}
          className={cn(
            'w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left cursor-pointer',
            selectedId === c.id ? 'bg-indigo-500/10 border border-indigo-500/30' : 'bg-zinc-900/30 border border-zinc-800/50 hover:bg-zinc-900/50'
          )}
        >
          <Avatar src={c.avatar_url} alt={c.display_name} size="md" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-white truncate block">{c.display_name}</span>
            <span className="text-xs text-zinc-500">@{c.username} · {c.subscriber_count || 0} subs · {c.management_split || 60}% split</span>
          </div>
        </button>
      ))}
    </div>
  )
}

// ─── Content Queue ──────────────────────────────────────────────────
function ContentQueue({ creatorId }) {
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')

  const fetchUploads = async () => {
    if (!creatorId) return
    setLoading(true)
    let query = supabase
      .from('content_uploads')
      .select('*')
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data } = await query
    setUploads(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchUploads() }, [creatorId, filter])

  const handleStatusChange = async (uploadId, status) => {
    const { error } = await supabase
      .from('content_uploads')
      .update({ status, reviewed_by: (await supabase.auth.getUser()).data.user?.id })
      .eq('id', uploadId)
    if (error) return toast.error('Failed to update')
    toast.success(`Marked as ${status}`)
    fetchUploads()
  }

  if (!creatorId) return <p className="text-sm text-zinc-500">Select a creator to view their content</p>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-zinc-500" />
        {['pending', 'used', 'rejected', 'all'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
              filter === f ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center text-zinc-500 text-sm">Loading...</div>
      ) : uploads.length === 0 ? (
        <div className="py-8 text-center text-zinc-500 text-sm">No {filter} uploads</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {uploads.map(upload => (
            <div key={upload.id} className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl overflow-hidden">
              {/* Preview */}
              <div className="aspect-square bg-zinc-950 flex items-center justify-center">
                {upload.file_type === 'image' ? (
                  <Image size={32} className="text-zinc-700" />
                ) : (
                  <Film size={32} className="text-zinc-700" />
                )}
              </div>

              <div className="p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    'text-[10px] px-2 py-0.5 rounded-full font-medium',
                    upload.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                    upload.status === 'used' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                  )}>
                    {upload.status}
                  </span>
                  <span className="text-[10px] text-zinc-600">{upload.file_type}</span>
                </div>

                {upload.instructions && (
                  <p className="text-xs text-zinc-400 line-clamp-2">{upload.instructions}</p>
                )}

                <p className="text-[10px] text-zinc-600">{formatRelativeTime(upload.created_at)}</p>

                {upload.status === 'pending' && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleStatusChange(upload.id, 'used')}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs cursor-pointer hover:bg-emerald-500/20"
                    >
                      <CheckCircle size={12} /> Use
                    </button>
                    <button
                      onClick={() => handleStatusChange(upload.id, 'rejected')}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-xs cursor-pointer hover:bg-red-500/20"
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Post As Creator ────────────────────────────────────────────────
function PostAsCreator({ creator }) {
  const { user } = useAuthStore()
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [postType, setPostType] = useState('post')
  const [price, setPrice] = useState('')
  const [scheduling, setScheduling] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [posting, setPosting] = useState(false)
  const fileInputRef = useRef(null)
  const [files, setFiles] = useState([])

  if (!creator) return <p className="text-sm text-zinc-500">Select a creator to post on their behalf</p>

  const handlePost = async () => {
    if (!content.trim() && files.length === 0) return toast.error('Add content or media')
    setPosting(true)

    try {
      if (scheduling && scheduleDate && scheduleTime) {
        // Create scheduled post
        const scheduledFor = new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
        const { error } = await supabase.from('scheduled_posts').insert({
          author_id: creator.id,
          scheduled_by: user.id,
          content: content.trim(),
          post_type: postType,
          visibility,
          price: price ? parseFloat(price) : 0,
          scheduled_for: scheduledFor,
        })
        if (error) throw error
        toast.success(`Post scheduled for ${scheduleDate} ${scheduleTime}`)
      } else {
        // Immediate post
        const postInsert = {
          author_id: creator.id,
          content: content.trim(),
          post_type: postType,
          visibility,
        }
        if (price) postInsert.price = parseFloat(price)

        const { data: post, error } = await supabase
          .from('posts')
          .insert(postInsert)
          .select()
          .single()
        if (error) throw error

        // Upload media files
        if (files.length > 0) {
          const mediaInserts = []
          for (let i = 0; i < files.length; i++) {
            const optimized = await optimizeImage(files[i])
            const ext = optimized.name.split('.').pop()
            const filePath = `${creator.id}/${post.id}/${i}.${ext}`
            const { error: uploadError } = await supabase.storage.from('posts').upload(filePath, optimized)
            if (uploadError) throw uploadError
            mediaInserts.push({
              post_id: post.id,
              uploader_id: user.id,
              media_type: optimized.type.startsWith('video') ? 'video' : 'image',
              url: filePath,
              sort_order: i,
              file_size_bytes: optimized.size,
            })
          }
          if (mediaInserts.length > 0) {
            await supabase.from('media').insert(mediaInserts)
          }
        }

        toast.success('Posted!')
      }

      setContent('')
      setPrice('')
      setFiles([])
      setScheduleDate('')
      setScheduleTime('')
    } catch (err) {
      toast.error(err.message || 'Failed to post')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl">
        <Avatar src={creator.avatar_url} alt={creator.display_name} size="md" />
        <div>
          <span className="text-sm font-medium text-white">Posting as {creator.display_name}</span>
          <span className="text-xs text-zinc-500 ml-2">@{creator.username}</span>
        </div>
      </div>

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={`Write a post for ${creator.display_name}...`}
        rows={4}
        maxLength={2000}
      />

      <div className="flex gap-3 flex-wrap">
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-3 py-2 text-sm text-zinc-200 cursor-pointer"
        >
          <option value="public">Public</option>
          <option value="subscribers_only">Subscribers Only</option>
          <option value="followers_only">Followers Only</option>
        </select>

        <select
          value={postType}
          onChange={(e) => setPostType(e.target.value)}
          className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-3 py-2 text-sm text-zinc-200 cursor-pointer"
        >
          <option value="post">Post</option>
          <option value="set">Set</option>
          <option value="video">Video</option>
          <option value="reel">Reel</option>
        </select>

        {(visibility === 'subscribers_only' || postType === 'set' || postType === 'video') && (
          <Input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="PPV Price ($)"
            className="w-32"
          />
        )}
      </div>

      {/* Media upload */}
      <div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-sm text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <Upload size={16} /> Add Media
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />
        {files.length > 0 && (
          <p className="text-xs text-zinc-500 mt-1">{files.length} file(s) selected</p>
        )}
      </div>

      {/* Schedule toggle */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={scheduling}
            onChange={(e) => setScheduling(e.target.checked)}
            className="rounded border-zinc-700"
          />
          <span className="text-sm text-zinc-400">Schedule post</span>
        </label>
      </div>

      {scheduling && (
        <div className="flex gap-2">
          <input
            type="date"
            value={scheduleDate}
            onChange={(e) => setScheduleDate(e.target.value)}
            className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-3 py-2 text-sm text-zinc-200"
          />
          <input
            type="time"
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
            className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-3 py-2 text-sm text-zinc-200"
          />
        </div>
      )}

      <Button onClick={handlePost} loading={posting}>
        {scheduling ? <><Calendar size={16} /> Schedule Post</> : <><Send size={16} /> Post Now</>}
      </Button>
    </div>
  )
}

// ─── Scheduled Posts Viewer ─────────────────────────────────────────
function ScheduledPosts({ creatorId }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchScheduled = async () => {
    if (!creatorId) return
    setLoading(true)
    const { data } = await supabase
      .from('scheduled_posts')
      .select(`
        *,
        scheduler:profiles!scheduled_by(username, display_name)
      `)
      .eq('author_id', creatorId)
      .order('scheduled_for', { ascending: true })
      .limit(50)
    setPosts(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchScheduled() }, [creatorId])

  const handleCancel = async (postId) => {
    const { error } = await supabase
      .from('scheduled_posts')
      .update({ status: 'cancelled' })
      .eq('id', postId)
    if (error) return toast.error('Failed to cancel')
    toast.success('Scheduled post cancelled')
    fetchScheduled()
  }

  if (!creatorId) return null
  if (loading) return <div className="py-8 text-center text-zinc-500 text-sm">Loading...</div>

  return (
    <div className="space-y-2">
      {posts.length === 0 ? (
        <p className="text-sm text-zinc-500">No scheduled posts</p>
      ) : posts.map(post => (
        <div key={post.id} className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-300 line-clamp-2">{post.content}</p>
              <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
                <Calendar size={11} />
                <span>{new Date(post.scheduled_for).toLocaleString()}</span>
                <span className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-medium',
                  post.status === 'scheduled' ? 'bg-blue-500/10 text-blue-400' :
                  post.status === 'published' ? 'bg-emerald-500/10 text-emerald-400' :
                  post.status === 'cancelled' ? 'bg-zinc-500/10 text-zinc-500' : 'bg-red-500/10 text-red-400'
                )}>
                  {post.status}
                </span>
                <span>by {post.scheduler?.display_name}</span>
              </div>
            </div>
            {post.status === 'scheduled' && (
              <button onClick={() => handleCancel(post.id)} className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-red-400 cursor-pointer">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Management Page ───────────────────────────────────────────
const managementTabs = [
  { id: 'content', label: 'Content Queue', icon: Upload },
  { id: 'post', label: 'Post as Creator', icon: PenSquare },
  { id: 'scheduled', label: 'Scheduled', icon: Calendar },
]

export default function ManagementPage() {
  const [tab, setTab] = useState('content')
  const [selectedCreator, setSelectedCreator] = useState(null)

  return (
    <div>
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
            <Users size={18} className="text-purple-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Management Panel</h1>
        </div>
      </header>

      <div className="flex flex-col md:flex-row">
        {/* Creator selector */}
        <div className="md:w-64 border-b md:border-b-0 md:border-r border-zinc-800/50 p-4">
          <ManagedCreators onSelect={setSelectedCreator} selectedId={selectedCreator?.id} />
        </div>

        {/* Content area */}
        <div className="flex-1 px-5 py-4">
          {/* Tabs */}
          <div className="flex gap-1.5 mb-6">
            {managementTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer',
                  tab === t.id
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    : 'text-zinc-500 hover:text-zinc-300 bg-zinc-900/30 border border-zinc-800/50'
                )}
              >
                <t.icon size={15} />
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'content' && <ContentQueue creatorId={selectedCreator?.id} />}
          {tab === 'post' && <PostAsCreator creator={selectedCreator} />}
          {tab === 'scheduled' && <ScheduledPosts creatorId={selectedCreator?.id} />}
        </div>
      </div>
    </div>
  )
}
