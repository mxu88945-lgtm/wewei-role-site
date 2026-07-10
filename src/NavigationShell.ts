type DrawerSide = 'left' | 'right'

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
let internalNavigation = false

function readCharacters() {
  try {
    return (JSON.parse(localStorage.getItem('weijing.characters') || '[]') as Array<{ id?: string; name?: string; avatar?: string; greeting?: string }>).filter((item) => item.name)
  } catch { return [] }
}

function readSessions() {
  try { return JSON.parse(localStorage.getItem('weijing.sessions') || '{}') as Record<string, unknown[]> } catch { return {} }
}

function writeSessions(value: Record<string, unknown[]>) {
  localStorage.setItem('weijing.sessions', JSON.stringify(value))
}

function buttonByText(text: string, root: ParentNode = document) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes(text))
}

async function waitForButton(text: string, timeout = 2200) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const button = buttonByText(text)
    if (button) return button
    await sleep(50)
  }
  return undefined
}

function closeShell() {
  document.querySelector('[data-navigation-shell]')?.remove()
  document.querySelector('[data-session-sheet]')?.remove()
  document.documentElement.classList.remove('navigation-shell-open')
}

async function reachRootPage() {
  internalNavigation = true
  try {
    for (let index = 0; index < 6; index += 1) {
      if (document.querySelector('.bottom-nav')) return
      const detail = buttonByText('继续共演')
      if (detail) {
        document.querySelector<HTMLButtonElement>('.page-header .icon-button')?.click()
      } else {
        document.querySelector<HTMLButtonElement>('.page-header .icon-button')?.click()
      }
      await sleep(90)
    }
  } finally { internalNavigation = false }
}

async function openBottom(label: string) {
  closeShell()
  await reachRootPage()
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.bottom-nav button')).find((item) => item.textContent?.includes(label))
  button?.click()
  await sleep(100)
}

async function openGlobalRoute(label: string) {
  sessionStorage.setItem('weijing.drawerReturn', 'right')
  await openBottom('更多')
  if (label === '更多') return
  ;(await waitForButton(label))?.click()
}

async function openCharacterDetail(name?: string) {
  closeShell()
  const currentName = document.querySelector('.chat-identity strong')?.textContent?.trim()
  if (name && currentName === name) {
    document.querySelector<HTMLButtonElement>('.chat-identity')?.click()
    return
  }
  await openBottom('角色')
  const card = Array.from(document.querySelectorAll<HTMLButtonElement>('.character-card')).find((item) => item.textContent?.includes(name || currentName || ''))
  card?.click()
  await sleep(90)
}

async function openCharacterRoute(label: string) {
  sessionStorage.setItem('weijing.drawerReturn', 'right')
  await openCharacterDetail()
  if (label === '查看角色详情') return
  ;(await waitForButton(label))?.click()
}

async function openConversation(name: string) {
  await openCharacterDetail(name)
  ;(await waitForButton('继续共演'))?.click()
}

function avatar(item: { name?: string; avatar?: string }) {
  return item.avatar ? `<img src="${item.avatar}" alt="">` : `<span>${(item.name || '角').slice(-1)}</span>`
}

function openSessionSheet(item: { id?: string; name?: string }) {
  document.querySelector('[data-session-sheet]')?.remove()
  const root = document.createElement('div')
  root.dataset.sessionSheet = 'true'
  root.className = 'session-sheet-root'
  root.innerHTML = `<button class="session-sheet-backdrop" aria-label="关闭"></button><section class="session-sheet"><div class="session-sheet-handle"></div><h3>${item.name || '会话'}</h3><button data-session-action="continue">继续对话</button><button data-session-action="detail">查看角色资料</button><button class="danger" data-session-action="delete">删除这段对话</button><button data-session-action="cancel">取消</button></section>`
  document.body.append(root)
  requestAnimationFrame(() => root.classList.add('visible'))
  root.querySelector('.session-sheet-backdrop')?.addEventListener('click', () => root.remove())
  root.querySelector('[data-session-action="cancel"]')?.addEventListener('click', () => root.remove())
  root.querySelector('[data-session-action="continue"]')?.addEventListener('click', () => openConversation(item.name || ''))
  root.querySelector('[data-session-action="detail"]')?.addEventListener('click', () => openCharacterDetail(item.name || ''))
  root.querySelector('[data-session-action="delete"]')?.addEventListener('click', () => {
    if (!item.id) return
    const sessions = readSessions(); delete sessions[item.id]; writeSessions(sessions); root.remove(); openDrawer('left')
  })
}

function openLeftDrawer() {
  const current = document.querySelector('.chat-identity strong')?.textContent?.trim() || ''
  const rows = readCharacters().map((item) => `<div class="nav-session-row ${item.name === current ? 'active' : ''}"><button class="nav-session-main" data-session-name="${encodeURIComponent(item.name || '')}"><span class="nav-session-avatar">${avatar(item)}</span><span class="nav-session-copy"><strong>${item.name}</strong><small>${(item.greeting || '继续这段对话').replace(/<[^>]*>/g, '').slice(0, 34)}</small></span></button><button class="nav-session-more" data-session-more="${encodeURIComponent(item.name || '')}" aria-label="会话操作">•••</button></div>`).join('')
  return `<aside class="navigation-panel navigation-panel-left"><header class="navigation-brand"><div><strong>惟境</strong><small>WEIWEI ROLE</small></div><button class="navigation-close">×</button></header><div class="navigation-filter"><strong>全部聊天</strong><span>⌄</span></div><div class="navigation-session-list">${rows || '<p class="navigation-empty">还没有对话</p>'}</div><footer class="navigation-bottom"><button data-nav-target="API 连接"><span>◇</span><small>API连接</small></button><button data-nav-target="角色"><span>♙</span><small>角色</small></button><button data-nav-target="更多"><span>•••</span><small>更多</small></button></footer></aside>`
}

function drawerItem(icon: string, title: string, subtitle: string, route: string, scope: 'character' | 'global') {
  return `<button class="navigation-setting-row" data-setting-route="${route}" data-setting-scope="${scope}"><span class="navigation-setting-icon">${icon}</span><span><strong>${title}</strong><small>${subtitle}</small></span><i>›</i></button>`
}

function openRightDrawer() {
  const name = document.querySelector('.chat-identity strong')?.textContent || '当前角色'
  const subtitle = document.querySelector('.chat-identity small')?.textContent || '沉浸共演中'
  const image = document.querySelector<HTMLImageElement>('.chat-identity img')?.src
  return `<aside class="navigation-panel navigation-panel-right"><div class="navigation-handle"></div><header class="navigation-profile"><div class="navigation-profile-avatar">${image ? `<img src="${image}" alt="">` : name.slice(-1)}</div><div><strong>${name}</strong><small>${subtitle}</small></div><button class="navigation-close">×</button></header><div class="navigation-settings-scroll"><section><h3>聊天</h3>${drawerItem('◌','情景与角色资料','角色设定、场景与开场白','角色卡主体与开场白','character')}${drawerItem('人','用户身份','调整本次共演使用的身份','用户身份','global')}</section><section><h3>角色能力</h3>${drawerItem('世','世界书','管理条目、触发与注入位置','角色世界书','character')}${drawerItem('正','正则与美化','消息替换、样式与渲染规则','角色正则与美化','character')}${drawerItem('忆','长期记忆','独立记忆库与总结模型','管理记忆与总结模型','character')}</section><section><h3>模型与提示词</h3>${drawerItem('API','API 连接','聊天模型接口与密钥','API 连接','global')}${drawerItem('参','模型设置','温度、上下文与流式输出','模型设置','global')}${drawerItem('预','预设','提示词流水线与上下文编排','全局预设','global')}</section><section>${drawerItem('设','应用设置','外观、存储、备份与更新','设置','global')}${drawerItem('卡','查看角色详情','返回角色资料总览','查看角色详情','character')}</section></div></aside>`
}

function openDrawer(side: DrawerSide) {
  closeShell()
  const root = document.createElement('div')
  root.dataset.navigationShell = side
  root.className = 'navigation-shell-root'
  root.innerHTML = `<button class="navigation-backdrop" aria-label="关闭"></button>${side === 'left' ? openLeftDrawer() : openRightDrawer()}`
  document.body.append(root)
  document.documentElement.classList.add('navigation-shell-open')
  requestAnimationFrame(() => root.classList.add('visible'))
  root.querySelector('.navigation-backdrop')?.addEventListener('click', closeShell)
  root.querySelector('.navigation-close')?.addEventListener('click', closeShell)
  root.querySelectorAll<HTMLElement>('[data-session-name]').forEach((button) => button.addEventListener('click', () => openConversation(decodeURIComponent(button.dataset.sessionName || ''))))
  root.querySelectorAll<HTMLElement>('[data-session-more]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault(); event.stopPropagation()
    const name = decodeURIComponent(button.dataset.sessionMore || '')
    const item = readCharacters().find((character) => character.name === name)
    if (item) openSessionSheet(item)
  }))
  root.querySelectorAll<HTMLElement>('[data-nav-target]').forEach((button) => button.addEventListener('click', () => {
    const target = button.dataset.navTarget || ''
    if (target === '角色') openBottom('角色')
    else if (target === '更多') openBottom('更多')
    else openGlobalRoute('API 连接')
  }))
  root.querySelectorAll<HTMLElement>('[data-setting-route]').forEach((button) => button.addEventListener('click', () => {
    const route = button.dataset.settingRoute || ''
    const scope = button.dataset.settingScope
    if (scope === 'character') openCharacterRoute(route)
    else openGlobalRoute(route)
  }))
}

async function returnToChatAndRestoreDrawer() {
  internalNavigation = true
  try {
    for (let index = 0; index < 7; index += 1) {
      if (document.querySelector('.chat-page')) { openDrawer('right'); return }
      const continueButton = buttonByText('继续共演')
      if (continueButton) { continueButton.click(); await sleep(100); continue }
      const chatNav = Array.from(document.querySelectorAll<HTMLButtonElement>('.bottom-nav button')).find((button) => button.textContent?.includes('共演'))
      if (chatNav) { chatNav.click(); await sleep(100); continue }
      const back = document.querySelector<HTMLButtonElement>('.page-header .icon-button')
      if (!back) break
      back.click(); await sleep(100)
    }
  } finally { internalNavigation = false; sessionStorage.removeItem('weijing.drawerReturn') }
}

function mountHomePortal() {
  const title = Array.from(document.querySelectorAll('.hero-header h1')).find((item) => item.textContent?.trim() === '惟境')
  const canvas = title?.closest<HTMLElement>('.phone-canvas')
  const stack = canvas?.querySelector<HTMLElement>('.content-stack')
  if (!canvas || !stack) return
  canvas.classList.add('home-portal-page')
  stack.querySelectorAll<HTMLElement>('.feature-card, section').forEach((item) => { item.style.display = 'none' })
  if (stack.querySelector('[data-home-portal]')) return
  const portal = document.createElement('section')
  portal.dataset.homePortal = 'true'
  portal.className = 'home-portal'
  portal.innerHTML = `<div class="home-portal-heading"><span>Eden</span><h2>欢迎回到惟境</h2><p>选择一个入口，继续今天的共演。</p></div><div class="home-portal-grid"><button data-home-target="聊天"><b>•••</b><strong>聊天</strong><small>CHAT</small></button><button data-home-target="角色"><b>♙</b><strong>角色库</strong><small>CHARACTERS</small></button><button data-home-target="设置"><b>⚙</b><strong>设置</strong><small>SETTINGS</small></button></div>`
  stack.prepend(portal)
  portal.querySelector('[data-home-target="聊天"]')?.addEventListener('click', () => openBottom('共演'))
  portal.querySelector('[data-home-target="角色"]')?.addEventListener('click', () => openBottom('角色'))
  portal.querySelector('[data-home-target="设置"]')?.addEventListener('click', () => openGlobalRoute('设置'))
}

export function installNavigationShell() {
  const observer = new MutationObserver(mountHomePortal)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  mountHomePortal()
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const chatLeft = target.closest<HTMLButtonElement>('.chat-page .chat-header > .icon-button')
    if (chatLeft) { event.preventDefault(); event.stopPropagation(); openDrawer('left'); return }
    const chatRight = target.closest<HTMLButtonElement>('.chat-page .more-button')
    if (chatRight) { event.preventDefault(); event.stopPropagation(); openDrawer('right'); return }
    const back = target.closest<HTMLButtonElement>('.page-header .icon-button')
    if (!internalNavigation && back && sessionStorage.getItem('weijing.drawerReturn') === 'right') {
      event.preventDefault(); event.stopPropagation(); returnToChatAndRestoreDrawer()
    }
  }, true)
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeShell() })
}
