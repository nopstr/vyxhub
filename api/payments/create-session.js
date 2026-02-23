/**
 * POST /api/payments/create-session
 * Creates a payment session and returns a Segpay redirect URL.
 * 
 * Request body: { amount, payment_type, metadata, is_recurring }
 * Auth: Bearer token (Supabase access token)
 * 
 * Environment variables required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SEGPAY_PACKAGE_ID          — Your Segpay package/eticket ID
 *   SEGPAY_DYNAMIC_PRICING_ID  — Your Segpay Dynamic Trans ID (for custom amounts)
 *   SEGPAY_RECURRING_PRICING_ID — Dynamic Trans for recurring subscriptions
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://agoekmugbrswrdjscwek.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const SEGPAY_PACKAGE_ID = process.env.SEGPAY_PACKAGE_ID
const SEGPAY_DYNAMIC_PRICING_ID = process.env.SEGPAY_DYNAMIC_PRICING_ID
const SEGPAY_RECURRING_PRICING_ID = process.env.SEGPAY_RECURRING_PRICING_ID
const SEGPAY_BASE = 'https://secure2.segpay.com/billing'
const APP_URL = process.env.APP_URL || 'https://heatly.vip'

const VALID_TYPES = ['subscription', 'tip', 'ppv_post', 'message_unlock', 'payment_request', 'plus_subscription', 'custom_request']

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', APP_URL)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // ── 1. Auth ─────────────────────────────────────────────────────
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization' })
    }

    const token = authHeader.split(' ')[1]
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    // ── 2. Validate request ─────────────────────────────────────────
    const { amount, payment_type, metadata = {}, is_recurring = false, idempotency_key } = req.body

    if (!amount || amount < 1 || amount > 10000) {
      return res.status(400).json({ error: 'Amount must be between $1 and $10,000' })
    }

    if (!VALID_TYPES.includes(payment_type)) {
      return res.status(400).json({ error: 'Invalid payment type' })
    }

    // Subscriptions are always recurring
    const recurring = is_recurring || payment_type === 'subscription'

    // ── 3. Check Idempotency ────────────────────────────────────────
    if (idempotency_key) {
      const { data: existingSession } = await supabase
        .from('payment_sessions')
        .select('id, status')
        .eq('user_id', user.id)
        .filter('metadata->>idempotency_key', 'eq', idempotency_key)
        .single()

      if (existingSession) {
        // If we already have a session for this key, just return it
        // We don't need to recreate the Segpay URL since the session ID is the same
        // and the frontend will just redirect to the same place
        const pricingId = recurring ? SEGPAY_RECURRING_PRICING_ID : SEGPAY_DYNAMIC_PRICING_ID
        const customData = JSON.stringify({
          session_id: existingSession.id,
          user_id: user.id,
          payment_type,
        })
        
        const params = new URLSearchParams({
          'dynamicPricingID': pricingId,
          'dynamicAmount': parseFloat(amount).toFixed(2),
          'dynamicCurrencyCode': 'USD',
          'dynamicDescription': getDescription(payment_type, metadata),
          'x-custom': customData,
          'successURL': `${APP_URL}/payment/success?session=${existingSession.id}`,
          'declineURL': `${APP_URL}/payment/cancel?session=${existingSession.id}`,
        })

        if (recurring) {
          params.set('dynamicInitialAmount', parseFloat(amount).toFixed(2))
          params.set('dynamicRecurringAmount', parseFloat(amount).toFixed(2))
          params.set('dynamicInitialPeriod', '30')
          params.set('dynamicRecurringPeriod', '30')
        }

        return res.status(200).json({
          success: true,
          session_id: existingSession.id,
          redirect_url: `${SEGPAY_BASE}/po${SEGPAY_PACKAGE_ID}.htm?${params.toString()}`,
          payment_method: 'segpay',
          idempotent_replay: true
        })
      }
    }

    // ── 4. Create payment session in DB ─────────────────────────────
    const sessionMetadata = { ...metadata }
    if (idempotency_key) sessionMetadata.idempotency_key = idempotency_key

    let session
    const { data: newSession, error: sessionErr } = await supabase
      .from('payment_sessions')
      .insert({
        user_id: user.id,
        payment_method: 'segpay',
        payment_type,
        usd_amount: parseFloat(amount).toFixed(2),
        metadata: sessionMetadata,
        status: 'pending'
      })
      .select('id')
      .single()

    if (sessionErr) {
      // 23505 is PostgreSQL unique violation
      if (sessionErr.code === '23505' && idempotency_key) {
        const { data: existingSession } = await supabase
          .from('payment_sessions')
          .select('id')
          .eq('user_id', user.id)
          .filter('metadata->>idempotency_key', 'eq', idempotency_key)
          .single()
          
        if (existingSession) {
          session = existingSession
        } else {
          console.error('Failed to recover from unique violation:', sessionErr)
          return res.status(500).json({ error: 'Failed to create payment session' })
        }
      } else {
        console.error('Failed to create session:', sessionErr)
        return res.status(500).json({ error: 'Failed to create payment session' })
      }
    } else {
      session = newSession
    }

    // ── 5. Build Segpay URL ─────────────────────────────────────────
    const pricingId = recurring ? SEGPAY_RECURRING_PRICING_ID : SEGPAY_DYNAMIC_PRICING_ID

    if (!SEGPAY_PACKAGE_ID || !pricingId) {
      return res.status(500).json({ error: 'Segpay not configured. Set SEGPAY_PACKAGE_ID and SEGPAY_DYNAMIC_PRICING_ID.' })
    }

    // Encode custom data for postback
    const customData = JSON.stringify({
      session_id: session.id,
      user_id: user.id,
      payment_type,
    })

    // Build URL parameters
    const params = new URLSearchParams({
      'dynamicPricingID': pricingId,
      'dynamicAmount': parseFloat(amount).toFixed(2),
      'dynamicCurrencyCode': 'USD',
      'dynamicDescription': getDescription(payment_type, metadata),
      'x-custom': customData,
      'successURL': `${APP_URL}/payment/success?session=${session.id}`,
      'declineURL': `${APP_URL}/payment/cancel?session=${session.id}`,
    })

    // For recurring subscriptions, add period info
    if (recurring) {
      params.set('dynamicInitialAmount', parseFloat(amount).toFixed(2))
      params.set('dynamicRecurringAmount', parseFloat(amount).toFixed(2))
      params.set('dynamicInitialPeriod', '30')  // 30 days
      params.set('dynamicRecurringPeriod', '30') // rebill every 30 days
    }

    const segpayUrl = `${SEGPAY_BASE}/po${SEGPAY_PACKAGE_ID}.htm?${params.toString()}`

    // ── 6. Return redirect URL ──────────────────────────────────────
    return res.status(200).json({
      success: true,
      session_id: session.id,
      redirect_url: segpayUrl,
      payment_method: 'segpay',
    })

  } catch (err) {
    console.error('Create session error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

function getDescription(type, metadata) {
  switch (type) {
    case 'subscription': return `Heatly subscription`
    case 'tip': return `Heatly tip`
    case 'ppv_post': return `Heatly content unlock`
    case 'message_unlock': return `Heatly message access`
    case 'payment_request': return `Heatly payment`
    case 'plus_subscription': return `Heatly Plus`
    case 'custom_request': return `Heatly custom request`
    default: return 'Heatly payment'
  }
}
