import { useState } from 'react'
import { X, Zap, Check, DollarSign, Tag, Loader2, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useSubscriptionCache } from '../stores/subscriptionCache'
import Avatar from './ui/Avatar'
import Badge from './ui/Badge'
import PaymentModal from './PaymentModal'
import { toast } from 'sonner'
import { haptic } from '../lib/utils'

export default function SubscribeModal({ open, onClose, creator, onSubscribed }) {
  const { user } = useAuthStore()
  const { addSubscription } = useSubscriptionCache()
  const [promoCode, setPromoCode] = useState('')
  const [promoResult, setPromoResult] = useState(null)
  const [validatingCode, setValidatingCode] = useState(false)
  const [activePromo, setActivePromo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [promoChecked, setPromoChecked] = useState(false)
  const [showCrypto, setShowCrypto] = useState(false)

  // Fetch active promotion on mount
  useState(() => {
    if (creator?.id) {
      supabase.rpc('get_active_promotion', { p_creator_id: creator.id })
        .then(({ data }) => {
          if (data) setActivePromo(data)
        })
    }
  })

  if (!open || !creator) return null

  const basePrice = parseFloat(creator.subscription_price) || 0
  const benefits = Array.isArray(creator.subscription_benefits) ? creator.subscription_benefits : []

  // Calculate effective price
  let effectivePrice = basePrice
  let discountPct = 0
  if (promoResult?.valid) {
    discountPct = promoResult.discount_percent
    effectivePrice = +(basePrice * (100 - discountPct) / 100).toFixed(2)
  } else if (activePromo) {
    discountPct = activePromo.discount_percent
    effectivePrice = parseFloat(activePromo.promo_price) || basePrice
  }

  const handleValidatePromo = async () => {
    if (!promoCode.trim()) return
    setValidatingCode(true)
    try {
      const { data, error } = await supabase.rpc('validate_promo_code', {
        p_code: promoCode.trim(),
        p_creator_id: creator.id,
      })
      if (error) throw error
      if (data?.valid) {
        setPromoResult(data)
        toast.success(`${data.discount_percent}% discount applied!`)
      } else {
        toast.error(data?.error || 'Invalid promo code')
      }
    } catch (err) {
      toast.error(err.message || 'Failed to validate code')
    } finally {
      setValidatingCode(false)
      setPromoChecked(true)
    }
  }

  const handleSubscribe = async () => {
    if (!user) return toast.error('Sign in to subscribe')
    
    // If price is 0 (100% discount), we can bypass crypto payment
    if (effectivePrice === 0) {
      setLoading(true)
      try {
        const { data: subResult, error } = await supabase.rpc('process_subscription', {
          p_subscriber_id: user.id,
          p_creator_id: creator.id,
          p_price: 0,
          p_referrer_id: null,
        })
        if (error) throw error

        // Redeem promo code if used
        if (promoResult?.code_id) {
          await supabase.rpc('redeem_promo_code', {
            p_code_id: promoResult.code_id,
            p_original_amount: basePrice,
            p_discount_amount: basePrice,
          })
        }

        addSubscription(creator.id)
        await supabase.from('follows').insert({
          follower_id: user.id,
          following_id: creator.id
        }).catch(() => {})

        haptic('success')
        toast.success(`Subscribed to @${creator.username}!`)
        onSubscribed?.()
        onClose()
      } catch (err) {
        toast.error(err.message || 'Failed to subscribe')
      } finally {
        setLoading(false)
      }
    } else {
      // Open crypto payment modal
      setShowCrypto(true)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with creator info */}
        <div className="relative bg-gradient-to-br from-red-900/40 via-zinc-900 to-orange-900/40 px-5 pt-5 pb-4">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-3 mb-3">
            <Avatar src={creator.avatar_url} alt={creator.display_name} size="lg" />
            <div>
              <h3 className="text-lg font-bold text-white">{creator.display_name}</h3>
              <p className="text-zinc-400 text-sm">@{creator.username}</p>
            </div>
          </div>
          {creator.bio && (
            <p className="text-zinc-300 text-sm line-clamp-2">{creator.bio}</p>
          )}
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Benefits list */}
          {benefits.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">What you get</h4>
              <ul className="space-y-2">
                {benefits.map((benefit, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-200">
                    <Check size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Default benefits if creator hasn't set any */}
          {benefits.length === 0 && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">What you get</h4>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm text-zinc-200">
                  <Check size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                  <span>Full access to exclusive content</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-zinc-200">
                  <Check size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                  <span>Direct messaging with the creator</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-zinc-200">
                  <Check size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                  <span>Support your favorite creator</span>
                </li>
              </ul>
            </div>
          )}

          {/* Pricing */}
          <div className="bg-zinc-800/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-zinc-400">Monthly subscription</span>
              <div className="flex items-baseline gap-1.5">
                {discountPct > 0 && (
                  <span className="text-sm text-zinc-500 line-through">${basePrice.toFixed(2)}</span>
                )}
                <span className="text-xl font-bold text-white">${effectivePrice.toFixed(2)}</span>
                <span className="text-sm text-zinc-400">/mo</span>
              </div>
            </div>
            {discountPct > 0 && (
              <div className="flex justify-end">
                <Badge variant="premium" className="text-[10px]">
                  {discountPct}% OFF
                </Badge>
              </div>
            )}
          </div>

          {/* Promo code input */}
          <div>
            {!promoResult ? (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={promoCode}
                    onChange={e => setPromoCode(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase())}
                    placeholder="Promo code"
                    maxLength={20}
                    className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-red-500/50"
                    onKeyDown={e => e.key === 'Enter' && handleValidatePromo()}
                  />
                </div>
                <button
                  onClick={handleValidatePromo}
                  disabled={!promoCode.trim() || validatingCode}
                  className="px-3 py-2 text-sm font-medium text-red-400 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  {validatingCode ? <Loader2 size={16} className="animate-spin" /> : 'Apply'}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                <span className="text-sm text-emerald-400 font-medium">
                  ✓ Code &quot;{promoCode}&quot; — {promoResult.discount_percent}% off
                </span>
                <button
                  onClick={() => { setPromoResult(null); setPromoCode(''); setPromoChecked(false) }}
                  className="text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Subscribe button */}
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-bold rounded-xl py-3 transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                <Zap size={16} className="fill-current" />
                {effectivePrice === 0 ? 'Subscribe for Free' : `Subscribe — $${effectivePrice.toFixed(2)}/mo`}
              </>
            )}
          </button>

          <p className="text-[11px] text-zinc-600 text-center mt-4">
            Cancel anytime. Payments processed securely.
          </p>
        </div>
      </div>

      {/* Payment Modal */}
      {showCrypto && (
        <PaymentModal
          open={showCrypto}
          onClose={() => setShowCrypto(false)}
          amount={effectivePrice}
          paymentType="subscription"
          metadata={{ creator_id: creator.id }}
          label={`Subscribe to @${creator.username}`}
          onSuccess={() => {
            addSubscription(creator.id)
            supabase.from('follows').insert({
              follower_id: user.id,
              following_id: creator.id
            }).catch(() => {})
            haptic('success')
            toast.success(`Subscribed to @${creator.username}!`)
            onSubscribed?.()
            onClose()
          }}
        />
      )}
    </div>
  )
}
