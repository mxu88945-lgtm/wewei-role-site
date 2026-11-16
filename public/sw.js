const CACHE_NAME = 'weijing-shell-v271'
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

// v255：启动秒开。以前每个文件都 no-store 走网络，每次启动要从 GitHub 重下 1.8MB 才出画面。
// 现在：带哈希的 assets/* 永不改名 → 先用缓存；页面本身先等网络 1.5 秒，等不到就用上次的缓存，
// 网络回来后照样写进缓存，下次启动就是新版（发版仍靠 CACHE_NAME 换代 + SKIP_WAITING 刷新）。
const SHELL_NETWORK_WAIT_MS = 1500
const isHashedAsset = (url) => url.pathname.startsWith(`${APP_ROOT}assets/`)

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    const network = fetch(request, { cache: 'no-store' }).then(async (response) => {
      await rememberResponse(APP_ROOT, response)
      return response
    })
    event.waitUntil(network.catch(() => undefined))
    event.respondWith((async () => {
      const cached = await caches.match(APP_ROOT)
      if (!cached) {
        try { return await network } catch { return Response.error() }
      }
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), SHELL_NETWORK_WAIT_MS))
      try {
        const fresh = await Promise.race([network, timeout])
        return fresh && fresh.ok ? fresh : cached
      } catch {
        return cached
      }
    })())
    return
  }

  if (isHashedAsset(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      const response = await fetch(request)
      await rememberResponse(request, response)
      return response
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
