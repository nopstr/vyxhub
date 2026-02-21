import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Copy, Check, Clock, Loader2, ChevronLeft, AlertCircle, CheckCircle2, ExternalLink, RefreshCw, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import {
  SUPPORTED_CRYPTOS,
  CRYPTO_ICONS,
  getCryptoById,
  formatCryptoAmount,
  estimateCryptoAmount,
  fetchCryptoPrices,
  createCryptoPayment,
  formatCountdown,
  getPaymentStatusLabel,
  isTerminalStatus,
} from '../lib/crypto'
import { cn, haptic } from '../lib/utils'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import { toast } from 'sonner'

const POLL_INTERVAL = 12_000 // 12 seconds fallback polling

/**
 * CryptoPaymentModal — Full cryptocurrency payment flow
 * 
 * Steps:
 * 1. select  — User picks a cryptocurrency (prices shown via CoinGecko)
 * 2. creating — Payment being created with NOWPayments
 * 3. awaiting — Showing payment address, amount, countdown timer
 * 4. success  — Payment confirmed and processed
 * 5. expired  — Payment timed out
 * 6. error    — Something went wrong
 */
export default function CryptoPaymentModal({
  open,
  onClose,
  amount,        // USD amount to pay
  paymentType,   // 'subscription' | 'tip' | 'ppv_post' | 'message_unlock' | 'payment_request' | 'plus_subscription'
  metadata = {}, // { creator_id, post_id, message, conversation_id, message_id, referrer_id }
  onSuccess,     // Called when payment is confirmed and business logic is processed
  label = '',    // Optional label e.g. "Subscribe to @username"
}) {
  const { user } = useAuthStore()

  // State
  const [step, setStep] = useState('select')
  const [prices, setPrices] = useState(null)
  const [loadingPrices, setLoadingPrices] = useState(true)
  const [selectedCrypto, setSelectedCrypto] = useState(null)
  const [payment, setPayment] = useState(null)
  const [copied, setCopied] = useState(null)
  const [timeLeft, setTimeLeft] = useState(null)
  const [error, setError] = useState(null)

  // Refs for cleanup
  const channelRef = useRef(null)
  const pollRef = useRef(null)
  const timerRef = useRef(null)
  const mountedRef = useRef(true)

  // ── Fetch prices on mount ──
  useEffect(() => {
    if (!open) return
    mountedRef.current = true
    loadPrices()

    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [open])

  const loadPrices = async () => {
    setLoadingPrices(true)
    try {
      const data = await fetchCryptoPrices()
      if (mountedRef.current) setPrices(data)
    } catch {
      if (mountedRef.current) setError('Failed to load crypto prices. Please try again.')
    } finally {
      if (mountedRef.current) setLoadingPrices(false)
    }
  }

  // ── Cleanup subscriptions/timers ──
  const cleanup = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // ── Handle crypto selection ──
  const handleSelectCrypto = async (crypto) => {
    setSelectedCrypto(crypto)
    setStep('creating')
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Please sign in to continue')

      const paymentData = await createCryptoPayment({
        accessToken: session.access_token,
        usdAmount: amount,
        cryptoCurrency: crypto.id,
        paymentType,
        metadata,
      })

      if (!mountedRef.current) return

      setPayment(paymentData)
      setStep('awaiting')

      // Start countdown timer
      if (paymentData.expires_at) {
        startCountdown(paymentData.expires_at)
      }

      // Subscribe to realtime updates
      subscribeToUpdates(paymentData.id)

      // Start fallback polling
      startPolling(paymentData.id)

    } catch (err) {
      if (!mountedRef.current) return
      setError(err.message)
      setStep('error')
    }
  }

  // ── Realtime subscription ──
  const subscribeToUpdates = (paymentId) => {
    channelRef.current = supabase
      .channel(`crypto-pay-${paymentId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'crypto_payments',
        filter: `id=eq.${paymentId}`,
      }, (payload) => {
        if (mountedRef.current) handleStatusUpdate(payload.new)
      })
      .subscribe()
  }

  // ── Fallback polling ──
  const startPolling = (paymentId) => {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('crypto_payments')
          .select('*')
          .eq('id', paymentId)
          .single()
        if (data && mountedRef.current) handleStatusUpdate(data)
      } catch { /* ignore polling errors */ }
    }, POLL_INTERVAL)
  }

  // ── Handle status changes ──
  const handleStatusUpdate = (record) => {
    setPayment(prev => ({ ...prev, ...record }))

    if (record.payment_status === 'finished' && record.is_processed) {
      setStep('success')
      haptic('success')
      cleanup()
      // Give the user a moment to see the success state
      setTimeout(() => {
        if (mountedRef.current) onSuccess?.()
      }, 1800)
    } else if (record.payment_status === 'expired') {
      setStep('expired')
      cleanup()
    } else if (record.payment_status === 'failed') {
      setStep('error')
      setError('Payment failed. Please try again.')
      cleanup()
    } else if (record.payment_status === 'confirming') {
      // Payment detected on blockchain, waiting for confirmations
      setStep('awaiting')
    }
  }

  // ── Countdown timer ──
  const startCountdown = (expiresAt) => {
    const tick = () => {
      const diff = new Date(expiresAt) - new Date()
      if (diff <= 0) {
        setTimeLeft(0)
        clearInterval(timerRef.current)
        return
      }
      setTimeLeft(Math.floor(diff / 1000))
    }
    tick()
    timerRef.current = setInterval(tick, 1000)
  }

  // ── Copy to clipboard ──
  const handleCopy = async (text, type) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      haptic('light')
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  // ── Back to crypto selection ──
  const handleBack = () => {
    cleanup()
    setSelectedCrypto(null)
    setPayment(null)
    setError(null)
    setTimeLeft(null)
    setStep('select')
  }

  // ── Close modal ──
  const handleClose = () => {
    cleanup()
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-md mx-4 bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-zinc-800/60">
          {(step === 'awaiting' || step === 'error') && (
            <button
              onClick={handleBack}
              className="p-1.5 -ml-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20">
              <Wallet size={18} className="text-amber-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate">
                {step === 'success' ? 'Payment Complete' : 'Pay with Crypto'}
              </h3>
              {label && <p className="text-xs text-zinc-500 truncate">{label}</p>}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Content (scrollable) ── */}
        <div className="overflow-y-auto flex-1 overscroll-contain">

          {/* ─── STEP: Select Crypto ─── */}
          {step === 'select' && (
            <div className="p-5 space-y-4">
              {/* Amount display */}
              <div className="text-center py-2">
                <p className="text-sm text-zinc-400 mb-1">Amount to pay</p>
                <p className="text-3xl font-black text-white">${parseFloat(amount).toFixed(2)}</p>
              </div>

              {/* Loading state */}
              {loadingPrices && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Spinner size="lg" />
                  <p className="text-sm text-zinc-400">Loading prices...</p>
                </div>
              )}

              {/* Error state */}
              {error && !loadingPrices && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <AlertCircle size={32} className="text-red-400" />
                  <p className="text-sm text-red-400 text-center">{error}</p>
                  <Button variant="secondary" size="sm" onClick={loadPrices}>
                    <RefreshCw size={14} /> Retry
                  </Button>
                </div>
              )}

              {/* Crypto grid */}
              {prices && !loadingPrices && (
                <>
                  <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Select cryptocurrency</p>
                  <div className="space-y-2">
                    {[...SUPPORTED_CRYPTOS]
                      .sort((a, b) => {
                        // Put stablecoins first for small amounts
                        const aStable = a.id === 'usdt' || a.id === 'usdc'
                        const bStable = b.id === 'usdt' || b.id === 'usdc'
                        if (aStable && !bStable) return -1
                        if (!aStable && bStable) return 1
                        return 0
                      })
                      .map(crypto => {
                      const estimated = estimateCryptoAmount(amount, prices, crypto.id)
                      const belowMin = parseFloat(amount) < (crypto.minUsd || 0)
                      return (
                        <button
                          key={crypto.id}
                          onClick={() => !belowMin && handleSelectCrypto(crypto)}
                          disabled={belowMin}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all",
                            belowMin
                              ? "bg-zinc-900/30 border-zinc-800/30 opacity-40 cursor-not-allowed"
                              : "bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600 hover:bg-zinc-800 cursor-pointer group"
                          )}
                        >
                          {/* Icon */}
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                            style={{ backgroundColor: `${crypto.color}20`, color: crypto.color }}
                          >
                            {CRYPTO_ICONS[crypto.id]}
                          </div>
                          {/* Name */}
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-sm font-semibold text-white">{crypto.name}</p>
                            <p className="text-xs text-zinc-500">{crypto.symbol}</p>
                          </div>
                          {/* Estimated amount */}
                          <div className="text-right">
                            {belowMin ? (
                              <p className="text-xs text-zinc-500">Min ${crypto.minUsd?.toFixed(2)}</p>
                            ) : (
                              <>
                                <p className="text-sm font-mono text-zinc-200">
                                  {estimated !== null ? formatCryptoAmount(estimated, crypto.id) : '...'}
                                </p>
                                <p className="text-[10px] text-zinc-500">{crypto.symbol}</p>
                              </>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[11px] text-zinc-600 text-center">
                    Network fees are added to the total and paid by sender.
                    Final amount shown after selection.
                  </p>
                </>
              )}
            </div>
          )}

          {/* ─── STEP: Creating Payment ─── */}
          {step === 'creating' && (
            <div className="flex flex-col items-center gap-4 py-16 px-5">
              <Spinner size="lg" />
              <div className="text-center">
                <p className="text-white font-semibold mb-1">Creating Payment</p>
                <p className="text-sm text-zinc-400">
                  Setting up your {selectedCrypto?.name} payment...
                </p>
              </div>
            </div>
          )}

          {/* ─── STEP: Awaiting Payment ─── */}
          {step === 'awaiting' && payment && (
            <div className="p-5 space-y-5">
              {/* Selected crypto badge */}
              {selectedCrypto && (
                <div className="flex items-center justify-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: `${selectedCrypto.color}20`, color: selectedCrypto.color }}
                  >
                    {CRYPTO_ICONS[selectedCrypto.id]}
                  </div>
                  <span className="text-sm font-medium text-zinc-300">
                    {selectedCrypto.name} Payment
                  </span>
                </div>
              )}

              {/* Amount to send */}
              <div className="bg-zinc-800/60 rounded-2xl p-4 border border-zinc-700/40">
                <p className="text-xs text-zinc-400 mb-2 font-medium">Send exactly</p>
                <div className="flex items-center gap-3">
                  <p className="text-2xl font-mono font-bold text-white flex-1 break-all">
                    {payment.pay_amount} <span className="text-zinc-400 text-base">{selectedCrypto?.symbol}</span>
                  </p>
                  <button
                    onClick={() => handleCopy(payment.pay_amount, 'amount')}
                    className={cn(
                      'p-2.5 rounded-xl border transition-all cursor-pointer shrink-0',
                      copied === 'amount'
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : 'bg-zinc-700/50 border-zinc-600/50 text-zinc-400 hover:text-white hover:bg-zinc-700'
                    )}
                  >
                    {copied === 'amount' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mt-1.5">
                  ≈ ${parseFloat(amount).toFixed(2)} USD + network fee
                </p>
              </div>

              {/* Address to send to */}
              <div className="bg-zinc-800/60 rounded-2xl p-4 border border-zinc-700/40">
                <p className="text-xs text-zinc-400 mb-2 font-medium">To this address</p>
                <div className="flex items-start gap-3">
                  <p className="text-sm font-mono text-white flex-1 break-all leading-relaxed">
                    {payment.pay_address}
                  </p>
                  <button
                    onClick={() => handleCopy(payment.pay_address, 'address')}
                    className={cn(
                      'p-2.5 rounded-xl border transition-all cursor-pointer shrink-0',
                      copied === 'address'
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : 'bg-zinc-700/50 border-zinc-600/50 text-zinc-400 hover:text-white hover:bg-zinc-700'
                    )}
                  >
                    {copied === 'address' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              {/* Status & Timer */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  {payment.payment_status === 'waiting' && (
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                  {payment.payment_status === 'confirming' && (
                    <Loader2 size={14} className="text-blue-400 animate-spin" />
                  )}
                  {(payment.payment_status === 'confirmed' || payment.payment_status === 'sending') && (
                    <Loader2 size={14} className="text-emerald-400 animate-spin" />
                  )}
                  <span className={cn(
                    'text-sm font-medium',
                    payment.payment_status === 'waiting' && 'text-amber-400',
                    payment.payment_status === 'confirming' && 'text-blue-400',
                    (payment.payment_status === 'confirmed' || payment.payment_status === 'sending') && 'text-emerald-400',
                  )}>
                    {getPaymentStatusLabel(payment.payment_status)}
                  </span>
                </div>

                {timeLeft !== null && timeLeft > 0 && payment.payment_status === 'waiting' && (
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <Clock size={13} />
                    <span className={cn(
                      'text-sm font-mono',
                      timeLeft < 300 && 'text-red-400'
                    )}>
                      {formatCountdown(timeLeft)}
                    </span>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div className="bg-zinc-800/30 rounded-xl p-3 border border-zinc-800/60">
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Send the <strong className="text-zinc-400">exact amount</strong> shown above to the address provided.
                  Your payment will be confirmed after blockchain verification.
                  You can safely close this window — your payment will still be processed.
                </p>
              </div>
            </div>
          )}

          {/* ─── STEP: Success ─── */}
          {step === 'success' && (
            <div className="flex flex-col items-center gap-4 py-12 px-5">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-400" />
              </div>
              <div className="text-center">
                <h4 className="text-xl font-bold text-white mb-1">Payment Confirmed!</h4>
                <p className="text-sm text-zinc-400">
                  Your {selectedCrypto?.name} payment of ${parseFloat(amount).toFixed(2)} has been processed.
                </p>
              </div>
              <Button variant="primary" onClick={handleClose} className="mt-2">
                Done
              </Button>
            </div>
          )}

          {/* ─── STEP: Expired ─── */}
          {step === 'expired' && (
            <div className="flex flex-col items-center gap-4 py-12 px-5">
              <div className="w-16 h-16 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center">
                <Clock size={32} className="text-zinc-500" />
              </div>
              <div className="text-center">
                <h4 className="text-lg font-bold text-white mb-1">Payment Expired</h4>
                <p className="text-sm text-zinc-400">
                  The payment window has closed. No funds were charged.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={handleBack}>
                  Try Again
                </Button>
                <Button variant="ghost" onClick={handleClose}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* ─── STEP: Error ─── */}
          {step === 'error' && (
            <div className="flex flex-col items-center gap-4 py-12 px-5">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center">
                <AlertCircle size={32} className="text-red-400" />
              </div>
              <div className="text-center">
                <h4 className="text-lg font-bold text-white mb-1">Payment Error</h4>
                <p className="text-sm text-red-400">{error || 'Something went wrong'}</p>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={handleBack}>
                  Try Again
                </Button>
                <Button variant="ghost" onClick={handleClose}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
