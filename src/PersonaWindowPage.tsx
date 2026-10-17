import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ApiConfig } from './chatApi'
import type { Character } from './characterCard'
import type { Conversation } from './conversationLifecycle'
import type { LongMemoryMap } from './memoryEngine'
import { CHAT_IMAGE_LIMIT, prepareChatImage, type ChatImage } from './chatImages'
import { CHAT_RENDER_WINDOW, earlierChatMessageCount, earlierChatWindowAnchor, resolveChatWindowStart } from './chatWindow'
import { createKeyboardScrollPin, VIEWPORT_CHANGE_EVENT, VIEWPORT_WILL_CHANGE_EVENT } from './keyboardScrollPin'
import MessageContent, { isPendingAssistantText } from './MessageContent'
import { buildPastLifeMemory, deletePersona, disablePersona, enablePersona, PERSONA_MEMORY_EVERY, pendingPersonaMemoryMessages, switchPersona, updatePersona, type PersonaMemoryEntry, type PersonaMessage } from './personaWindow'
import { hydratePersonaStore, setPersonaState, usePersonaHydrated, usePersonaState } from './personaWindowStore'
import { extractPersonaMemory, generatePersonaReply, getPersonaRuntime, setPersonaError, stopPersonaReply, subscribePersonaRuntime, type PersonaRuntimeDeps } from './personaWindowRuntime'

import './persona-window.css'

type Props = {
  characters: Character[]
  conversations: Conversation[]
  memoryEntries: LongMemoryMap
  identity: { name: string; description: string; avatar?: string }
  api: ApiConfig
  memoryApiFor: (characterId: string) => ApiConfig
  temperature: number
  topP: number
  maxTokens: number
  streaming: boolean
  memoryLength: number
  onBack: () => void
}

type View = 'chat' | 'manage' | 'memory'
const EMPTY_MESSAGES: PersonaMessage[] = []

/**
 * iPhone sometimes swallows the first tap on a button while the keyboard is up.
 * Fire on pointerup for touch and ignore the click that follows it.
 */
function useOneTap() {
  const suppressUntil = useRef(0)
  return (action: () => void) => ({
    onPointerUp: (event: React.PointerEvent) => {
      if (event.pointerType !== 'touch') return
      event.preventDefault()
      suppressUntil.current = Date.now() + 500
      action()
    },
    onClick: () => {
      if (Date.now() < suppressUntil.current) return
      action()
    },
  })
}

const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches

export default function PersonaWindowPage(props: Props) {
  const { characters, conversations, memoryEntries, identity, onBack } = props
  const hydrated = usePersonaHydrated()
  const state = usePersonaState()
  const runtime = useSyncExternalStore(subscribePersonaRuntime, getPersonaRuntime, getPersonaRuntime)
  useEffect(() => { void hydratePersonaStore() }, [])

  const enabled = state.personas.filter((item) => item.enabled && characters.some((character) => character.id === item.characterId))
  const active = enabled.find((item) => item.id === state.activeId) || enabled[0]
  const activeCharacter = active ? characters.find((character) => character.id === active.characterId) : undefined
  const [view, setView] = useState<View>(() => 'chat')
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([])
  const [imageBusy, setImageBusy] = useState(false)
  const [viewerImage, setViewerImage] = useState<ChatImage | null>(null)
  const [menuMessageId, setMenuMessageId] = useState<number | null>(null)
  const [windowAnchors, setWindowAnchors] = useState<Record<string, number | null>>({})
  const [libraryQuery, setLibraryQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const stickRef = useRef(true)
  const prependRef = useRef<{ height: number; top: number } | null>(null)
  const tap = useOneTap()

  const generating = Boolean(active && runtime.generating[active.id])
  const error = active ? runtime.errors[active.id] || '' : ''
  const notice = active ? runtime.notices[active.id] || '' : ''
  const messages = active?.messages ?? EMPTY_MESSAGES
  const windowStart = resolveChatWindowStart(messages, active ? windowAnchors[active.id] : null)
  const earlierCount = earlierChatMessageCount(windowStart)
  const rendered = windowStart > 0 ? messages.slice(windowStart) : messages

  const depsFor = (characterId: string): PersonaRuntimeDeps | null => {
    const character = characters.find((item) => item.id === characterId)
    if (!character) return null
    return {
      character,
      user: { name: identity.name, description: identity.description },
      api: props.api,
      memoryApi: props.memoryApiFor(characterId),
      temperature: props.temperature,
      topP: props.topP,
      maxTokens: props.maxTokens,
      streaming: props.streaming,
      memoryLength: props.memoryLength,
      // Read-only snapshot of this character's phone/story memories, built per request.
      pastLife: () => buildPastLifeMemory({ character, conversations, memoryEntries }),
    }
  }

  // Keep the newest message in view while she is at the bottom (new replies, streaming).
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list || view !== 'chat') return
    const prepend = prependRef.current
    if (prepend) {
      prependRef.current = null
      list.scrollTop = prepend.top + (list.scrollHeight - prepend.height)
      return
    }
    if (stickRef.current) list.scrollTop = list.scrollHeight
  }, [messages, view, active?.id])

  useEffect(() => { stickRef.current = true }, [active?.id])

  // Composer clearance and iOS keyboard pinning (same rules as the main chat).
  useEffect(() => {
    if (view !== 'chat') return
    const list = listRef.current
    const composer = composerRef.current
    if (!list) return
    const pin = createKeyboardScrollPin(() => listRef.current, {
      now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
      setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    })
    const sync = () => {
      if (!composer) return
      list.style.setProperty('--composer-clearance', `${Math.max(122, Math.ceil(composer.getBoundingClientRect().height) + 42)}px`)
    }
    const arm = () => { pin.arm() }
    const repin = () => { pin.pin() }
    const release = () => { pin.release() }
    const composerObserver = composer && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null
    const listObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(repin) : null
    if (composer) composerObserver?.observe(composer)
    listObserver?.observe(list)
    sync()
    const applyAppHeight = (window as Window & { __weijingApplyAppHeight?: () => void }).__weijingApplyAppHeight
    applyAppHeight?.()
    window.addEventListener(VIEWPORT_WILL_CHANGE_EVENT, arm)
    window.addEventListener(VIEWPORT_CHANGE_EVENT, repin)
    composer?.addEventListener('focusin', arm)
    list.addEventListener('touchstart', release, { passive: true })
    return () => {
      composerObserver?.disconnect()
      listObserver?.disconnect()
      window.removeEventListener(VIEWPORT_WILL_CHANGE_EVENT, arm)
      window.removeEventListener(VIEWPORT_CHANGE_EVENT, repin)
      composer?.removeEventListener('focusin', arm)
      list.removeEventListener('touchstart', release)
      list.style.removeProperty('--composer-clearance')
    }
  }, [view, active?.id])

  const onScroll = () => {
    const list = listRef.current
    if (!list) return
    stickRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= 96
  }

  const loadEarlier = () => {
    const list = listRef.current
    if (!active || !list) return
    prependRef.current = { height: list.scrollHeight, top: list.scrollTop }
    setWindowAnchors((current) => ({ ...current, [active.id]: earlierChatWindowAnchor(messages, windowStart, CHAT_RENDER_WINDOW) }))
  }

  const send = () => {
    if (!active || !activeCharacter) return
    if (generating) { stopPersonaReply(active.id); return }
    const text = draft.trim()
    if (!text && !pendingImages.length) return
    const deps = depsFor(active.characterId)
    if (!deps) return
    setDraft('')
    const images = pendingImages
    setPendingImages([])
    stickRef.current = true
    setWindowAnchors((current) => ({ ...current, [active.id]: null }))
    if (isTouchDevice()) textareaRef.current?.blur()
    void generatePersonaReply(active.id, deps, { text, images })
  }

  const letThemSpeak = () => {
    if (!active || generating) return
    const deps = depsFor(active.characterId)
    if (!deps) return
    stickRef.current = true
    void generatePersonaReply(active.id, deps)
  }

  const regenerate = () => {
    if (!active || generating) return
    const deps = depsFor(active.characterId)
    if (deps) void generatePersonaReply(active.id, deps, { regenerate: true })
  }

  const addImages = async (files: FileList | null) => {
    const list = Array.from(files || []).slice(0, Math.max(0, CHAT_IMAGE_LIMIT - pendingImages.length))
    if (!list.length || !active) return
    setImageBusy(true)
    try {
      const prepared: ChatImage[] = []
      for (const file of list) prepared.push(await prepareChatImage(file))
      setPendingImages((current) => [...current, ...prepared].slice(0, CHAT_IMAGE_LIMIT))
    } catch (problem) {
      setPersonaError(active.id, problem instanceof Error ? problem.message : '图片处理失败，换一张试试。')
    } finally { setImageBusy(false) }
  }

  const choosePersona = (id: string) => {
    setPersonaState((current) => switchPersona(current, id))
    setSwitcherOpen(false)
    setMenuMessageId(null)
    setPendingImages([])
    setView('chat')
  }

  const updateActiveMemories = (transform: (entries: PersonaMemoryEntry[]) => PersonaMemoryEntry[]) => {
    if (!active) return
    setPersonaState((current) => updatePersona(current, active.id, (item) => ({ ...item, memories: transform(item.memories) })))
  }

  const scrollFieldIntoView = (event: React.FocusEvent<HTMLElement>) => {
    const target = event.currentTarget
    window.setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320)
  }

  const avatarOf = (character: Character | undefined, size = '') => <span className={`persona-avatar ${size}`}>{character?.avatar ? <img src={character.avatar} alt="" /> : (character?.name || '?').slice(-1)}</span>

  const header = <header className="chat-header persona-header">
    <button className="icon-button persona-back" aria-label="返回" {...tap(() => { if (view !== 'chat') setView('chat'); else onBack() })}>‹</button>
    <button className="chat-identity persona-identity" aria-label="切换人格" aria-expanded={switcherOpen} {...tap(() => setSwitcherOpen((open) => !open))}>
      {activeCharacter ? (activeCharacter.avatar ? <img src={activeCharacter.avatar} alt="" /> : <span>{activeCharacter.name.slice(-1)}</span>) : <span>✧</span>}
      <div><strong>{view === 'manage' ? '管理人格' : view === 'memory' ? `${activeCharacter?.name || ''} · 记忆` : activeCharacter?.name || '人格窗口'}</strong><small>{generating ? '正在回应…' : enabled.length > 1 ? `点这里切换 · 共 ${enabled.length} 个人格` : '独立人格窗口'}</small></div>
    </button>
    <button className="more-button" aria-label={view === 'manage' ? '返回聊天' : '管理人格'} {...tap(() => { setSwitcherOpen(false); setView(view === 'manage' ? 'chat' : 'manage') })}>{view === 'manage' ? '✓' : '•••'}</button>
  </header>

  const switcher = switcherOpen && <div className="persona-switcher" role="menu" aria-label="切换人格">
    {enabled.map((item) => {
      const character = characters.find((entry) => entry.id === item.characterId)
      return <button key={item.id} role="menuitemradio" aria-checked={item.id === active?.id} className={item.id === active?.id ? 'active' : ''} {...tap(() => choosePersona(item.id))}>{avatarOf(character, 'small')}<span>{character?.name}</span>{runtime.generating[item.id] && <i>…</i>}</button>
    })}
    <button className="persona-switcher-manage" {...tap(() => { setSwitcherOpen(false); setView('manage') })}>＋ 添加 / 管理人格</button>
  </div>

  if (!hydrated) return <section className="chat-page persona-window-page">{header}<div className="persona-panel"><p className="persona-empty">正在读取人格窗口…</p></div></section>

  if (view === 'manage' || !active || !activeCharacter) {
    const query = libraryQuery.trim().toLocaleLowerCase()
    const available = characters.filter((character) => !enabled.some((item) => item.characterId === character.id) && (!query || character.name.toLocaleLowerCase().includes(query) || (character.libraryGroup || '').toLocaleLowerCase().includes(query)))
    const hidden = (characterId: string) => state.personas.some((item) => item.characterId === characterId && !item.enabled)
    return <section className="chat-page persona-window-page">{header}{switcher}<div className="persona-panel">
      <div className="privacy-note">每个人格都有自己的对话和长期记忆，彼此不会混用，也不会出现在聊天列表、小手机或剧本项目里。打开「前世记忆」后，他会只读地参考自己在小手机和长剧情里的记忆。</div>
      <h3 className="persona-section-title">已启用的人格（{enabled.length}）</h3>
      {enabled.length === 0 && <p className="persona-empty">还没有人格。从下面的角色库里选一个加入吧。</p>}
      {enabled.map((item) => {
        const character = characters.find((entry) => entry.id === item.characterId)
        return <article key={item.id} className={`persona-card ${item.id === active?.id ? 'active' : ''}`}>
          <button className="persona-card-main" {...tap(() => choosePersona(item.id))}>{avatarOf(character)}<span><strong>{character?.name}</strong><small>{item.messages.length} 条对话 · {item.memories.length} 条记忆</small></span></button>
          <div className="persona-card-actions">
            <button className="soft-button" {...tap(() => setPersonaState((current) => updatePersona(current, item.id, (entry) => ({ ...entry, pastLifeEnabled: entry.pastLifeEnabled === false }))))}>前世记忆：{item.pastLifeEnabled === false ? '关' : '开'}</button>
            <button className="danger-link" {...tap(() => { if (window.confirm(`把「${character?.name}」移出人格窗口？对话和记忆会保留，重新加入即可恢复。`)) setPersonaState((current) => disablePersona(current, item.id)) })}>移出</button>
          </div>
        </article>
      })}
      <h3 className="persona-section-title">从角色库加入</h3>
      <input className="persona-search" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} onFocus={scrollFieldIntoView} placeholder="搜索角色名或分组" />
      <div className="persona-library">
        {available.map((character) => <button key={character.id} className="persona-library-item" {...tap(() => { setPersonaState((current) => enablePersona(current, character.id)); setView('chat') })}>{avatarOf(character, 'small')}<span><strong>{character.name}</strong><small>{hidden(character.id) ? '曾经加入过 · 恢复原来的对话与记忆' : character.tagline || character.libraryGroup || '加入为人格'}</small></span><i>＋</i></button>)}
        {available.length === 0 && <p className="persona-empty">{characters.length ? '角色库里的角色都已加入。' : '角色库是空的，先去导入或创建角色。'}</p>}
      </div>
      {state.personas.some((item) => !item.enabled) && <details className="persona-hidden-list"><summary>已移出的人格（数据仍保留）</summary>{state.personas.filter((item) => !item.enabled).map((item) => {
        const character = characters.find((entry) => entry.id === item.characterId)
        return <div key={item.id} className="persona-hidden-row"><span>{character?.name || '已删除的角色'} · {item.messages.length} 条对话 · {item.memories.length} 条记忆</span><button className="danger-link" {...tap(() => { if (window.confirm(`彻底删除「${character?.name || '这个人格'}」的对话和记忆？此操作无法撤销。`)) setPersonaState((current) => deletePersona(current, item.id)) })}>彻底删除</button></div>
      })}</details>}
    </div></section>
  }

  if (view === 'memory') {
    const pendingCount = pendingPersonaMemoryMessages(active).length
    const memoryBusy = Boolean(runtime.memoryBusy[active.id])
    return <section className="chat-page persona-window-page">{header}{switcher}<div className="persona-panel">
      <div className="privacy-note">这份记忆只属于「{activeCharacter.name}」的人格窗口：不会写进小手机、长剧情或其他人格。每攒 {PERSONA_MEMORY_EVERY} 条新消息自动整理一次（当前待整理 {pendingCount} 条）。</div>
      <div className="persona-toggle-row"><div><strong>自动整理记忆</strong><small>用「设置 → 长记忆」里的记忆 API，没填时沿用聊天渠道。</small></div><button className={`switch ${active.autoMemory !== false ? 'on' : ''}`} aria-label="自动整理记忆" {...tap(() => setPersonaState((current) => updatePersona(current, active.id, (item) => ({ ...item, autoMemory: item.autoMemory === false }))))}><span /></button></div>
      <div className="persona-toggle-row"><div><strong>前世记忆</strong><small>只读参考 TA 在小手机与长剧情里的记忆（上限约 6000 字），从不写回。</small></div><button className={`switch ${active.pastLifeEnabled !== false ? 'on' : ''}`} aria-label="前世记忆" {...tap(() => setPersonaState((current) => updatePersona(current, active.id, (item) => ({ ...item, pastLifeEnabled: item.pastLifeEnabled === false }))))}><span /></button></div>
      {notice && <div className="memory-auto-notice">{notice}</div>}
      <div className="persona-memory-actions">
        <button className="primary-button" disabled={memoryBusy} {...tap(() => { const deps = depsFor(active.characterId); if (deps && !memoryBusy) void extractPersonaMemory(active.id, deps, true) })}>{memoryBusy ? '正在整理…' : '立即整理新对话'}</button>
        <button className="secondary-button" {...tap(() => updateActiveMemories((entries) => [...entries, { id: crypto.randomUUID(), title: '手写记忆', content: '', createdAt: Date.now() }]))}>＋ 手写一条</button>
      </div>
      {active.memories.length === 0 && <div className="empty-memory"><span>✦</span><strong>还没有长期记忆</strong><p>多聊几句，或点上面的按钮整理。</p></div>}
      {active.memories.slice().reverse().map((entry) => <article key={entry.id} className={`memory-entry ${entry.pinned ? 'pinned' : ''}`}>
        <input className="persona-memory-title" value={entry.title} onFocus={scrollFieldIntoView} onChange={(event) => { const value = event.target.value; updateActiveMemories((entries) => entries.map((item) => item.id === entry.id ? { ...item, title: value, autoGenerated: false, updatedAt: Date.now() } : item)) }} />
        <small>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}{entry.autoGenerated ? ' · 自动整理' : ' · 手写/已编辑'}</small>
        <textarea rows={4} value={entry.content} onFocus={scrollFieldIntoView} placeholder="写下要他长期记住的事" onChange={(event) => { const value = event.target.value; updateActiveMemories((entries) => entries.map((item) => item.id === entry.id ? { ...item, content: value, autoGenerated: false, updatedAt: Date.now() } : item)) }} />
        <div className="memory-entry-actions">
          <button className="soft-button" {...tap(() => updateActiveMemories((entries) => entries.map((item) => item.id === entry.id ? { ...item, pinned: !item.pinned } : item)))}>{entry.pinned ? '取消核心' : '设为核心记忆'}</button>
          <button className="danger-link" {...tap(() => updateActiveMemories((entries) => entries.filter((item) => item.id !== entry.id)))}>删除</button>
        </div>
      </article>)}
    </div></section>
  }

  const lastMessage = messages[messages.length - 1]
  return <section className="chat-page persona-window-page">{header}{switcher}
    {error && <div className="chat-error" role="alert"><button className="chat-error-action" {...tap(() => setPersonaError(active.id, ''))}><span>连接提示</span>{error}</button><button className="chat-error-close" aria-label="关闭提示" {...tap(() => setPersonaError(active.id, ''))}>×</button></div>}
    <div ref={listRef} className="message-list persona-message-list" onScroll={onScroll}>
      {earlierCount > 0 && <button type="button" className="chat-load-earlier" onClick={loadEarlier}>加载更早 {earlierCount} 条</button>}
      {messages.length === 0 && <div className="persona-intro">{avatarOf(activeCharacter, 'large')}<strong>{activeCharacter.name}</strong><p>这是只属于 {activeCharacter.name} 的窗口。这里的对话与记忆独立存放{active.pastLifeEnabled !== false ? '，TA 隐约记得小手机和长剧情里的前世' : ''}。</p><button className="soft-button" {...tap(letThemSpeak)}>让 TA 先开口</button></div>}
      {rendered.map((message) => {
        const isUser = message.role === 'user'
        const streamingNow = !isUser && generating && message.id === lastMessage?.id
        if (!isUser && !streamingNow && !message.text.trim()) return null
        const name = isUser ? identity.name : activeCharacter.name
        const avatar = isUser ? identity.avatar : activeCharacter.avatar
        return <div key={message.id} data-message-id={message.id} className={`message-row ${message.role} message-layout-flat`}>
          <div className="message-line message-line-flat">
            <div className="message-author"><div className="message-avatar">{avatar ? <img src={avatar} alt="" /> : name.slice(-1)}</div><span>{name}</span></div>
            <div className="message-flat-body">
              {message.images?.length ? <div className={`message-images count-${Math.min(message.images.length, 4)}`}>{message.images.map((image) => <button type="button" key={image.id} aria-label="查看图片" onClick={() => setViewerImage(image)}><img src={image.dataUrl} alt="" loading="lazy" decoding="async" /></button>)}</div> : null}
              {streamingNow && (!message.text || isPendingAssistantText(message.text)) ? <div className="persona-typing">（{activeCharacter.name}正在回应…）</div> : (message.text.trim() ? <MessageContent text={message.text} role={message.role} character={activeCharacter} userName={identity.name} layout="flat" streaming={streamingNow} noStatus /> : null)}
            </div>
          </div>
          {!streamingNow && <div className="message-action-row">
            <button className="message-action-trigger" aria-label="消息操作" {...tap(() => setMenuMessageId(menuMessageId === message.id ? null : message.id))}>•••</button>
            {menuMessageId === message.id && <span className="persona-message-menu">
              <button {...tap(() => { void navigator.clipboard?.writeText(message.text).catch(() => undefined); setMenuMessageId(null) })}>复制</button>
              {!isUser && message.id === lastMessage?.id && <button disabled={generating} {...tap(() => { setMenuMessageId(null); regenerate() })}>重新生成</button>}
              <button className="danger" {...tap(() => { if (window.confirm('删除这条消息？')) setPersonaState((current) => updatePersona(current, active.id, (item) => ({ ...item, messages: item.messages.filter((entry) => entry.id !== message.id) }))); setMenuMessageId(null) })}>删除</button>
            </span>}
            {!isUser && message.id === lastMessage?.id && !generating && <button className="continue-turn-button" aria-label="让 TA 继续说" title="继续" {...tap(letThemSpeak)}>▶</button>}
          </div>}
          {!isUser && (message.finishReason === 'length' || message.finishReason === 'max_tokens') && <span className="message-finish-note">回复达到上限，可点 ▶ 让 TA 接着说</span>}
        </div>
      })}
    </div>
    <div ref={composerRef} className={`composer persona-composer${pendingImages.length || imageBusy ? ' has-images' : ''}`}>
      {(pendingImages.length > 0 || imageBusy) && <div className="composer-images" aria-label="待发送图片">{pendingImages.map((image) => <div key={image.id}><img src={image.dataUrl} alt="" role="button" aria-label="查看大图" onClick={() => setViewerImage(image)} /><button type="button" aria-label="移除图片" onClick={() => setPendingImages((current) => current.filter((item) => item.id !== image.id))}>×</button></div>)}{imageBusy && <span className="composer-images-busy">处理中…</span>}</div>}
      <button className="composer-plus" aria-label="添加图片" {...tap(() => imageInputRef.current?.click())}>＋</button>
      <textarea ref={textareaRef} rows={1} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={generating ? '可以先写下一条，停止后再发送' : `对${activeCharacter.name}说……`} />
      <button className={`send-button ${generating ? 'stop' : ''}`} aria-label={generating ? '停止生成' : '发送'} {...tap(send)}>{generating ? '■' : '↑'}</button>
      <input ref={imageInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => { const files = event.currentTarget.files; void addImages(files).finally(() => { if (imageInputRef.current) imageInputRef.current.value = '' }) }} />
    </div>
    <button className="persona-memory-fab" aria-label="查看记忆" {...tap(() => { setSwitcherOpen(false); setView('memory') })}>记忆 {active.memories.length}</button>
    {viewerImage && <div className="chat-image-viewer" role="dialog" aria-modal="true" aria-label="查看图片" onClick={() => setViewerImage(null)}><img src={viewerImage.dataUrl} alt="" /><button type="button" aria-label="关闭图片">×</button></div>}
  </section>
}
