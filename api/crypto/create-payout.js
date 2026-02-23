/**
 * POST /api/crypto/create-payout
 * Creates a USDT (TRC-20) payout via NOWPayments Mass Payout API.
 * Called from the Admin Panel when approving a payout request.
 * 
 * Request body: { payout_id }
 * Auth: Bearer token (Supabase access token from admin user)
 * 
 * Environment variables required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NOWPAYMENTS_API_KEY
 *   NOWPAYMENTS_EMAIL
 *   NOWPAYMENTS_PASSWORD
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://agoekmugbrswrdjscwek.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY
const NOWPAYMENTS_EMAIL = process.env.NOWPAYMENTS_EMAIL
const NOWPAYMENTS_PASSWORD = process.env.NOWPAYMENTS_PASSWORD
const NOWPAYMENTS_BASE = 'https://api.nowpayments.io/v1'
const APP_URL = process.env.APP_URL || 'https://vyxhub.vercel.app'

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', APP_URL)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // ── 1. Verify admin auth ────────────────────────────────────────
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization' })
    }

    const token = authHeader.split(' ')[1]
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Verify the token and get user
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('system_role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'manager'].includes(profile.system_role)) {
      return res.status(403).json({ error: 'Admin access required' })
    }

    // ── 2. Get payout request ───────────────────────────────────────
    const { payout_id } = req.body
    if (!payout_id) {
      return res.status(400).json({ error: 'payout_id is required' })
    }

    const { data: payout, error: payoutErr } = await supabase
      .from('payout_requests')
      .select('*')
      .eq('id', payout_id)
      .single()

    if (payoutErr || !payout) {
      return res.status(404).json({ error: 'Payout request not found' })
    }

    if (payout.status !== 'pending') {
      return res.status(400).json({ error: `Payout is already ${payout.status}` })
    }

    // ── 3. Validate payout method is crypto ─────────────────────────
    if (payout.payout_method !== 'crypto') {
      // For non-crypto payouts, just approve via RPC (manual bank/PayPal transfer)
      const { data: result, error: rpcErr } = await supabase.rpc('admin_process_payout', {
        p_payout_id: payout_id,
        p_action: 'approve',
        p_note: `Approved by ${user.email} (manual payout)`
      })

      if (rpcErr) throw rpcErr
      return res.status(200).json({ success: true, method: 'manual', ...result })
    }

    // ── 4. Validate wallet address ──────────────────────────────────
    const walletAddress = payout.payout_wallet_address
    if (!walletAddress) {
      return res.status(400).json({ error: 'Creator has no wallet address configured' })
    }

    // Validate address with NOWPayments
    const validateRes = await fetch(`${NOWPAYMENTS_BASE}/payout/validate-address`, {
      method: 'POST',
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        address: walletAddress,
        currency: 'usdttrc20',
        extra_id: null
      })
    })

    if (!validateRes.ok) {
      const err = await validateRes.json().catch(() => ({}))
      return res.status(400).json({ 
        error: 'Invalid wallet address', 
        details: err.message || 'Address validation failed'
      })
    }

    // ── 5. Authenticate with NOWPayments (get JWT) ──────────────────
    if (!NOWPAYMENTS_EMAIL || !NOWPAYMENTS_PASSWORD) {
      // If credentials not configured, fall back to manual approve
      const { error: rpcErr } = await supabase.rpc('admin_process_payout', {
        p_payout_id: payout_id,
        p_action: 'approve',
        p_note: `Approved by ${user.email} (NOWPayments credentials not configured - manual payout required)`
      })
      if (rpcErr) throw rpcErr
      return res.status(200).json({ 
        success: true, 
        method: 'manual_fallback',
        message: 'Approved but NOWPayments payout credentials not configured. Send USDT manually.'
      })
    }

    const authRes = await fetch(`${NOWPAYMENTS_BASE}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: NOWPAYMENTS_EMAIL,
        password: NOWPAYMENTS_PASSWORD
      })
    })

    if (!authRes.ok) {
      console.error('NOWPayments auth failed:', await authRes.text())
      return res.status(500).json({ error: 'Failed to authenticate with NOWPayments' })
    }

    const { token: npToken } = await authRes.json()

    // ── 6. Create payout via NOWPayments ────────────────────────────
    const payoutRes = await fetch(`${NOWPAYMENTS_BASE}/payout`, {
      method: 'POST',
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY,
        'Authorization': `Bearer ${npToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        payout_description: `VyxHub creator payout #${payout_id.slice(0, 8)}`,
        ipn_callback_url: `${APP_URL}/api/crypto/payout-webhook`,
        withdrawals: [{
          address: walletAddress,
          currency: 'usdttrc20',
          amount: parseFloat(payout.amount),
          unique_external_id: payout_id,
          ipn_callback_url: `${APP_URL}/api/crypto/payout-webhook`
        }]
      })
    })

    const payoutData = await payoutRes.json()

    if (!payoutRes.ok) {
      console.error('NOWPayments payout failed:', payoutData)
      return res.status(500).json({ 
        error: 'Failed to create NOWPayments payout',
        details: payoutData.message || payoutData.statusCode || 'Unknown error'
      })
    }

    // ── 7. Store NOWPayments tracking info ──────────────────────────
    const withdrawal = payoutData.withdrawals?.[0]
    const npPayoutId = payoutData.id?.toString()
    const npWithdrawalId = withdrawal?.id?.toString()

    const { error: updateErr } = await supabase.rpc('update_payout_nowpayments_info', {
      p_payout_id: payout_id,
      p_nowpayments_payout_id: npPayoutId,
      p_nowpayments_withdrawal_id: npWithdrawalId,
      p_payout_currency: 'usdttrc20'
    })

    if (updateErr) {
      console.error('Failed to save NP tracking info:', updateErr)
      // Don't fail — payout was already sent
    }

    // ── 8. Return success ───────────────────────────────────────────
    return res.status(200).json({
      success: true,
      method: 'nowpayments',
      payout_id: npPayoutId,
      withdrawal_id: npWithdrawalId,
      amount: payout.amount,
      currency: 'usdttrc20',
      address: walletAddress,
      status: withdrawal?.status || 'WAITING'
    })

  } catch (err) {
    console.error('Payout error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
