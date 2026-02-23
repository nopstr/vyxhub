import { useState } from 'react'
import { X, DollarSign, Heart, Sparkles, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { MIN_TIP_AMOUNT, MAX_TIP_AMOUNT, PLATFORM_FEE_PERCENT } from '../lib/constants'
import { cn, haptic } from '../lib/utils'
import Button from './ui/Button'
import PaymentModal from './PaymentModal'
import { toast } from 'sonner'

const QUICK_AMOUNTS = [1, 5, 10, 25, 50, 100]

export default function TipModal({ open, onClose, creator, postId = null }) {
  const { user } = useAuthStore()
  const [amount, setAmount] = useState(5)
  const [customAmount, setCustomAmount] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [isCustom, setIsCustom] = useState(false)
  const [showCrypto, setShowCrypto] = useState(false)

  if (!open) return null

  const currentAmount = isCustom ? parseFloat(customAmount) || 0 : amount
  const isValid = currentAmount >= MIN_TIP_AMOUNT && currentAmount <= MAX_TIP_AMOUNT

  const handleSendTip = async () => {
    if (!user) return toast.error('Sign in to send tips')
    if (!isValid) return toast.error(`Tip must be between $${MIN_TIP_AMOUNT} and $${MAX_TIP_AMOUNT}`)
    if (user.id === creator.id) return toast.error("You can't tip yourself")

    setShowCrypto(true)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-md mx-4 bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
          >
            <X size={16} />
          </button>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20">
              <DollarSign size={20} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Send a Tip</h3>
              <p className="text-sm text-zinc-400">to @{creator.username}</p>
            </div>
          </div>
        </div>

        {/* Quick amounts */}
        <div className="px-6 pb-4">
          <div className="grid grid-cols-3 gap-2 mb-3">
            {QUICK_AMOUNTS.map(amt => (
              <button
                key={amt}
                onClick={() => {
                  setAmount(amt)
                  setIsCustom(false)
                }}
                className={cn(
                  'py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer',
                  !isCustom && amount === amt
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20 scale-105'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'
                )}
              >
                ${amt}
              </button>
            ))}
          </div>

          {/* Custom amount */}
          <div
            className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors',
              isCustom ? 'border-amber-500/50 bg-zinc-800' : 'border-zinc-700 bg-zinc-800/50'
            )}
          >
            <DollarSign size={16} className="text-zinc-500" />
            <input
              type="number"
              value={customAmount}
              onChange={e => {
                setCustomAmount(e.target.value)
                setIsCustom(true)
              }}
              onFocus={() => setIsCustom(true)}
              min={MIN_TIP_AMOUNT}
              max={MAX_TIP_AMOUNT}
              step="0.01"
              placeholder="Custom amount..."
              className="flex-1 bg-transparent text-white text-sm placeholder:text-zinc-500 outline-none"
            />
          </div>

          {/* Message (optional) */}
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={200}
            placeholder="Add a message (optional)..."
            rows={2}
            className="w-full mt-3 px-4 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700 text-sm text-white placeholder:text-zinc-500 outline-none focus:border-amber-500/50 resize-none transition-colors"
          />
        </div>

        {/* Summary & Send */}
        <div className="px-6 pb-6">
          {isValid && (
            <div className="flex items-center justify-between text-sm mb-4 px-1">
              <span className="text-zinc-400">Total</span>
              <span className="text-xl font-black text-white">${currentAmount.toFixed(2)}</span>
            </div>
          )}

          <Button
            variant="premium"
            className="w-full py-3"
            onClick={handleSendTip}
            loading={loading}
            disabled={!isValid}
          >
            <Heart size={16} className="fill-current" />
            Send ${isValid ? currentAmount.toFixed(2) : '0.00'} Tip
          </Button>

          {/* Crypto payment option */}
          <p className="text-[11px] text-zinc-600 text-center mt-4">
            Creator receives {100 - PLATFORM_FEE_PERCENT}% · Tips are non-refundable
          </p>
        </div>

        {/* Payment Modal */}
        {showCrypto && (
          <PaymentModal
            open={showCrypto}
            onClose={() => setShowCrypto(false)}
            amount={currentAmount}
            paymentType="tip"
            metadata={{
              creator_id: creator.id,
              post_id: postId || null,
              message: message || null,
            }}
            label={`Tip @${creator.username}`}
            onSuccess={() => {
              haptic('success')
              toast.success(`Sent $${currentAmount.toFixed(2)} tip to @${creator.username}!`, { icon: '💸' })
              onClose()
            }}
          />
        )}
      </div>
    </div>
  )
}
