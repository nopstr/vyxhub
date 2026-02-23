/**
 * POST /api/crypto/payout-webhook
 * Receives IPN callbacks from NOWPayments for payout/withdrawal status updates.
 * Updates payout_requests with new status and blockchain tx hash.
 * 
 * NOWPayments withdrawal statuses:
 *   CREATING → WAITING → PROCESSING → SENDING → FINISHED | FAILED | REJECTED
 * 
 * Environment variables required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NOWPAYMENTS_IPN_SECRET
 */

import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://agoekmugbrswrdjscwek.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET

/**
 * Sort object keys alphabetically (required for NOWPayments HMAC)
 */
function sortObject(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return obj
  return Object.keys(obj).sort().reduce((sorted, key) => {
    sorted[key] = sortObject(obj[key])
    return sorted
  }, {})
}

/**
 * Verify NOWPayments IPN signature
 */
function verifySignature(payload, signature) {
  if (!IPN_SECRET) {
    console.error('CRITICAL: NOWPAYMENTS_IPN_SECRET not set - failing closed')
    return false
  }
  if (!signature) return false

  const sorted = sortObject(payload)
  const hmac = createHmac('sha512', IPN_SECRET)
  hmac.update(JSON.stringify(sorted))
  const expectedSig = hmac.digest('hex')
  return expectedSig === signature
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const payload = req.body
    const signature = req.headers['x-nowpayments-sig']

    // Verify HMAC signature
    if (!verifySignature(payload, signature)) {
      console.error('Payout webhook: Invalid signature')
      return res.status(403).json({ error: 'Invalid signature' })
    }

    console.log('Payout webhook received:', JSON.stringify({
      id: payload.id,
      batch_withdrawal_id: payload.batch_withdrawal_id,
      status: payload.status,
      currency: payload.currency,
      amount: payload.amount,
      hash: payload.hash
    }))

    // The payload contains the withdrawal ID and status
    const withdrawalId = payload.id?.toString()
    const status = payload.status
    const txHash = payload.hash || null

    if (!withdrawalId || !status) {
      console.error('Payout webhook: Missing withdrawal ID or status')
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Update in database via service_role RPC
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { data, error } = await supabase.rpc('update_payout_from_webhook', {
      p_withdrawal_id: withdrawalId,
      p_status: status,
      p_hash: txHash
    })

    if (error) {
      console.error('Payout webhook DB error:', error)
      // Return 200 anyway to prevent NOWPayments from retrying endlessly
      // but we should still log the error for investigation
      return res.status(200).json({ ok: true, warning: 'DB update failed' })
    }

    console.log('Payout webhook processed:', data)
    return res.status(200).json({ ok: true, ...data })

  } catch (err) {
    console.error('Payout webhook error:', err)
    // Return 200 to prevent infinite retries
    return res.status(200).json({ ok: true, error: 'Internal error logged' })
  }
}
