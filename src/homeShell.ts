const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

function clickBottomNav(label: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.bottom-nav button'))
    .find((item) => item.textContent?.includes(label))
  button?.click()
}

async function openMoreTarget(label: string) {
  clickBottomNav('更多')
  await sleep(80)
  Array.from(document.querySelectorAll<HTMLButtonElement>('.settings-group button'))
    .find((item) => item.textContent?.includes(label))?.click()
}

function mountHomeShell() {
  const title = Array.from(document.querySelectorAll('.hero-header h1')).find((item) => item.textContent?.trim() === '惟境')
  const stack = title?.closest('.phone-canvas')?.querySelector<HTMLElement>('.content-stack')
  if (!stack || stack.querySelector('[data-home-quick-grid]')) return

  const feature = stack.querySelector<HTMLElement>('.feature-card')
  if (feature) feature.classList.add('home-feature-compact')

  const grid = document.createElement('section')
  grid.dataset.homeQuickGrid = 'true'
  grid.className = 'home-quick-grid'
  grid.innerHTML = `
    <button data-home-route="characters"><span>♙</span><strong>角色库</strong><small>查看与导入角色</small></button>
    <button data-home-route="chat"><span>◌</span><strong>继续共演</strong><small>回到当前对话</small></button>
    <button data-home-route="memory"><span>◎</span><strong>长期记忆</strong><small>管理独立记忆库</small></button>
    <button data-home-route="settings"><span>⚙</span><strong>设置</strong><small>模型、备份与外观</small></button>`

  const recentSection = stack.querySelector('section:not([data-home-quick-grid])')
  stack.insertBefore(grid, recentSection || null)

  grid.querySelector('[data-home-route="characters"]')?.addEventListener('click', () => clickBottomNav('角色'))
  grid.querySelector('[data-home-route="chat"]')?.addEventListener('click', () => feature?.querySelector<HTMLButtonElement>('.primary-button')?.click())
  grid.querySelector('[data-home-route="memory"]')?.addEventListener('click', () => openMoreTarget('长记忆'))
  grid.querySelector('[data-home-route="settings"]')?.addEventListener('click', () => openMoreTarget('设置'))
}

export function installHomeShell() {
  const observer = new MutationObserver(mountHomeShell)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  mountHomeShell()
}
