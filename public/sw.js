const CACHE_NAME = 'weijing-shell-v19'
const APP_ROOT = '/wewei-role-site/'

async function rememberResponse(key, response) {
  if (!response.ok) return
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(key, response.clone())
  } catch {
    // A full or unavailable cache must never hide a successful network reply.
  }
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith('weijing-') && key !== CACHE_NAME).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' })
        await rememberResponse(APP_ROOT, response)
        return response
      } catch {
        const cached = await caches.match(APP_ROOT)
        return cached || Response.error()
      }
    })())
    return
  }

  event.respondWith((async () => {
    const cached = await caches.match(request)
    try {
      const response = await fetch(request, { cache: 'no-store' })
      if (url.pathname.startsWith(APP_ROOT)) await rememberResponse(request, response)
      return response
    } catch {
      return cached || Response.error()
    }
  })())
})
