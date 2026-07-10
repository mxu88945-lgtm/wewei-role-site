const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

function readCharacters() {
  try {
    return (JSON.parse(localStorage.getItem('weijing.characters') || '[]') as Array<{ name?: string; avatar?: string; greeting?: string }>).filter((item) => item.name)
  } catch { return [] }
}

function findButton(text: string, root: ParentNode = document) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes(text))
}

export function closeConversationDrawer() {
  document.querySelector('[data-conversation-drawer]')?.remove()
  document.documentElement.classList.remove('conversation-drawer-open')
}

async function returnToRoot(target: 'api' | 'characters' | 'more') {
  closeConversationDrawer()
  if (document.querySelector('.chat-page')) {
    document.querySelector<HTMLButtonElement>('.chat-identity')?.click()
    await sleep(100)
  }
  if (findButton('角色卡主体与开场白')) {
    document.querySelector<HTMLButtonElement>('.page-header .icon-button')?.click()
    await sleep(100)
  }
  if (target === 'characters') return
  const nav = Array.from(document.querySelectorAll<HTMLButtonElement>('.bottom-nav button')).find((button) => button.textContent?.includes('更多'))
  nav?.click()
  await sleep(100)
  if (target === 'api') findButton('API 连接', document)?.click()
}

async function openCharacter(name: string) {
  closeConversationDrawer()
  if (document.querySelector('.chat-page')) {
    document.querySelector<HTMLButtonElement>('.chat-identity')?.click()
    await sleep(100)
  }
  if (findButton('角色卡主体与开场白')) {
    document.querySelector<HTMLButtonElement>('.page-header .icon-button')?.click()
    await sleep(100)
  }
  const card = Array.from(document.querySelectorAll<HTMLButtonElement>('.character-card')).find((button) => button.textContent?.includes(name))
  card?.click()
  await sleep(100)
  findButton('继续共演')?.click()
}

function openConversationDrawer() {
  closeConversationDrawer()
  const current = document.querySelector('.chat-identity strong')?.textContent || ''
  const rows = readCharacters().map((item) => `<button class="conversation-row ${item.name === current ? 'active' : ''}" data-conversation-name="${encodeURIComponent(item.name || '')}">
    <span class="conversation-avatar">${item.avatar ? `<img src="${item.avatar}" alt="">` : (item.name || '角').slice(-1)}</span>
    <span><strong>${item.name}</strong><small>${(item.greeting || '继续这段对话').replace(/<[^>]*>/g,'').slice(0,34)}</small></span>
    <i>•••</i>
  </button>`).join('')
  const root = document.createElement('div')
  root.dataset.conversationDrawer = 'true'
  root.className = 'conversation-drawer-root'
  root.innerHTML = `<button class="conversation-backdrop"></button><aside class="conversation-panel">
    <header><div><strong>惟境</strong><small>WEIWEI ROLE</small></div><button class="conversation-close">×</button></header>
    <div class="conversation-title"><strong>全部聊天</strong><span>⌄</span></div>
    <div class="conversation-list">${rows || '<p>还没有角色</p>'}</div>
    <nav class="conversation-bottom">
      <button data-conversation-target="api"><span>⌑</span><small>API连接</small></button>
      <button data-conversation-target="characters"><span>♙</span><small>角色</small></button>
      <button data-conversation-target="more"><span>•••</span><small>更多</small></button>
    </nav>
  </aside>`
  document.body.append(root)
  document.documentElement.classList.add('conversation-drawer-open')
  requestAnimationFrame(() => root.classList.add('visible'))
  root.querySelector('.conversation-backdrop')?.addEventListener('click', closeConversationDrawer)
  root.querySelector('.conversation-close')?.addEventListener('click', closeConversationDrawer)
  root.querySelectorAll<HTMLElement>('[data-conversation-name]').forEach((button) => button.addEventListener('click', () => openCharacter(decodeURIComponent(button.dataset.conversationName || ''))))
  root.querySelectorAll<HTMLElement>('[data-conversation-target]').forEach((button) => button.addEventListener('click', () => returnToRoot(button.dataset.conversationTarget as 'api' | 'characters' | 'more')))
}

export function installConversationDrawer() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const button = target.closest<HTMLButtonElement>('.chat-page .chat-header .icon-button')
    if (!button) return
    event.preventDefault(); event.stopPropagation(); openConversationDrawer()
  }, true)
}
