const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

function readCharacters() {
  try {
    return (JSON.parse(localStorage.getItem('weijing.characters') || '[]') as Array<{ name?: string; avatar?: string; greeting?: string }>).filter((item) => item.name)
  } catch { return [] }
}

export function closeConversationDrawer() {
  document.querySelector('[data-conversation-drawer]')?.remove()
  document.documentElement.classList.remove('conversation-drawer-open')
}

async function openCharacter(name: string) {
  closeConversationDrawer()
  document.querySelector<HTMLButtonElement>('.chat-identity')?.click()
  await sleep(90)
  document.querySelector<HTMLButtonElement>('.page-header .icon-button')?.click()
  await sleep(90)
  const card = Array.from(document.querySelectorAll<HTMLButtonElement>('.character-card')).find((button) => button.textContent?.includes(name))
  card?.click()
  await sleep(90)
  Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.includes('继续共演'))?.click()
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
  </aside>`
  document.body.append(root)
  document.documentElement.classList.add('conversation-drawer-open')
  requestAnimationFrame(() => root.classList.add('visible'))
  root.querySelector('.conversation-backdrop')?.addEventListener('click', closeConversationDrawer)
  root.querySelector('.conversation-close')?.addEventListener('click', closeConversationDrawer)
  root.querySelectorAll<HTMLElement>('[data-conversation-name]').forEach((button) => button.addEventListener('click', () => openCharacter(decodeURIComponent(button.dataset.conversationName || ''))))
}

export function installConversationDrawer() {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    const button = target.closest<HTMLButtonElement>('.chat-page .chat-header .icon-button')
    if (!button) return
    event.preventDefault(); event.stopPropagation(); openConversationDrawer()
  }, true)
}
