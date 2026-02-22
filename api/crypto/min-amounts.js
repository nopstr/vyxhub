/**
 * GET /api/crypto/min-amounts
 * Fetches minimum payment amounts for each supported cryptocurrency from NOWPayments.
 * Returns { btc: 1.50, eth: 0.80, usdt: 0.50, ... } in USD equivalents.
 * Cached server-side for 5 minutes.
 */

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY
const NOWPAYMENTS_BASE = 'https://api.nowpayments.io/v1'

// NOWPayments currency codes for our supported cryptos
const CRYPTOS = [
  { id: 'btc',  npId: 'btc' },
  { id: 'eth',  npId: 'eth' },
  { id: 'usdt', npId: 'usdttrc20' },
  { id: 'usdc', npId: 'usdcmatic' },
  { id: 'sol',  npId: 'sol' },
  { id: 'ltc',  npId: 'ltc' },
  { id: 'doge', npId: 'doge' },
  { id: 'bnb',  npId: 'bnbbsc' },
  { id: 'xrp',  npId: 'xrp' },
  { id: 'trx',  npId: 'trx' },
]

// In-memory cache
let cache = null
let cacheTime = 0
const CACHE_TTL = 300_000 // 5 minutes

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const now = Date.now()

    // Return cached data if fresh
    if (cache && now - cacheTime < CACHE_TTL) {
      res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300')
      res.setHeader('X-Cache', 'HIT')
      return res.status(200).json(cache)
    }

    if (!NOWPAYMENTS_API_KEY) {
      // Return generous defaults if API key not configured
      const defaults = {}
      CRYPTOS.forEach(c => { defaults[c.id] = 0.50 })
      res.setHeader('Cache-Control', 'public, max-age=60')
      return res.status(200).json(defaults)
    }

    // Fetch all min amounts in parallel
    const results = await Promise.allSettled(
      CRYPTOS.map(async (crypto) => {
        const url = `${NOWPAYMENTS_BASE}/min-amount?currency_from=${crypto.npId}&currency_to=${crypto.npId}&fiat_equivalent=usd`
        const response = await fetch(url, {
          headers: { 'x-api-key': NOWPAYMENTS_API_KEY },
        })
        if (!response.ok) return { id: crypto.id, minUsd: null }
        const data = await response.json()
        return { id: crypto.id, minUsd: data.fiat_equivalent || null }
      })
    )

    const minAmounts = {}
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value.minUsd !== null) {
        // Add a small buffer (10%) to avoid edge cases where rate fluctuates
        minAmounts[CRYPTOS[i].id] = Math.ceil(result.value.minUsd * 110) / 100
      } else {
        // Fallback to a safe default
        minAmounts[CRYPTOS[i].id] = 0.50
      }
    })

    // Update cache
    cache = minAmounts
    cacheTime = now

    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300')
    res.setHeader('X-Cache', 'MISS')
    return res.status(200).json(minAmounts)

  } catch (err) {
    console.error('Min amount fetch error:', err)
    if (cache) {
      res.setHeader('X-Cache', 'ERROR-STALE')
      return res.status(200).json(cache)
    }
    // Return defaults on error
    const defaults = {}
    CRYPTOS.forEach(c => { defaults[c.id] = 0.50 })
    return res.status(200).json(defaults)
  }
}
