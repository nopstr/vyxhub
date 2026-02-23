import { useNavigate } from 'react-router-dom'
import { XCircle } from 'lucide-react'
import Button from '../../components/ui/Button'

/**
 * /payment/cancel — Return page when user cancels or payment is declined at Segpay.
 */
export default function PaymentCancelPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center mx-auto">
          <XCircle size={40} className="text-zinc-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Payment Cancelled</h2>
          <p className="text-sm text-zinc-400 mt-2">No charges were made. You can try again anytime.</p>
        </div>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => navigate(-1)}
        >
          Go Back
        </Button>
      </div>
    </div>
  )
}
