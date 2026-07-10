type DrawerTarget = 'api' | 'characters' | 'more'

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

async function leaveChatToCharacters() {
  if (document.querySelector('.chat-page')) {
    document.querySelector<HTMLButtonElement>('.chat-header .icon-button')?.click()
    await sleep(90)
  }
  if (findButtonByText('角色卡主体与开场白')) {
    document.querySelector<HTMLButtonElement>('.page-header .icon-button')?.click()
    await sleep(90)
  }
}

async function openRoot(target: DrawerTarget) {
  closeChatDrawer()
  await leaveChatToCharacters()

  if (target === 'characters') return

  const navLabel = target === 'more' || target === 'api' ? '更多' : '角色'
  const navButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.bottom-nav button'))
    .find((button) => button.textContent?.includes(navLabel))
  navButton?.click()

  if (target === 'api') {
    ;(await waitForButton('API 连接'))?.click()
  }
}

async function openConversation(characterName: string) {
  closeChatDrawer()
  await leaveChatToCharacters()
  const characterButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.character-card'))
    .find((button) => button.textContent?.includes(characterName))
  characterButton?.click()
  ;(await waitForButton('继续共演'))?.click()
}

function readCharacters() {
  try {
    const value = JSON.parse(localStorage.getItem('weijing.characters') || '[]') as Array<{ id?: string; name?: string; avatar?: string; greeting?: string }>
    return value.filter((item) => item.name).slice(0, 12)
  } catch {
    return []
  }
}

export function closeChatDrawer() {
  document.querySelector('[data-chat-drawer-root]')?.remove()
  document.documentElement.classList.remove('chat-drawer-open')
}

function openChatDrawer() {
  closeChatDrawer()
  const currentName = document.querySelector('.chat-identity strong')?.textContent || '当前角色'
  const currentAvatar = document.querySelector<HTMLImageElement>('.chat-identity img')?.src
  const characters = readCharacters()

  const rows = characters.length
    ? characters.map((item) => `<button class="chat-session-row ${item.name === currentName ? 'active' : ''}" data-character-name="${encodeURIComponent(item.name || '')}">
        <span class="chat-session-avatar">${item.avatar ? `<img src="${item.avatar}" alt="">` : (item.name || '角').slice(-1)}</span>
        <span class="chat-session-copy"><strong>${item.name}</strong><small>${(item.greeting || '继续这段对话').replace(/<[^>]*>/g, '').slice(0, 38)}</small></span>
        <span class="chat-session-more">•••</span>
      </button>`).join('')
    : `<div class="chat-session-empty">还没有其他角色</div>`

  const root = document.createElement('div')
  root.dataset.chatDrawerRoot = 'true'
  root.className = 'chat-drawer-root'
  root.innerHTML = `<button class="chat-drawer-backdrop" aria-label="关闭抽屉"></button>
    <aside class="chat-drawer-panel" aria-label="对话与导航">
      <header class="chat-drawer-brand">
        <div><strong>惟境</strong><small>WEIWEI ROLE</small></div>
        <button class="chat-drawer-close" aria-label="关闭">×</button>
      </header>
      <div class="chat-drawer-filter"><strong>全部聊天</strong><span>⌄</span><button data-drawer-target="characters">＋</button></div>
      <div class="chat-session-list">${rows}</div>
      <nav class="chat-drawer-bottom">
        <button data-drawer-target="api"><span>⌑</span><small>API连接</small></button>
        <button data-drawer-target="characters"><span>♙</span><small>角色</small></button>
        <button data-drawer-target="more"><span>•••</span><small>更多</small></button>
      </nav>
    </aside>`

  document.body.append(root)
  document.documentElement.classList.add('chat-drawer-open')
  requestAnimationFrame(() => root.classList.add('visible'))

  root.querySelector('.chat-drawer-backdrop')?.addEventListener('click', closeChatDrawer)
  root.querySelector('.chat-drawer-close')?.addEventListener('click', closeChatDrawer)
  root.querySelectorAll<HTMLElement>('[data-drawer-target]').forEach((button) => {
    button.addEventListener('click', () => openRoot(button.dataset.drawerTarget as DrawerTarget))
  })
  root.querySelectorAll<HTMLElement>('[data-character-name]').forEach((button) => {
    button.addEventListener('click', () => openConversation(decodeURIComponent(button.dataset.characterName || '')))
  })

  if (currentAvatar) {
    const activeAvatar = root.querySelector<HTMLImageElement>('.chat-session-row.active img')
    if (activeAvatar && !activeAvatar.src) activeAvatar.src = currentAvatar
  }
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
