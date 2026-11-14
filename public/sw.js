const CACHE_NAME = 'weijing-shell-v239'
const APP_ROOT = '/wewei-role-site/'
// v218：布丁来信的两张布丁狗图，安装时先放进缓存，离线也能显示。
// v239：谢聿衡 Q 版立绘 9 张表情也先缓存，换表情离线也不白。
const SPRITE_MOODS = ['cold', 'happy', 'shy', 'love', 'smug', 'angry', 'sad', 'cry', 'surprised']
const PRECACHE = ['pudding-dog.svg', ...SPRITE_MOODS.map((mood) => `sprites/xieyuheng/xie_${mood}.webp`)].map((name) => `${APP_ROOT}${name}`)

async function rememberResponse(key, response) {
  if (!response.ok) return
  try {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(key, response.clone())
  } catch {
    // A full or unavailable cache must never hide a successful network reply.
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME)
      await cache.addAll(PRECACHE)
    } catch {
      // Precache is best effort: a failed fetch must never block the new worker.
    }
  })())
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
