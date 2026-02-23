import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { useSubscriptionCache } from '../../stores/subscriptionCache'
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import Button from '../../components/ui/Button'
import { haptic } from '../../lib/utils'
import { toast } from 'sonner'

/**
 * /payment/success — Return page after Segpay completes a payment.
 * Polls the payment session to confirm processing, then shows success.
 */
export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { addSubscription } = useSubscriptionCache()
  const [status, setStatus] = useState('checking')  // checking | success | failed | timeout
  const [sessionData, setSessionData] = useState(null)

  const sessionId = searchParams.get('session')

  useEffect(() => {
    if (!sessionId || !user) return

    let attempts = 0
    const maxAttempts = 20 // 20 * 3s = 60 seconds max
    let timer

    const checkSession = async () => {
      try {
        const { data, error } = await supabase.rpc('get_payment_session', {
          p_session_id: sessionId
        })

        if (error) throw error

        if (!data?.found) {
          setStatus('failed')
          return
        }

        if (data.is_processed && data.status === 'completed') {
          setSessionData(data)
          setStatus('success')
          haptic('success')

          // Handle post-payment actions
          if (data.payment_type === 'subscription' && data.metadata?.creator_id) {
            addSubscription(data.metadata.creator_id)
            // Auto-follow
            await supabase.from('follows').insert({
              follower_id: user.id,
              following_id: data.metadata.creator_id
            }).catch(() => {})
          }

          return
        }

        if (data.status === 'failed') {
          setStatus('failed')
          return
        }

        // Still pending, keep polling
        attempts++
        if (attempts >= maxAttempts) {
          setStatus('timeout')
          return
        }

        timer = setTimeout(checkSession, 3000)
      } catch (err) {
        console.error('Session check error:', err)
        attempts++
        if (attempts >= maxAttempts) {
          setStatus('timeout')
        } else {
          timer = setTimeout(checkSession, 3000)
        }
      }
    }

    checkSession()
    return () => clearTimeout(timer)
  }, [sessionId, user])

  const getTitle = () => {
    if (!sessionData) return 'Payment'
    switch (sessionData.payment_type) {
      case 'subscription': return 'Subscription Active!'
      case 'tip': return 'Tip Sent!'
      case 'ppv_post': return 'Content Unlocked!'
      case 'message_unlock': return 'Messages Unlocked!'
      case 'plus_subscription': return 'Welcome to Heatly+!'
      default: return 'Payment Complete!'
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-6">
        {status === 'checking' && (
          <>
            <Loader2 size={48} className="text-red-400 animate-spin mx-auto" />
            <div>
              <h2 className="text-xl font-bold text-white">Processing Payment...</h2>
              <p className="text-sm text-zinc-400 mt-2">This usually takes a few seconds</p>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mx-auto">
              <CheckCircle2 size={40} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{getTitle()}</h2>
              <p className="text-sm text-zinc-400 mt-2">
                {sessionData?.amount && `$${parseFloat(sessionData.amount).toFixed(2)} paid successfully`}
              </p>
            </div>
            <Button
              variant="primary"
              className="w-full"
              onClick={() => navigate('/', { replace: true })}
            >
              Continue to Heatly
            </Button>
          </>
        )}

        {status === 'failed' && (
          <>
            <div className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mx-auto">
              <AlertCircle size={40} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Payment Failed</h2>
              <p className="text-sm text-zinc-400 mt-2">Your card was declined or the payment could not be processed.</p>
            </div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => navigate(-1)}
            >
              Try Again
            </Button>
          </>
        )}

        {status === 'timeout' && (
          <>
            <div className="w-20 h-20 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center mx-auto">
              <Loader2 size={40} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Still Processing</h2>
              <p className="text-sm text-zinc-400 mt-2">Your payment is being processed. This may take a minute. If access doesn't appear, contact support.</p>
            </div>
            <Button
              variant="primary"
              className="w-full"
              onClick={() => navigate('/', { replace: true })}
            >
              Continue to Heatly
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
