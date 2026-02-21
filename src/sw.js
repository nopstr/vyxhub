import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate, NetworkFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { BackgroundSyncPlugin } from 'workbox-background-sync'

// Workbox precaching (injected by vite-plugin-pwa)
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// ──────────────────────────────────────────────
// Offline fallback for navigation requests
// ──────────────────────────────────────────────
const OFFLINE_FALLBACK = '/offline.html'

// Pre-cache the offline page on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('offline-fallback-v1').then((cache) => cache.add(OFFLINE_FALLBACK))
  )
})

// Navigation fallback — serve offline.html when network fails
const navigationHandler = new NetworkFirst({
  cacheName: 'navigation-cache',
  networkTimeoutSeconds: 3,
  plugins: [
    new CacheableResponsePlugin({ statuses: [0, 200] }),
  ],
})

const navigationRoute = new NavigationRoute(navigationHandler, {
  // Don't intercept API calls or static assets
  denylist: [
    /^\/api\//,
    /\.[a-z0-9]+$/i,  // files with extensions
  ],
})

// Override the navigation route to provide offline fallback
registerRoute(
  ({ request }) => request.mode === 'navigate',
  async (params) => {
    try {
      return await navigationHandler.handle(params)
    } catch (error) {
      const cache = await caches.open('offline-fallback-v1')
      const fallback = await cache.match(OFFLINE_FALLBACK)
      if (fallback) return fallback
      return new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
    }
  }
)

// Google Fonts – cache first
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

// Supabase storage – stale while revalidate
registerRoute(
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
  new StaleWhileRevalidate({
    cacheName: 'supabase-storage-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

// Supabase REST API — network first with cache fallback for offline
registerRoute(
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/v1\/.*/i,
  new NetworkFirst({
    cacheName: 'supabase-api-cache',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 24 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

// Supabase RPC calls — network first with cache fallback
registerRoute(
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/v1\/rpc\/.*/i,
  new NetworkFirst({
    cacheName: 'supabase-rpc-cache',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 12 * 60 * 60 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

// ──────────────────────────────────────────────
// Background sync for failed mutations
// ──────────────────────────────────────────────
// Queues failed POST/PATCH/DELETE to Supabase and retries when back online.
const bgSyncPlugin = new BackgroundSyncPlugin('supabase-mutation-queue', {
  maxRetentionTime: 24 * 60, // Retry for up to 24 hours (in minutes)
  onSync: async ({ queue }) => {
    let entry
    while ((entry = await queue.shiftRequest())) {
      try {
        await fetch(entry.request.clone())
      } catch (error) {
        // Put it back and stop retrying for now
        await queue.unshiftRequest(entry)
        throw error
      }
    }
  },
})

// Catch failed Supabase mutation requests (POST that aren't RPC reads)
registerRoute(
  ({ url, request }) => {
    const isSupabase = /^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/v1\//i.test(url.href)
    const isMutation = ['POST', 'PATCH', 'DELETE'].includes(request.method)
    return isSupabase && isMutation
  },
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'POST' // This covers POST; we also need PATCH and DELETE
)

registerRoute(
  ({ url, request }) => {
    const isSupabase = /^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/v1\//i.test(url.href)
    return isSupabase && request.method === 'PATCH'
  },
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'PATCH'
)

registerRoute(
  ({ url, request }) => {
    const isSupabase = /^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/v1\//i.test(url.href)
    return isSupabase && request.method === 'DELETE'
  },
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'DELETE'
)

// ──────────────────────────────────────────────
// Push notification handler
// ──────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { title: 'VyxHub', body: event.data?.text() || 'You have a new notification' }
  }

  const title = data.title || 'VyxHub'
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || 'vyxhub-notification',
    renotify: true,
    data: {
      url: data.url || '/',
      notification_id: data.notification_id,
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Notification click – open/focus the relevant page
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If there's already a window open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url)
    })
  )
})

// Skip waiting on install for faster updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
