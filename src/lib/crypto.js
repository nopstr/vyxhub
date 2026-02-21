/**
 * Cryptocurrency payment utilities
 * Uses CoinGecko for live prices (via our server-side proxy to respect CSP)
 * Payment processing via NOWPayments
 */

export const SUPPORTED_CRYPTOS = [
  { id: 'btc',  name: 'Bitcoin',   symbol: 'BTC',  coingeckoId: 'bitcoin',      color: '#F7931A', decimals: 8, minUsd: 0.50 },
  { id: 'eth',  name: 'Ethereum',  symbol: 'ETH',  coingeckoId: 'ethereum',     color: '#627EEA', decimals: 8, minUsd: 0.50 },
  { id: 'usdt', name: 'Tether',    symbol: 'USDT', coingeckoId: 'tether',       color: '#26A17B', decimals: 2, minUsd: 0.50 },
  { id: 'usdc', name: 'USD Coin',  symbol: 'USDC', coingeckoId: 'usd-coin',     color: '#2775CA', decimals: 2, minUsd: 0.50 },
  { id: 'sol',  name: 'Solana',    symbol: 'SOL',  coingeckoId: 'solana',       color: '#9945FF', decimals: 6, minUsd: 0.50 },
  { id: 'ltc',  name: 'Litecoin',  symbol: 'LTC',  coingeckoId: 'litecoin',     color: '#345D9D', decimals: 8, minUsd: 0.50 },
  { id: 'doge', name: 'Dogecoin',  symbol: 'DOGE', coingeckoId: 'dogecoin',     color: '#C2A633', decimals: 4, minUsd: 0.50 },
  { id: 'bnb',  name: 'BNB',       symbol: 'BNB',  coingeckoId: 'binancecoin',  color: '#F0B90B', decimals: 6, minUsd: 0.50 },
  { id: 'xrp',  name: 'XRP',       symbol: 'XRP',  coingeckoId: 'ripple',       color: '#23292F', decimals: 6, minUsd: 0.50 },
  { id: 'trx',  name: 'TRON',      symbol: 'TRX',  coingeckoId: 'tron',         color: '#EF0027', decimals: 6, minUsd: 0.50 },
]

// SVG icons for each crypto (simple circle + letter approach)
export const CRYPTO_ICONS = {
  btc:  '₿',
  eth:  'Ξ',
  usdt: '₮',
  usdc: '$',
  sol:  '◎',
  ltc:  'Ł',
  doge: 'Ð',
  bnb:  '◆',
  xrp:  '✕',
  trx:  '⟁',
}

/**
 * Get crypto config by ID
 */
export function getCryptoById(id) {
  return SUPPORTED_CRYPTOS.find(c => c.id === id)
}

/**
 * Format a crypto amount with appropriate decimal places
 */
export function formatCryptoAmount(amount, cryptoId) {
  if (amount === null || amount === undefined) return '...'
  const num = parseFloat(amount)
  if (isNaN(num)) return '...'
  const crypto = getCryptoById(cryptoId)
  const decimals = crypto?.decimals ?? 8
  // Show enough precision but trim unnecessary trailing zeros
  const fixed = num.toFixed(decimals)
  // Remove trailing zeros but keep at least 2 decimal places for stablecoins
  if (crypto?.id === 'usdt' || crypto?.id === 'usdc') {
    return num.toFixed(2)
  }
  return fixed.replace(/0+$/, '').replace(/\.$/, '')
}

/**
 * Estimate crypto amount from USD using fetched prices
 */
export function estimateCryptoAmount(usdAmount, prices, cryptoId) {
  const crypto = getCryptoById(cryptoId)
  if (!crypto || !prices?.[crypto.coingeckoId]?.usd) return null
  const price = prices[crypto.coingeckoId].usd
  if (price <= 0) return null
  return usdAmount / price
}

/**
 * Fetch current crypto prices from our API proxy
 * Returns { bitcoin: { usd: 97000 }, ethereum: { usd: 2800 }, ... }
 */
let priceCache = null
let priceCacheTime = 0
const PRICE_CACHE_TTL = 30_000 // 30 seconds client-side

export async function fetchCryptoPrices() {
  const now = Date.now()
  if (priceCache && now - priceCacheTime < PRICE_CACHE_TTL) {
    return priceCache
  }

  const res = await fetch('/api/crypto/prices')
  if (!res.ok) {
    if (priceCache) return priceCache // return stale cache
    throw new Error('Failed to fetch crypto prices')
  }

  const data = await res.json()
  priceCache = data
  priceCacheTime = now
  return data
}

/**
 * Create a crypto payment via our API
 */
export async function createCryptoPayment({ accessToken, usdAmount, cryptoCurrency, paymentType, metadata }) {
  const res = await fetch('/api/crypto/create-payment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      usd_amount: usdAmount,
      crypto_currency: cryptoCurrency,
      payment_type: paymentType,
      metadata: metadata || {},
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create payment')
  }

  return res.json()
}

/**
 * Format seconds into MM:SS countdown display
 */
export function formatCountdown(seconds) {
  if (seconds === null || seconds === undefined || seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Get a human-readable status label
 */
export function getPaymentStatusLabel(status) {
  const labels = {
    created: 'Initializing...',
    waiting: 'Waiting for payment',
    confirming: 'Confirming transaction...',
    confirmed: 'Transaction confirmed',
    sending: 'Processing...',
    partially_paid: 'Partial payment received',
    finished: 'Payment complete!',
    failed: 'Payment failed',
    refunded: 'Payment refunded',
    expired: 'Payment expired',
  }
  return labels[status] || status
}

/**
 * Check if a payment is in a terminal state
 */
export function isTerminalStatus(status) {
  return ['finished', 'failed', 'refunded', 'expired'].includes(status)
}
