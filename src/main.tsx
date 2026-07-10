import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './pwa-fix.css'
import './memory.css'
import './character-card.css'
import './import-flow.css'
import './chatDrawer.css'
import './homeShell.css'
import { installChatDrawer } from './chatDrawer'
import { installHomeShell } from './homeShell'

const APP_SCOPE = '/wewei-role-site/'
let isReloading = false

async function refreshToLatest(button?: HTMLButtonElement) {
  const originalText = button?.textContent || '强制刷新到最新版'
  if (button) {
    button.disabled = true
    button.textContent = '正在检查更新…'
  }

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration(APP_SCOPE)
      await registration?.update()

      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, 1200)
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.clearTimeout(timer)
            resolve()
          }, { once: true })
        })
      }

      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.filter((name) => name.startsWith('weijing-')).map((name) => caches.delete(name)))
    }

    if (!isReloading) {
      isReloading = true
      const url = new URL(window.location.href)
      url.searchParams.set('_refresh', Date.now().toString())
      window.location.replace(url.toString())
    }
  } catch (error) {
    console.error('更新失败', error)
    if (button) {
      button.disabled = false
      button.textContent = '更新失败，点我重试'
      window.setTimeout(() => { button.textContent = originalText }, 2200)
    }
  }
}

function mountUpdateCard() {
  const heading = Array.from(document.querySelectorAll('.page-header h1')).find((item) => item.textContent?.trim() === '设置')
  const stack = heading?.closest('.phone-canvas')?.querySelector('.settings-stack')
  if (!stack || stack.querySelector('[data-pwa-update-card]')) return

  const card = document.createElement('section')
  card.setAttribute('data-pwa-update-card', 'true')
  card.style.cssText = 'padding:20px;border-radius:26px;background:#efedf0;display:grid;gap:14px;'

  const title = document.createElement('strong')
  title.textContent = '应用更新'
  title.style.cssText = 'font-size:16px;color:#2f2933;'

  const description = document.createElement('p')
  description.textContent = '主动检查并拉取最新网页版本，不会删除角色、聊天记录或本地设置。'
  description.style.cssText = 'margin:0;color:#8f8993;font-size:13px;line-height:1.55;'

  const button = document.createElement('button')
  button.textContent = '强制刷新到最新版'
  button.style.cssText = 'width:max-content;border:0;border-radius:16px;padding:13px 18px;color:white;font-weight:800;background:linear-gradient(135deg,#8150e7,#ce7fc4);box-shadow:0 10px 24px rgba(67,39,107,.12);'
  button.addEventListener('click', () => refreshToLatest(button))

  card.append(title, description, button)
  stack.append(card)
}

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

const observer = new MutationObserver(mountUpdateCard)
observer.observe(document.documentElement, { childList: true, subtree: true })
installChatDrawer()
installHomeShell()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
