import { useEffect, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { resolvePostMediaUrls } from '../../lib/storage'
import VirtualizedPost from '../../components/feed/VirtualizedPost'
import { PageLoader } from '../../components/ui/Spinner'
import { Unlock, FileText, CheckCircle, Clock, XCircle, CreditCard, ExternalLink } from 'lucide-react'
import { cn } from '../../lib/utils'
import PaymentModal from '../../components/PaymentModal'
import { formatDistanceToNow } from 'date-fns'

function PurchasedPostsTab({ user }) {
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

function CustomRequestsTab({ user }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [paymentRequest, setPaymentRequest] = useState(null)

  useEffect(() => {
    if (user) fetchRequests()
  }, [user])

  const fetchRequests = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('custom_requests')
      .select('*, creator:creator_id(display_name, username, avatar_url)')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false })

    setRequests(data || [])
    setLoading(false)
  }

  const getStatusConfig = (status) => {
    switch (status) {
      case 'pending': return { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'Pending' }
      case 'accepted': return { icon: CreditCard, color: 'text-indigo-400', bg: 'bg-indigo-500/10', label: 'Awaiting Payment' }
      case 'paid': return { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'In Progress' }
      case 'completed': return { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Completed' }
      case 'declined': return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Declined' }
      case 'cancelled': return { icon: XCircle, color: 'text-zinc-400', bg: 'bg-zinc-500/10', label: 'Cancelled' }
      default: return { icon: Clock, color: 'text-zinc-400', bg: 'bg-zinc-500/10', label: status }
    }
  }

  if (loading) return <PageLoader />

  return (
    <div className="p-4 space-y-4">
      {requests.length > 0 ? (
        requests.map(req => {
          const status = getStatusConfig(req.status)
          const StatusIcon = status.icon

          return (
            <div key={req.id} className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <img src={req.creator?.avatar_url || '/default-avatar.png'} alt="" className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <div className="font-bold text-white">{req.creator?.display_name}</div>
                    <div className="text-sm text-zinc-500">@{req.creator?.username}</div>
                  </div>
                </div>
                <div className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium", status.bg, status.color)}>
                  <StatusIcon size={14} />
                  {status.label}
                </div>
              </div>

              <div className="mb-4">
                <div className="text-sm text-zinc-400 mb-1">Request Description</div>
                <p className="text-zinc-200 whitespace-pre-wrap">{req.description}</p>
              </div>

              {req.creator_note && (
                <div className="mb-4 p-3 bg-zinc-800/30 rounded-xl border border-zinc-800/50">
                  <div className="text-xs text-zinc-500 mb-1">Note from creator</div>
                  <p className="text-sm text-zinc-300">{req.creator_note}</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-zinc-800/50">
                <div className="flex flex-col">
                  <span className="text-xs text-zinc-500">Price</span>
                  <span className="font-bold text-white">${req.price}</span>
                </div>
                
                {req.status === 'accepted' && (
                  <button
                    onClick={() => setPaymentRequest(req)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    Pay Now
                  </button>
                )}

                {req.status === 'completed' && req.delivery_url && (
                  <a
                    href={req.delivery_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    <ExternalLink size={16} />
                    View Delivery
                  </a>
                )}
              </div>
            </div>
          )
        })
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-zinc-800/50 rounded-3xl flex items-center justify-center mb-4">
            <FileText size={28} className="text-zinc-600" />
          </div>
          <h3 className="text-lg font-bold text-zinc-300 mb-1">No custom requests</h3>
          <p className="text-sm text-zinc-500">Requests you make to creators will appear here</p>
        </div>
      )}

      {paymentRequest && (
        <PaymentModal
          open={!!paymentRequest}
          onClose={() => setPaymentRequest(null)}
          amount={paymentRequest.price}
          paymentType="custom_request"
          metadata={{
            request_id: paymentRequest.id,
            creator_id: paymentRequest.creator_id
          }}
          label={`Pay for Custom Request from @${paymentRequest.creator?.username}`}
          onSuccess={() => {
            setPaymentRequest(null)
            fetchRequests()
          }}
        />
      )}
    </div>
  )
}

export default function UnlocksPage() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('purchases')

  return (
    <div>
      <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-xl border-b border-zinc-800/50">
        <div className="px-5 py-4">
          <h1 className="text-xl font-bold text-white">My Unlocks</h1>
        </div>
        <div className="flex px-2">
          <button
            onClick={() => setActiveTab('purchases')}
            className={cn(
              "flex-1 pb-3 text-sm font-bold transition-colors border-b-2",
              activeTab === 'purchases' ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            Purchased Posts
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={cn(
              "flex-1 pb-3 text-sm font-bold transition-colors border-b-2",
              activeTab === 'requests' ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            Custom Requests
          </button>
        </div>
      </header>

      {activeTab === 'purchases' ? (
        <PurchasedPostsTab user={user} />
      ) : (
        <CustomRequestsTab user={user} />
      )}
    </div>
  )
}
