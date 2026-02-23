/**
 * POST /api/crypto/create-payment
 * Creates a crypto payment via NOWPayments and records it in the database.
 * 
 * Request body: { usd_amount, crypto_currency, payment_type, metadata }
 * Auth: Bearer token (Supabase access token)
 * 
 * Environment variables required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY (service role key)
 *   NOWPAYMENTS_API_KEY
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://agoekmugbrswrdjscwek.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY
const NOWPAYMENTS_BASE = 'https://api.nowpayments.io/v1'
const APP_URL = process.env.APP_URL || 'https://heatly.vip'

// Map our internal crypto IDs to NOWPayments currency codes
const CRYPTO_TO_NOWPAYMENTS = {
  btc:  'btc',
  eth:  'eth',
  usdt: 'usdttrc20',   // TRC-20 = cheapest USDT network
  usdc: 'usdcmatic',   // Polygon USDC (low fees)
  sol:  'sol',
  ltc:  'ltc',
  doge: 'doge',
  bnb:  'bnbbsc',       // BSC network
  xrp:  'xrp',
  trx:  'trx',
}

const VALID_PAYMENT_TYPES = ['subscription', 'tip', 'ppv_post', 'message_unlock', 'payment_request', 'plus_subscription', 'custom_request']

export default async function handler(req, res) {
  // CORS headers for preflight
  res.setHeader('Access-Control-Allow-Origin', APP_URL)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // -- Auth verification --
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token' })
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('Missing Supabase environment variables')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    // -- Validate request body --
    const { usd_amount, crypto_currency, payment_type, metadata } = req.body

    if (!usd_amount || parseFloat(usd_amount) <= 0) {
      return res.status(400).json({ error: 'Invalid USD amount' })
    }

    if (!CRYPTO_TO_NOWPAYMENTS[crypto_currency]) {
      return res.status(400).json({ error: `Unsupported cryptocurrency: ${crypto_currency}` })
    }

    if (!VALID_PAYMENT_TYPES.includes(payment_type)) {
      return res.status(400).json({ error: `Invalid payment type: ${payment_type}` })
    }

    const nowpaymentsCurrency = CRYPTO_TO_NOWPAYMENTS[crypto_currency]
    const orderId = `${payment_type}_${user.id.slice(0, 8)}_${Date.now()}`

    // -- Create payment with NOWPayments --
    if (!NOWPAYMENTS_API_KEY) {
      console.error('Missing NOWPAYMENTS_API_KEY')
      return res.status(500).json({ error: 'Payment provider not configured' })
    }

    // -- Check minimum amount for this currency --
    try {
      const minRes = await fetch(
        `${NOWPAYMENTS_BASE}/min-amount?currency_from=${nowpaymentsCurrency}&currency_to=${nowpaymentsCurrency}&fiat_equivalent=usd`,
        { headers: { 'x-api-key': NOWPAYMENTS_API_KEY } }
      )
      if (minRes.ok) {
        const minData = await minRes.json()
        const minUsd = minData.fiat_equivalent
        if (minUsd && parseFloat(usd_amount) < minUsd) {
          const cryptoName = crypto_currency.toUpperCase()
          return res.status(400).json({
            error: `Minimum for ${cryptoName} is $${minUsd.toFixed(2)} USD. Try a stablecoin (USDT/USDC) for smaller amounts.`,
          })
        }
      }
    } catch (e) {
      // Non-blocking — proceed anyway, NOWPayments will reject if too small
      console.warn('Min amount check failed:', e.message)
    }

    const npResponse = await fetch(`${NOWPAYMENTS_BASE}/payment`, {
      method: 'POST',
      headers: {
        'x-api-key': NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_amount: parseFloat(usd_amount),
        price_currency: 'usd',
        pay_currency: nowpaymentsCurrency,
        ipn_callback_url: `${APP_URL}/api/crypto/webhook`,
        order_id: orderId,
        order_description: `Heatly ${payment_type} payment`,
        is_fee_paid_by_user: true, // User pays the network transaction fee
      }),
    })

    if (!npResponse.ok) {
      const npError = await npResponse.json().catch(() => ({}))
      console.error('NOWPayments error:', npError)
      // Provide user-friendly message for common errors
      const msg = npError.message || ''
      if (msg.toLowerCase().includes('small') || msg.toLowerCase().includes('minimum')) {
        return res.status(400).json({
          error: `Amount too small for ${crypto_currency.toUpperCase()}. Try a larger amount or use USDT/USDC.`,
        })
      }
      return res.status(502).json({
        error: msg || 'Payment provider error. Please try again.',
      })
    }

    const npData = await npResponse.json()

    // -- Store payment record in database --
    const expiresAt = npData.expiration_estimate_date
      || new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min fallback

    const { data: cryptoPayment, error: dbError } = await supabase
      .from('crypto_payments')
      .insert({
        user_id: user.id,
        payment_type,
        payment_metadata: metadata || {},
        usd_amount: parseFloat(usd_amount),
        crypto_currency,
        crypto_amount: npData.pay_amount,
        pay_address: npData.pay_address,
        provider: 'nowpayments',
        provider_payment_id: String(npData.payment_id),
        payment_status: npData.payment_status || 'waiting',
        provider_data: {
          nowpayments_id: npData.payment_id,
          pay_currency: npData.pay_currency,
          price_amount: npData.price_amount,
          price_currency: npData.price_currency,
          purchase_id: npData.purchase_id,
          order_id: orderId,
          created_at: npData.created_at,
        },
        expires_at: expiresAt,
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return res.status(500).json({ error: 'Failed to record payment' })
    }

    // -- Return payment details to frontend --
    return res.status(200).json({
      id: cryptoPayment.id,
      provider_payment_id: String(npData.payment_id),
      pay_address: npData.pay_address,
      pay_amount: String(npData.pay_amount),
      pay_currency: crypto_currency,
      usd_amount: parseFloat(usd_amount),
      payment_status: npData.payment_status || 'waiting',
      expires_at: expiresAt,
    })

  } catch (err) {
    console.error('Create payment error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
