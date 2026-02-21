/**
 * GET /api/crypto/prices
 * Proxies CoinGecko price API to avoid CSP issues and provide server-side caching.
 * Returns current USD prices for all supported cryptocurrencies.
 * Vercel edge cache: 60s via s-maxage header.
 */

const COINGECKO_IDS = 'bitcoin,ethereum,tether,usd-coin,solana,litecoin,dogecoin,binancecoin,ripple,tron'
const COINGECKO_URL = `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_IDS}&vs_currencies=usd`

// In-memory cache for warm instances
let cache = null
let cacheTime = 0
const CACHE_TTL = 60_000 // 60 seconds

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const now = Date.now()

    // Return cached data if fresh
    if (cache && now - cacheTime < CACHE_TTL) {
      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60')
      res.setHeader('X-Cache', 'HIT')
      return res.status(200).json(cache)
    }

    // Fetch from CoinGecko
    const response = await fetch(COINGECKO_URL, {
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      // Return stale cache if available
      if (cache) {
        res.setHeader('X-Cache', 'STALE')
        return res.status(200).json(cache)
      }
      throw new Error(`CoinGecko API error: ${response.status}`)
    }

    const data = await response.json()

    // Update cache
    cache = { ...data, _updated: new Date().toISOString() }
    cacheTime = now

    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60')
    res.setHeader('X-Cache', 'MISS')
    return res.status(200).json(cache)

  } catch (err) {
    console.error('Price fetch error:', err)
    // Return stale cache as last resort
    if (cache) {
      res.setHeader('X-Cache', 'ERROR-STALE')
      return res.status(200).json(cache)
    }
    return res.status(502).json({ error: 'Failed to fetch crypto prices' })
  }
}
