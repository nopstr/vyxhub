import { useState } from 'react'
import { Flag, AlertTriangle } from 'lucide-react'
import Modal from './ui/Modal'
import Button from './ui/Button'
import { Textarea } from './ui/Input'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { toast } from 'sonner'

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam', description: 'Unsolicited or repetitive content' },
  { value: 'harassment', label: 'Harassment', description: 'Bullying or targeted abuse' },
  { value: 'underage', label: 'Underage Content', description: 'Involves or depicts minors' },
  { value: 'non_consensual', label: 'Non-Consensual', description: 'Content shared without consent' },
  { value: 'illegal_content', label: 'Illegal Content', description: 'Violates applicable laws' },
  { value: 'impersonation', label: 'Impersonation', description: 'Pretending to be someone else' },
  { value: 'copyright', label: 'Copyright / DMCA', description: 'Infringes on intellectual property' },
  { value: 'other', label: 'Other', description: 'Something else not listed above' },
]

export default function ReportModal({ open, onClose, postId, userId, username }) {
  const { user } = useAuthStore()
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!reason) return toast.error('Please select a reason')
    if (!user) return toast.error('Sign in to report')

    setSubmitting(true)
    try {
      const report = {
        reporter_id: user.id,
        reason,
        description: description.trim() || null,
      }
      if (postId) report.reported_post_id = postId
      if (userId) report.reported_user_id = userId
      // If reporting a post, also set the post's author as reported_user_id
      if (postId && userId) report.reported_user_id = userId

      const { error } = await supabase.from('reports').insert(report)
      if (error) {
        if (error.code === '23505') {
          toast.error('You have already reported this')
        } else {
          throw error
        }
      } else {
        toast.success('Report submitted. Our team will review it.')
      }
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to submit report')
    } finally {
      setSubmitting(false)
    }
  }

  const resetAndClose = () => {
    setReason('')
    setDescription('')
    onClose()
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Report Content">
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
          <AlertTriangle size={16} className="flex-shrink-0" />
          <span>
            {username
              ? `Report @${username}'s content`
              : 'Why are you reporting this?'}
          </span>
        </div>

        <div className="space-y-1.5">
          {REPORT_REASONS.map(r => (
            <label
              key={r.value}
              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors border ${
                reason === r.value
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-zinc-900/30 border-zinc-800/50 text-zinc-300 hover:bg-zinc-900/50'
              }`}
            >
              <input
                type="radio"
                name="reportReason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="sr-only"
              />
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                reason === r.value ? 'border-red-500' : 'border-zinc-600'
              }`}>
                {reason === r.value && <div className="w-2 h-2 rounded-full bg-red-500" />}
              </div>
              <div>
                <span className="text-sm font-medium">{r.label}</span>
                <p className="text-xs text-zinc-500">{r.description}</p>
              </div>
            </label>
          ))}
        </div>

        <Textarea
          label="Additional details (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Provide any additional context..."
        />

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={resetAndClose} className="flex-1">
            Cancel
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={submitting} className="flex-1" disabled={!reason}>
            <Flag size={16} />
            Submit Report
          </Button>
        </div>
      </div>
    </Modal>
  )
}
