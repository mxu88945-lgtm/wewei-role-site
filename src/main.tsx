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
import './runtimeEnhancements'

const APP_SCOPE = '/wewei-role-site/'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(`${APP_SCOPE}sw.js`, { scope: APP_SCOPE, updateViaCache: 'none' })
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
