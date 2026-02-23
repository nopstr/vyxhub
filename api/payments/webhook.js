/**
 * POST /api/payments/webhook
 * Receives postback notifications from Segpay.
 * 
 * Segpay sends these action types:
 *   purchase  — initial payment completed
 *   rebill    — subscription renewal charged
 *   cancel    — user cancelled subscription
 *   refund    — payment refunded
 *   chargeback — payment disputed
 * 
 * Segpay postback fields:
 *   action, tranid, price, username, x-custom, status (1=approved, 0=declined),
 *   merchant, eticketid, subscriptionid, currencycode, etc.
 * 
 * Security: Segpay postbacks verified by IP whitelist + shared secret
 * 
 * Environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SEGPAY_POSTBACK_SECRET     — Shared secret for signature verification
 */

import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://agoekmugbrswrdjscwek.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
const SEGPAY_POSTBACK_SECRET = process.env.SEGPAY_POSTBACK_SECRET

// Segpay sends postbacks from these IP ranges (whitelist)
const SEGPAY_IPS = [
  '64.38.212.', '64.38.213.', '64.38.214.', '64.38.215.',
  '209.164.16.', '209.164.17.', '209.164.18.', '209.164.19.',
]

function isSegpayIP(ip) {
  if (!ip) return false
  // In production, verify against Segpay IP ranges
  // For now, also allow if postback secret matches
  return SEGPAY_IPS.some(prefix => ip.startsWith(prefix))
}

function verifyPostback(params) {
  if (!SEGPAY_POSTBACK_SECRET) {
    console.error('CRITICAL: SEGPAY_POSTBACK_SECRET not set')
    return false
  }
  // Segpay includes a digest param computed as HMAC-SHA256 of sorted key=value pairs
  const digest = params.digest
  if (!digest) return false

  const keys = Object.keys(params).filter(k => k !== 'digest').sort()
  const payload = keys.map(k => `${k}=${params[k]}`).join('&')
  const expected = createHmac('sha256', SEGPAY_POSTBACK_SECRET)
    .update(payload)
    .digest('hex')

  return expected === digest
}

export default async function handler(req, res) {
  // Segpay can send postbacks via GET or POST
  const params = req.method === 'POST' ? req.body : req.query
  
  if (!params || !params.action) {
    return res.status(400).send('Missing params')
  }

  try {
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress

    // Verify: either IP whitelist OR postback secret
    const ipValid = isSegpayIP(clientIP)
    const secretValid = verifyPostback(params)

    if (!ipValid && !secretValid) {
      console.error(`Segpay webhook: unauthorized IP=${clientIP}, no valid digest`)
      return res.status(403).send('Unauthorized')
    }

    const {
      action,       // purchase, rebill, cancel, refund, chargeback
      tranid,       // Segpay transaction ID
      price,        // Amount charged (string)
      status,       // "1" = approved, "0" = declined
      subscriptionid, // Segpay subscription ID (for recurring)
    } = params

    // Parse x-custom data
    let customData = {}
    try {
      const raw = params['x-custom'] || params['xcustom'] || '{}'
      customData = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) {
      console.warn('Failed to parse x-custom:', e)
    }

    const sessionId = customData.session_id
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    console.log(`Segpay webhook: action=${action} tranid=${tranid} status=${status} price=${price} sessionId=${sessionId} subId=${subscriptionid}`)

    // ── Handle actions ──────────────────────────────────────────────
    switch (action) {
      case 'purchase': {
        if (status !== '1') {
          // Declined
          if (sessionId) {
            await supabase
              .from('payment_sessions')
              .update({ status: 'failed', updated_at: new Date().toISOString() })
              .eq('id', sessionId)
          }
          return res.status(200).send('OK')
        }

        if (!sessionId) {
          console.error('Segpay purchase with no session_id in x-custom')
          return res.status(200).send('OK')
        }

        // Process the confirmed payment
        const { data, error } = await supabase.rpc('process_confirmed_fiat_payment', {
          p_session_id: sessionId,
          p_segpay_transaction_id: tranid || null,
          p_segpay_subscription_id: subscriptionid || null,
        })

        if (error) {
          console.error('Failed to process fiat payment:', error)
        } else {
          console.log('Fiat payment processed:', data)
        }
        break
      }

      case 'rebill': {
        if (status !== '1' || !subscriptionid) break

        const amount = parseFloat(price) || 0
        if (amount <= 0) break

        const { data, error } = await supabase.rpc('process_segpay_rebill', {
          p_segpay_subscription_id: subscriptionid,
          p_segpay_transaction_id: tranid || null,
          p_amount: amount,
        })

        if (error) {
          console.error('Failed to process rebill:', error)
        } else {
          console.log('Rebill processed:', data)
        }
        break
      }

      case 'cancel': {
        if (!subscriptionid) break

        const { data, error } = await supabase.rpc('process_segpay_cancel', {
          p_segpay_subscription_id: subscriptionid,
        })

        if (error) {
          console.error('Failed to process cancel:', error)
        } else {
          console.log('Subscription cancelled:', data)
        }
        break
      }

      case 'refund':
      case 'chargeback': {
        // Mark session as refunded
        if (sessionId) {
          await supabase
            .from('payment_sessions')
            .update({
              status: action === 'refund' ? 'refunded' : 'failed',
              updated_at: new Date().toISOString()
            })
            .eq('id', sessionId)
        }
        // TODO: Reverse the business logic (remove subscription, etc.)
        console.warn(`Segpay ${action}: tranid=${tranid} sessionId=${sessionId} — manual review needed`)
        break
      }

      default:
        console.log(`Segpay: Unknown action "${action}"`)
    }

    // Segpay expects "OK" response
    return res.status(200).send('OK')

  } catch (err) {
    console.error('Segpay webhook error:', err)
    return res.status(200).send('OK') // Don't cause retries
  }
}
