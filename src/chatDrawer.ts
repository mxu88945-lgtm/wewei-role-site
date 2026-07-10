type DrawerRoute =
  | 'character-detail'
  | 'card-data'
  | 'card-worldbook'
  | 'card-regex'
  | 'memory'
  | 'identity'
  | 'api'
  | 'model'
  | 'preset'
  | 'settings'

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

function findButtonByText(text: string, root: ParentNode = document) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes(text))
}

async function waitForButton(text: string, timeout = 2500) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const button = findButtonByText(text)
    if (button) return button
    await sleep(40)
  }
  return undefined
}

async function leaveChatForCharacter() {
  const identity = document.querySelector<HTMLButtonElement>('.chat-identity')
  identity?.click()
  await waitForButton('角色卡主体与开场白')
}

async function openMorePage() {
  if (document.querySelector('.chat-page')) {
    document.querySelector<HTMLButtonElement>('.chat-header .icon-button')?.click()
    await sleep(80)
  }
  if (findButtonByText('角色卡主体与开场白')) {
    document.querySelector<HTMLButtonElement>('.page-header .icon-button')?.click()
    await sleep(80)
  }
  const more = Array.from(document.querySelectorAll<HTMLButtonElement>('.bottom-nav button')).find((button) => button.textContent?.includes('更多'))
  more?.click()
  await waitForButton('API 连接')
}

async function navigate(route: DrawerRoute) {
  closeChatDrawer()
  if (route === 'character-detail') {
    await leaveChatForCharacter()
    return
  }

  const characterTargets: Partial<Record<DrawerRoute, string>> = {
    'card-data': '角色卡主体与开场白',
    'card-worldbook': '角色世界书',
    'card-regex': '角色正则与美化',
    memory: '管理记忆与总结模型',
  }

  const characterTarget = characterTargets[route]
  if (characterTarget) {
    await leaveChatForCharacter()
    ;(await waitForButton(characterTarget))?.click()
    return
  }

  const globalTargets: Partial<Record<DrawerRoute, string>> = {
    identity: '用户身份',
    api: 'API 连接',
    model: '模型设置',
    preset: '全局预设',
    settings: '设置',
  }
  await openMorePage()
  const target = globalTargets[route]
  if (target) (await waitForButton(target))?.click()
}

function item(icon: string, title: string, subtitle: string, route: DrawerRoute, value = '') {
  return `<button class="chat-drawer-item" data-drawer-route="${route}">
    <span class="chat-drawer-icon">${icon}</span>
    <span class="chat-drawer-copy"><strong>${title}</strong><small>${subtitle}</small></span>
    ${value ? `<span class="chat-drawer-value">${value}</span>` : ''}<span class="chat-drawer-chevron">›</span>
  </button>`
}

export function closeChatDrawer() {
  document.querySelector('[data-chat-drawer-root]')?.remove()
  document.documentElement.classList.remove('chat-drawer-open')
}

function openChatDrawer() {
  closeChatDrawer()
  const name = document.querySelector('.chat-identity strong')?.textContent || '当前角色'
  const subtitle = document.querySelector('.chat-identity small')?.textContent || '沉浸共演中'
  const avatar = document.querySelector<HTMLImageElement>('.chat-identity img')?.src
  const root = document.createElement('div')
  root.dataset.chatDrawerRoot = 'true'
  root.className = 'chat-drawer-root'
  root.innerHTML = `<button class="chat-drawer-backdrop" aria-label="关闭抽屉"></button>
    <aside class="chat-drawer-panel" aria-label="聊天设置">
      <div class="chat-drawer-handle"></div>
      <header class="chat-drawer-profile">
        <div class="chat-drawer-avatar">${avatar ? `<img src="${avatar}" alt="">` : name.slice(-1)}</div>
        <div><strong>${name}</strong><small>${subtitle}</small></div>
        <button class="chat-drawer-close" aria-label="关闭">×</button>
      </header>
      <div class="chat-drawer-scroll">
        <section class="chat-drawer-section">
          <h3>聊天</h3>
          ${item('◌', '情景与角色资料', '角色设定、场景与开场白', 'card-data')}
          ${item('人', '用户身份', '调整本次共演使用的身份', 'identity')}
        </section>
        <section class="chat-drawer-section">
          <h3>角色能力</h3>
          ${item('世', '世界书', '管理条目、触发与注入位置', 'card-worldbook')}
          ${item('正', '正则与美化', '消息替换、样式与渲染规则', 'card-regex')}
          ${item('忆', '长期记忆', '独立记忆库与总结模型', 'memory')}
        </section>
        <section class="chat-drawer-section">
          <h3>模型与提示词</h3>
          ${item('API', 'API 连接', '聊天模型接口与密钥', 'api')}
          ${item('参', '模型设置', '温度、上下文与流式输出', 'model')}
          ${item('预', '预设', '提示词流水线与上下文编排', 'preset')}
        </section>
        <section class="chat-drawer-section compact">
          ${item('设', '应用设置', '外观、存储、备份与更新', 'settings')}
          ${item('卡', '查看角色详情', '返回角色资料总览', 'character-detail')}
        </section>
      </div>
    </aside>`
  document.body.append(root)
  document.documentElement.classList.add('chat-drawer-open')
  requestAnimationFrame(() => root.classList.add('visible'))
  root.querySelector('.chat-drawer-backdrop')?.addEventListener('click', closeChatDrawer)
  root.querySelector('.chat-drawer-close')?.addEventListener('click', closeChatDrawer)
  root.querySelectorAll<HTMLElement>('[data-drawer-route]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.drawerRoute as DrawerRoute)))
}

export function installChatDrawer() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const moreButton = target.closest<HTMLButtonElement>('.chat-page .more-button')
    if (!moreButton) return
    event.preventDefault()
    event.stopPropagation()
    openChatDrawer()
  }, true)

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeChatDrawer()
  })
}
