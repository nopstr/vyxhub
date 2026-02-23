import { useState } from 'react'
import { X, CreditCard, Wallet, Loader2, ArrowRight, Shield, RefreshCw } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import CryptoPaymentModal from './CryptoPaymentModal'
import Button from './ui/Button'
import { cn, haptic } from '../lib/utils'
import { toast } from 'sonner'

/**
 * PaymentModal — Universal payment method picker
 * 
 * Drop-in replacement for CryptoPaymentModal. Shows two options:
 * 1. Pay with Card (Segpay) — primary, redirects to Segpay hosted page
 * 2. Pay with Crypto — secondary, opens CryptoPaymentModal
 * 
 * Same props as CryptoPaymentModal + the same behavior.
 */
export default function PaymentModal({
  open,
  onClose,
  amount,
  paymentType,
  metadata = {},
  onSuccess,
  label = '',
  // Aliases for backward compatibility (PlusPage uses different prop names)
  isOpen,
  amountUsd,
}) {
  const { user, session } = useAuthStore()
  const [method, setMethod] = useState(null)  // null | 'card' | 'crypto'
  const [redirecting, setRedirecting] = useState(false)
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  // Support alternate prop names
  const isVisible = open ?? isOpen
  const usdAmount = amount ?? amountUsd

  if (!isVisible) return null

  const handleCardPayment = async () => {
    if (!user) return toast.error('Sign in to continue')
    if (!usdAmount || usdAmount <= 0) return toast.error('Invalid amount')

    setRedirecting(true)
    try {
      const token = session?.access_token
      if (!token) throw new Error('No session')

      const res = await fetch('/api/payments/create-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: usdAmount,
          payment_type: paymentType,
          metadata,
          is_recurring: paymentType === 'subscription',
          idempotency_key: idempotencyKey,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create payment session')
      }

      // Store session ID for the success page to check
      sessionStorage.setItem('heatly_payment_session', data.session_id)
      sessionStorage.setItem('heatly_payment_type', paymentType)
      sessionStorage.setItem('heatly_payment_metadata', JSON.stringify(metadata))

      haptic('light')

      // Redirect to Segpay
      window.location.href = data.redirect_url
    } catch (err) {
      console.error('Card payment error:', err)
      toast.error(err.message || 'Payment failed')
      setRedirecting(false)
    }
  }

  // If user chose crypto, render CryptoPaymentModal directly
  if (method === 'crypto') {
    return (
      <CryptoPaymentModal
        open={true}
        onClose={() => {
          setMethod(null)
          onClose()
        }}
        amount={usdAmount}
        paymentType={paymentType}
        metadata={metadata}
        onSuccess={onSuccess}
        label={label}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-sm mx-4 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>

          <h3 className="text-lg font-bold text-white mb-0.5">Choose Payment Method</h3>
          {label && <p className="text-sm text-zinc-400">{label}</p>}

          {/* Amount */}
          <div className="mt-3 bg-zinc-800/50 rounded-xl p-3 flex items-center justify-between">
            <span className="text-sm text-zinc-400">Amount</span>
            <span className="text-xl font-black text-white">${parseFloat(usdAmount).toFixed(2)}</span>
          </div>
          {paymentType === 'subscription' && (
            <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
              <RefreshCw size={10} /> Recurring monthly — cancel anytime
            </p>
          )}
        </div>

        {/* Payment options */}
        <div className="px-5 pb-5 space-y-2.5">
          {/* Card — Primary */}
          <button
            onClick={handleCardPayment}
            disabled={redirecting}
            className={cn(
              'w-full p-4 rounded-xl border-2 transition-all cursor-pointer text-left',
              'bg-gradient-to-r from-red-500/10 to-orange-500/10 border-red-500/40 hover:border-red-400/60',
              redirecting && 'opacity-70 cursor-wait'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                  <CreditCard size={20} className="text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Pay with Card</p>
                  <p className="text-xs text-zinc-400">Visa, Mastercard, Discover</p>
                </div>
              </div>
              {redirecting ? (
                <Loader2 size={18} className="text-red-400 animate-spin" />
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-300 rounded-md font-bold">RECOMMENDED</span>
                  <ArrowRight size={16} className="text-zinc-500" />
                </div>
              )}
            </div>
            {paymentType === 'subscription' && (
              <p className="text-[11px] text-zinc-500 mt-2 ml-13">
                Auto-renews monthly · Cancel anytime from your billing page
              </p>
            )}
          </button>

          {/* Crypto — Secondary */}
          <button
            onClick={() => setMethod('crypto')}
            disabled={redirecting}
            className="w-full p-4 rounded-xl border border-zinc-700/50 hover:border-zinc-600 bg-zinc-800/30 transition-all cursor-pointer text-left"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Wallet size={20} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Pay with Crypto</p>
                  <p className="text-xs text-zinc-400">BTC, ETH, USDT, SOL & more</p>
                </div>
              </div>
              <ArrowRight size={16} className="text-zinc-600" />
            </div>
            {paymentType === 'subscription' && (
              <p className="text-[11px] text-zinc-500 mt-2 ml-13">
                One-time 30-day access · Renew manually each month
              </p>
            )}
          </button>

          {/* Trust signals */}
          <div className="flex items-center justify-center gap-1.5 pt-2">
            <Shield size={12} className="text-zinc-600" />
            <p className="text-[10px] text-zinc-600">
              Payments processed securely · SSL encrypted
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
