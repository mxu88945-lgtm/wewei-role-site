import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './pwa-fix.css'
import './memory.css'
import './character-card.css'
import './import-flow.css'
import './navigation-shell.css'
import './api-page.css'
import './preset-page.css'
import './runtime-enhancements.css'
import './memoryApiEnhancements'

const APP_SCOPE = '/wewei-role-site/'
const SERVICE_WORKER_RELEASE = '2026-08-17-conversation-stats-v1'

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
