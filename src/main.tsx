import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import { BOOT_OK_MS, isSafeMode, noteBootOk, noteBootStart, reloadApp } from './safeMode'
import './index.css'
import './pwa-fix.css'
import './memory.css'
import './backstage-notes.css'
import './character-card.css'
import './import-flow.css'
import './navigation-shell.css'
import './api-page.css'
import './preset-page.css'
import './runtime-enhancements.css'
import './theme-pudding.css'
import './theme-cute.css'
import './theme-cute-icons.css'
import './theme-liquid.css'
import './theme-letter.css'
import './theme-mistnote.css'
import './theme-nightglow.css'
import './theme-warmtea.css'
import './theme-paper.css'
import './theme-scrapbook.css'
import './theme-archives.css'
import './story-composer.css'
import './memoryApiEnhancements'

const APP_SCOPE = '/wewei-role-site/'
const SERVICE_WORKER_RELEASE = '2026-11-16-backstage-hide-v260'

if ('serviceWorker' in navigator) {
  let reloadingForUpdate = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return
    reloadingForUpdate = true
    window.location.reload()
  })

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(`${APP_SCOPE}sw.js?v=${SERVICE_WORKER_RELEASE}`, { scope: APP_SCOPE, updateViaCache: 'none' })
      if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) worker.postMessage({ type: 'SKIP_WAITING' })
        })
      })
      await registration.update()
    } catch (error) {
      console.error('Service Worker 注册失败', error)
    }
  })
}

// v245：连续两次启动没跑稳（iOS 内存不够被杀）→ 自动安全模式；跑满 20 秒或切后台算正常。
const autoSafe = noteBootStart()
const bootOk = () => noteBootOk()
window.setTimeout(bootOk, BOOT_OK_MS)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') bootOk() })
window.addEventListener('pagehide', bootOk)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fullScreen>
      {isSafeMode() && <div className="safe-mode-bar" role="status"><span>{autoSafe ? '上次没打开成功，已进入安全模式' : '安全模式'}（不加载立绘、开场模板、歌词）</span><button type="button" onClick={() => reloadApp(false)}>退出</button></div>}
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
