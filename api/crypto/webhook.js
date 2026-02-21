/**
 * POST /api/crypto/webhook
 * Receives IPN (Instant Payment Notification) callbacks from NOWPayments.
 * Verifies HMAC-SHA512 signature, updates payment status, and triggers
 * business logic processing when payment is confirmed.
 * 
 * Environment variables required:
 *   SUPABASE_URL (or VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NOWPAYMENTS_IPN_SECRET
 */

import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET

/**
 * Sort object keys alphabetically (required for NOWPayments HMAC)
 */
function sortObject(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return obj
  }
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
    console.warn('NOWPAYMENTS_IPN_SECRET not set — skipping signature verification')
    return true // Allow in development
  }
  if (!signature) return false

  const hmac = createHmac('sha512', IPN_SECRET)
  hmac.update(JSON.stringify(sortObject(payload)))
  const expected = hmac.digest('hex')
  return expected === signature
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // -- Verify IPN signature --
    const signature = req.headers['x-nowpayments-sig']
    if (!verifySignature(req.body, signature)) {
      console.error('Invalid IPN signature')
      return res.status(401).json({ error: 'Invalid signature' })
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('Missing Supabase environment variables')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const {
      payment_id,
      payment_status,
      pay_address,
      pay_amount,
      actually_paid,
      outcome_amount,
      order_id,
      order_description,
    } = req.body

    if (!payment_id || !payment_status) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    console.log(`IPN received: payment_id=${payment_id}, status=${payment_status}, actually_paid=${actually_paid}`)

    // Build provider data from the webhook payload
    const providerData = {
      payment_status,
      actually_paid: actually_paid || null,
      outcome_amount: outcome_amount || null,
      pay_amount: pay_amount || null,
      pay_address: pay_address || null,
      ipn_received_at: new Date().toISOString(),
      raw_webhook: req.body,
    }

    // -- Update payment status via RPC --
    // The RPC handles status transitions and triggers business logic
    // when payment reaches confirmed/finished state
    const { data, error } = await supabase.rpc('update_crypto_payment_status', {
      p_provider_payment_id: String(payment_id),
      p_status: payment_status,
      p_provider_data: providerData,
    })

    if (error) {
      console.error('Webhook RPC error:', error)
      // Return 200 anyway to prevent NOWPayments from retrying endlessly
      // for database errors. Log the error for manual investigation.
      return res.status(200).json({ ok: false, error: error.message })
    }

    if (!data) {
      console.warn(`No matching crypto_payment found for provider_payment_id: ${payment_id}`)
      return res.status(200).json({ ok: false, error: 'Payment not found' })
    }

    console.log(`IPN processed: payment_id=${payment_id}, crypto_payment_id=${data}`)
    return res.status(200).json({ ok: true })

  } catch (err) {
    console.error('Webhook error:', err)
    // Return 200 to prevent infinite retries
    return res.status(200).json({ ok: false, error: err.message })
  }
}
