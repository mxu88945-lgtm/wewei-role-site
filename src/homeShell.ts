const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

function clickBottomNav(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.bottom-nav button'))
    .find((item) => item.textContent?.includes(label))
  button?.click()
}

async function openSettings() {
  clickBottomNav('更多')
  await sleep(90)
  Array.from(document.querySelectorAll<HTMLButtonElement>('.settings-group button'))
    .find((item) => item.textContent?.trim().startsWith('设置'))?.click()
}

function mountHomeShell() {
  const title = Array.from(document.querySelectorAll('.hero-header h1')).find((item) => item.textContent?.trim() === '惟境')
  const canvas = title?.closest<HTMLElement>('.phone-canvas')
  const stack = canvas?.querySelector<HTMLElement>('.content-stack')
  if (!canvas || !stack) return

  canvas.classList.add('home-portal-page')
  stack.querySelectorAll<HTMLElement>(':scope > .feature-card, :scope > section:not([data-home-portal])').forEach((node) => {
    node.hidden = true
    node.style.display = 'none'
  })

  let portal = stack.querySelector<HTMLElement>('[data-home-portal]')
  if (!portal) {
    portal = document.createElement('section')
    portal.dataset.homePortal = 'true'
    portal.className = 'home-portal'
    portal.innerHTML = `
      <div class="home-portal-heading"><span class="home-script">Eden</span><h2>欢迎回到惟境</h2><p>选择一个入口，继续今天的共演。</p></div>
      <div class="home-portal-grid home-portal-grid-two">
        <button data-home-route="chat"><span>•••</span><strong>聊天</strong><small>CHAT</small></button>
        <button data-home-route="settings"><span>⚙</span><strong>设置</strong><small>SETTINGS</small></button>
      </div>`
    stack.prepend(portal)
    portal.querySelector('[data-home-route="chat"]')?.addEventListener('click', () => {
      stack.querySelector<HTMLElement>('.feature-card')?.querySelector<HTMLButtonElement>('.primary-button')?.click()
    })
    portal.querySelector('[data-home-route="settings"]')?.addEventListener('click', openSettings)
  }

  canvas.querySelectorAll<HTMLElement>('.bottom-nav').forEach((nav) => { nav.style.display = 'none' })
}

export function installHomeShell() {
  const observer = new MutationObserver(mountHomeShell)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  mountHomeShell()
}
