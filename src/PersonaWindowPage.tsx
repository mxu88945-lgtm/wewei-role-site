import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { fetchApiModels, type ApiConfig, type ApiModel } from './chatApi'
import type { ApiChannel } from './apiChannels'
import type { Character } from './characterCard'
import type { Conversation } from './conversationLifecycle'
import type { LongMemoryMap } from './memoryEngine'
import type { StoryProject } from './storyProject'
import type { ChatApiMessage } from './chatApi'
import { applyMacros } from './regexEngine'
import { CHAT_IMAGE_LIMIT, prepareChatImage, type ChatImage } from './chatImages'
import { CHAT_RENDER_WINDOW, earlierChatMessageCount, earlierChatWindowAnchor, resolveChatWindowStart } from './chatWindow'
import { createKeyboardScrollPin, VIEWPORT_CHANGE_EVENT, VIEWPORT_WILL_CHANGE_EVENT } from './keyboardScrollPin'
import MessageContent, { isPendingAssistantText } from './MessageContent'
import { personaReplyText } from './personaWindowPresentation'
import PersonaSettingsHome, { type PersonaSettingsPanel } from './PersonaSettingsHome'
import { activeThread, addPersonaThread, buildPersonaSetting, collectPastLifeMemory, deletePersona, deletePersonaThread, disablePersona, enablePersona, PERSONA_MEMORY_EVERY, PERSONA_WINDOW_PRESET, pendingPersonaMemoryCount, personaMemoryApi, renamePersonaThread, resolvePersonaApi, switchPersona, switchPersonaThread, updatePersona, updatePersonaThread, type PersonaMemoryEntry, type PersonaMessage, type PersonaWindow } from './personaWindow'
import { hydratePersonaStore, setPersonaState, usePersonaHydrated, usePersonaState } from './personaWindowStore'
import { buildPersonaRequest, extractPersonaMemory, generatePersonaReply, getPersonaRuntime, setPersonaError, stopPersonaReply, subscribePersonaRuntime, type PersonaRuntimeDeps } from './personaWindowRuntime'

import './persona-window.css'

type Props = {
  characters: Character[]
  conversations: Conversation[]
  memoryEntries: LongMemoryMap
  identity: { name: string; description: string; avatar?: string }
  /** Main chat's current channel (the default for every persona). */
  api: ApiChannel
  apiChannels: ApiChannel[]
  /** The memory API chosen in 设置 → 长记忆 (may be incomplete; then the persona's own channel is used). */
  memoryApiFor: (characterId: string) => ApiConfig
  temperature: number
  topP: number
  maxTokens: number
  streaming: boolean
  memoryLength: number
  /** Same global worldbook as the main story chat. */
  globalWorldbook?: string
  storyProjects?: StoryProject[]
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

function timeLabel(at: number) {
  if (!at) return ''
  const date = new Date(at)
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  if (date.toDateString() === now.toDateString()) return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/** Channel + model for one persona (same fields as the main chat's member API binding). */
function PersonaModelPicker({ persona, channels, mainApi, onChange, onFocus }: { persona: PersonaWindow; channels: ApiChannel[]; mainApi: ApiChannel; onChange: (patch: { apiChannelId?: string; modelName?: string }) => void; onFocus: (event: React.FocusEvent<HTMLElement>) => void }) {
  const listId = useId()
  const tap = useOneTap()
  const follows = !persona.apiChannelId || !channels.some((item) => item.id === persona.apiChannelId)
  const channel = follows ? mainApi : channels.find((item) => item.id === persona.apiChannelId) || mainApi
  const [models, setModels] = useState<ApiModel[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => { setModels([]); setMessage('') }, [channel.id])
  const load = async () => {
    setLoading(true)
    setMessage('正在获取模型…')
    try {
      const next = await fetchApiModels(channel)
      setModels(next)
      setMessage(next.length ? `已获取 ${next.length} 个模型` : '接口没有返回可用模型，可手动填写。')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '获取模型失败，可手动填写。')
    } finally { setLoading(false) }
  }
  return <div className="member-api-binding persona-model-picker">
    <label><span>回复渠道</span><select value={follows ? '' : channel.id} onChange={(event) => onChange(event.target.value ? { apiChannelId: event.target.value, modelName: undefined } : { apiChannelId: undefined, modelName: undefined })}><option value="">跟随主聊天（{mainApi.name}）</option>{channels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {!follows && <label><span>回复模型</span><div className="member-model-field"><input list={listId} value={persona.modelName || ''} onFocus={onFocus} onChange={(event) => onChange({ apiChannelId: persona.apiChannelId, modelName: event.target.value || undefined })} placeholder={channel.modelName || '手动填写模型名称'} autoCapitalize="none" autoCorrect="off" /><button type="button" {...tap(() => { void load() })} disabled={loading}>{loading ? '获取中…' : '获取模型'}</button></div></label>}
    <datalist id={listId}>{models.map((model) => <option value={model.id} key={model.id} />)}</datalist>
    {!follows && models.length > 0 && <label><span>模型列表</span><select value={models.some((model) => model.id === persona.modelName) ? persona.modelName : ''} onChange={(event) => { if (event.target.value) onChange({ apiChannelId: persona.apiChannelId, modelName: event.target.value }) }}><option value="">从 {models.length} 个模型中选择</option>{models.map((model) => <option value={model.id} key={model.id}>{model.id}</option>)}</select></label>}
    {message && <small className="member-model-message">{message}</small>}
  </div>
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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [settingsPanel, setSettingsPanel] = useState<PersonaSettingsPanel>('home')
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null)
  const [libraryOpen, setLibraryOpen] = useState<boolean | null>(null)
  const [draft, setDraft] = useState('')
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([])
  const [imageBusy, setImageBusy] = useState(false)
  const [viewerImage, setViewerImage] = useState<ChatImage | null>(null)
  const [menuMessageId, setMenuMessageId] = useState<number | null>(null)
  const [windowAnchors, setWindowAnchors] = useState<Record<string, number | null>>({})
  const [libraryQuery, setLibraryQuery] = useState('')
  const [pastLifeOpen, setPastLifeOpen] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const settingsRef = useRef<HTMLElement>(null)
  const stickRef = useRef(true)
  const prependRef = useRef<{ height: number; top: number } | null>(null)
  const tap = useOneTap()

  const thread = active ? activeThread(active) : undefined
  const threadId = thread?.id || ''
  const generating = Boolean(thread && runtime.generating[thread.id])
  const error = thread ? runtime.errors[thread.id] || '' : ''
  const notice = active ? runtime.notices[active.id] || '' : ''
  const messages = thread?.messages ?? EMPTY_MESSAGES
  const windowStart = resolveChatWindowStart(messages, thread ? windowAnchors[thread.id] : null)
  const earlierCount = earlierChatMessageCount(windowStart)
  const rendered = windowStart > 0 ? messages.slice(windowStart) : messages

  const depsFor = (characterId: string): PersonaRuntimeDeps | null => {
    // Always the live, full card from the character library (description, personality, lore…).
    const character = characters.find((item) => item.id === characterId)
    if (!character) return null
    const persona = state.personas.find((item) => item.characterId === characterId)
    const chatApi = resolvePersonaApi(persona, props.apiChannels, props.api)
    return {
      character,
      user: { name: identity.name, description: identity.description },
      api: chatApi,
      memoryApi: personaMemoryApi(props.memoryApiFor(characterId), chatApi),
      temperature: props.temperature,
      topP: props.topP,
      maxTokens: props.maxTokens,
      streaming: props.streaming,
      memoryLength: props.memoryLength,
      // Read-only snapshot of this character's phone/story life, built per request.
      pastLife: () => collectPastLifeMemory({ character, characters, conversations, memoryEntries, userName: identity.name }).text,
      globalWorldbook: props.globalWorldbook || '',
      setting: () => buildPersonaSetting({ character, characters, conversations, storyProjects: props.storyProjects || [] }),
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
  }, [messages, view, threadId])

  useEffect(() => { stickRef.current = true }, [threadId])

  // The drawer is an input-bearing layer: give it the app height like other 惟境 sheets.
  useEffect(() => {
    if (!drawerOpen) return
    const applyAppHeight = (window as Window & { __weijingApplyAppHeight?: () => void }).__weijingApplyAppHeight
    applyAppHeight?.()
    const previousFocus = document.activeElement as HTMLElement | null
    const focusable = () => Array.from(settingsRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary') || [])
    focusable()[0]?.focus({ preventScroll: true })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setDrawerOpen(false); setRenaming(null); return }
      if (event.key !== 'Tab') return
      const controls = focusable()
      const first = controls[0], last = controls[controls.length - 1]
      if (!first || !last) return
      if (event.shiftKey && (document.activeElement === first || !settingsRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !settingsRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) }
  }, [drawerOpen])

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
  }, [view, threadId])

  const onScroll = () => {
    const list = listRef.current
    if (!list) return
    stickRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= 96
  }

  const loadEarlier = () => {
    const list = listRef.current
    if (!thread || !list) return
    prependRef.current = { height: list.scrollHeight, top: list.scrollTop }
    setWindowAnchors((current) => ({ ...current, [thread.id]: earlierChatWindowAnchor(messages, windowStart, CHAT_RENDER_WINDOW) }))
  }

  const send = () => {
    if (!active || !activeCharacter || !thread) return
    if (generating) { stopPersonaReply(thread.id); return }
    const text = draft.trim()
    if (!text && !pendingImages.length) return
    const deps = depsFor(active.characterId)
    if (!deps) return
    setDraft('')
    const images = pendingImages
    setPendingImages([])
    stickRef.current = true
    setWindowAnchors((current) => ({ ...current, [thread.id]: null }))
    if (isTouchDevice()) textareaRef.current?.blur()
    void generatePersonaReply(active.id, deps, { text, images, threadId: thread.id })
  }

  const letThemSpeak = () => {
    if (!active || generating) return
    const deps = depsFor(active.characterId)
    if (!deps) return
    stickRef.current = true
    void generatePersonaReply(active.id, deps, { threadId })
  }

  const regenerate = () => {
    if (!active || generating) return
    const deps = depsFor(active.characterId)
    if (deps) void generatePersonaReply(active.id, deps, { regenerate: true, threadId })
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
      setPersonaError(threadId, problem instanceof Error ? problem.message : '图片处理失败，换一张试试。')
    } finally { setImageBusy(false) }
  }

  const choosePersona = (id: string) => {
    setPersonaState((current) => switchPersona(current, id))
    setSwitcherOpen(false)
    setDrawerOpen(false)
    setMenuMessageId(null)
    setPendingImages([])
    setView('chat')
  }

  const chooseThread = (id: string) => {
    if (!active) return
    setPersonaState((current) => switchPersonaThread(current, active.id, id))
    setDrawerOpen(false)
    setMenuMessageId(null)
    setPendingImages([])
    setRenaming(null)
  }

  const togglePastLife = () => { if (active) setPersonaState((current) => updatePersona(current, active.id, (item) => ({ ...item, pastLifeEnabled: item.pastLifeEnabled === false }))) }

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
    {view === 'chat' && active ? <button className="more-button" aria-label="窗口与设置" aria-expanded={drawerOpen} {...tap(() => { setSwitcherOpen(false); setSettingsPanel('home'); setDrawerOpen(true) })}>•••</button> : <button className="more-button" aria-label="返回聊天" {...tap(() => { setSwitcherOpen(false); setView('chat') })}>✓</button>}
  </header>

  const switcher = switcherOpen && <div className="persona-switcher" role="menu" aria-label="切换人格">
    {enabled.map((item) => {
      const character = characters.find((entry) => entry.id === item.characterId)
      return <button key={item.id} role="menuitemradio" aria-checked={item.id === active?.id} className={item.id === active?.id ? 'active' : ''} {...tap(() => choosePersona(item.id))}>{avatarOf(character, 'small')}<span>{character?.name}</span>{item.threads.some((entry) => runtime.generating[entry.id]) && <i>…</i>}</button>
    })}
    <button className="persona-switcher-manage" {...tap(() => { setSwitcherOpen(false); setView('manage') })}>＋ 添加 / 管理人格</button>
  </div>

  if (!hydrated) return <section className="chat-page persona-window-page">{header}<div className="persona-panel"><p className="persona-empty">正在读取人格窗口…</p></div></section>

  if (view === 'manage' || !active || !activeCharacter) {
    const query = libraryQuery.trim().toLocaleLowerCase()
    const available = characters.filter((character) => !enabled.some((item) => item.characterId === character.id) && (!query || character.name.toLocaleLowerCase().includes(query) || (character.libraryGroup || '').toLocaleLowerCase().includes(query)))
    // 收纳: collapsed by default once she already has personas.
    const libraryShown = libraryOpen ?? (enabled.length === 0 || Boolean(query))
    const hidden = (characterId: string) => state.personas.some((item) => item.characterId === characterId && !item.enabled)
    return <section className="chat-page persona-window-page">{header}{switcher}<div className="persona-panel">
      <div className="privacy-note">每个人格都有自己的对话和长期记忆。角色卡只提供背景与性格参考，不会自动接续原卡剧情。打开「前世记忆」后，可参考小手机里的过往交流和长剧情里的共同故事（只读）；他在小手机里也能参考自己在这扇窗口的记忆。</div>
      <h3 className="persona-section-title">已启用的人格（{enabled.length}）</h3>
      {enabled.length === 0 && <p className="persona-empty">还没有人格。从下面的角色库里选一个加入吧。</p>}
      {enabled.map((item) => {
        const character = characters.find((entry) => entry.id === item.characterId)
        return <article key={item.id} className={`persona-card ${item.id === active?.id ? 'active' : ''}`}>
          <button className="persona-card-main" {...tap(() => choosePersona(item.id))}>{avatarOf(character)}<span><strong>{character?.name}</strong><small>{item.threads.length} 个窗口 · {item.threads.reduce((sum, entry) => sum + entry.messages.length, 0)} 条对话 · {item.memories.length} 条记忆</small></span></button>
          <div className="persona-card-actions">
            <button className="soft-button" {...tap(() => setPersonaState((current) => updatePersona(current, item.id, (entry) => ({ ...entry, pastLifeEnabled: entry.pastLifeEnabled === false }))))}>前世记忆：{item.pastLifeEnabled === false ? '关' : '开'}</button>
            <button className="danger-link" {...tap(() => { if (window.confirm(`把「${character?.name}」移出人格窗口？对话和记忆会保留，重新加入即可恢复。`)) setPersonaState((current) => disablePersona(current, item.id)) })}>移出</button>
          </div>
        </article>
      })}
      <button className="persona-library-toggle" aria-expanded={libraryShown} {...tap(() => setLibraryOpen(!libraryShown))}><span>从角色库加入（{available.length}）</span><i>{libraryShown ? '收起 ⌃' : '展开 ⌄'}</i></button>
      {libraryShown && <><input className="persona-search" value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} onFocus={scrollFieldIntoView} placeholder="搜索角色名或分组" />
      <div className="persona-library">
        {available.map((character) => <button key={character.id} className="persona-library-item" {...tap(() => { setPersonaState((current) => enablePersona(current, character.id)); setView('chat') })}>{avatarOf(character, 'small')}<span><strong>{character.name}</strong><small>{hidden(character.id) ? '曾经加入过 · 恢复原来的对话与记忆' : character.tagline || character.libraryGroup || '加入为人格'}</small></span><i>＋</i></button>)}
        {available.length === 0 && <p className="persona-empty">{characters.length ? '角色库里的角色都已加入。' : '角色库是空的，先去导入或创建角色。'}</p>}
      </div></>}
      {state.personas.some((item) => !item.enabled) && <details className="persona-hidden-list"><summary>已移出的人格（数据仍保留）</summary>{state.personas.filter((item) => !item.enabled).map((item) => {
        const character = characters.find((entry) => entry.id === item.characterId)
        return <div key={item.id} className="persona-hidden-row"><span>{character?.name || '已删除的角色'} · {item.threads.reduce((sum, entry) => sum + entry.messages.length, 0)} 条对话 · {item.memories.length} 条记忆</span><button className="danger-link" {...tap(() => { if (window.confirm(`彻底删除「${character?.name || '这个人格'}」的对话和记忆？此操作无法撤销。`)) setPersonaState((current) => deletePersona(current, item.id)) })}>彻底删除</button></div>
      })}</details>}
    </div></section>
  }

  if (view === 'memory') {
    const pendingCount = pendingPersonaMemoryCount(active)
    const memoryBusy = Boolean(runtime.memoryBusy[active.id])
    return <section className="chat-page persona-window-page">{header}{switcher}<div className="persona-panel">
      <div className="privacy-note">这份记忆只属于「{activeCharacter.name}」（TA 的 {active.threads.length} 个窗口共用）：不会写进小手机、长剧情或其他人格（小手机里的 TA 会只读地记得这里的事，别人看不到）。每攒 {PERSONA_MEMORY_EVERY} 条新消息自动整理一次（当前待整理 {pendingCount} 条）。</div>
      <div className="persona-toggle-row"><div><strong>自动整理记忆</strong><small>用「设置 → 长记忆」里的记忆 API，没填时沿用聊天渠道。</small></div><button className={`switch ${active.autoMemory !== false ? 'on' : ''}`} aria-label="自动整理记忆" {...tap(() => setPersonaState((current) => updatePersona(current, active.id, (item) => ({ ...item, autoMemory: item.autoMemory === false }))))}><span /></button></div>
      <div className="persona-toggle-row"><div><strong>前世记忆</strong><small>TA 记得自己在小手机与长剧情里和你经历过的事（最新的优先，上限约 10000 字），只读，从不写回。</small></div><button className={`switch ${active.pastLifeEnabled !== false ? 'on' : ''}`} aria-label="前世记忆" {...tap(() => setPersonaState((current) => updatePersona(current, active.id, (item) => ({ ...item, pastLifeEnabled: item.pastLifeEnabled === false }))))}><span /></button></div>
      {(() => {
        const past = collectPastLifeMemory({ character: activeCharacter, characters, conversations, memoryEntries, userName: identity.name })
        const pastText = applyMacros(past.text, activeCharacter, identity.name)
        const deps = requestOpen ? depsFor(active.characterId) : null
        const request: ChatApiMessage[] = deps && thread ? buildPersonaRequest(active, thread.messages.filter((item) => item.text.trim() || item.images?.length), deps, thread) : []
        const contentText = (message: ChatApiMessage) => typeof message.content === 'string' ? message.content : message.content.map((part) => part.type === 'text' ? part.text : '[图片]').join('\n')
        return <div className="persona-source-card">
          <strong>前世记忆来源</strong>
          <small>{active.pastLifeEnabled === false ? '（前世记忆已关闭，下面只是预览，不会发送）' : ''}找到 {past.relatedConversationCount} 段有 TA 的小手机/长剧情对话，带入 {past.sources.length} 段 · 约 {pastText.length.toLocaleString()} 字{past.characterIds.length > 1 ? ` · 合并了 ${past.characterIds.length} 张同名角色卡` : ''}</small>
          {past.sources.length > 0 && <ul>{past.sources.map((item, index) => <li key={`${item.conversationId}-${index}`}>{item.kind}｜{item.title} · {item.source === 'memory' ? '记忆' : item.source === 'summary' ? '摘要' : item.source === 'card' ? '角色卡记忆' : '最近对话节选'} · {item.chars} 字</li>)}</ul>}
          {!past.sources.length && <small>还没有可带入的前世经历：TA 在小手机和长剧情里还没有对话或记忆。</small>}
          {pastText && <details open={pastLifeOpen} onToggle={(event) => setPastLifeOpen((event.currentTarget as HTMLDetailsElement).open)}><summary>查看注入的前世记忆原文</summary>{pastLifeOpen && <pre>{pastText}</pre>}</details>}
          <details open={requestOpen} onToggle={(event) => setRequestOpen((event.currentTarget as HTMLDetailsElement).open)}><summary>请求预览 · 下一次发送给模型的完整内容</summary>{requestOpen && <div className="persona-request-preview"><small>共 {request.length} 段 · {request.reduce((sum, message) => sum + contentText(message).length, 0).toLocaleString()} 字符（只查看，不发送）</small>{request.map((message, index) => <details key={index}><summary>{index + 1}. {message.role === 'system' ? '幕后设定 / 记忆' : message.role === 'user' ? '用户消息' : '角色回复'}</summary><pre>{contentText(message)}</pre></details>)}</div>}</details>
        </div>
      })()}
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
    {error && <div className="chat-error" role="alert"><button className="chat-error-action" {...tap(() => setPersonaError(threadId, ''))}><span>连接提示</span>{error}</button><button className="chat-error-close" aria-label="关闭提示" {...tap(() => setPersonaError(threadId, ''))}>×</button></div>}
    <div ref={listRef} className="message-list persona-message-list" onScroll={onScroll}>
      {earlierCount > 0 && <button type="button" className="chat-load-earlier" onClick={loadEarlier}>加载更早 {earlierCount} 条</button>}
      {messages.length === 0 && <div className="persona-intro">{avatarOf(activeCharacter, 'large')}<strong>{activeCharacter.name}</strong><p>从这里，慢慢熟悉彼此。角色卡留作背景参考，你们的关系从此刻的交流继续。</p><button className="soft-button" {...tap(letThemSpeak)}>让 TA 先开口</button></div>}
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
              {streamingNow && (!message.text || isPendingAssistantText(message.text)) ? <div className="persona-typing">（{activeCharacter.name}正在回应…）</div> : (message.text.trim() ? <MessageContent text={isUser ? message.text : personaReplyText(message.text)} role={message.role} character={activeCharacter} userName={identity.name} layout="flat" streaming={streamingNow} noStatus /> : null)}
            </div>
          </div>
          {!streamingNow && <div className="message-action-row">
            <button className="message-action-trigger" aria-label="消息操作" {...tap(() => setMenuMessageId(menuMessageId === message.id ? null : message.id))}>•••</button>
            {menuMessageId === message.id && <span className="persona-message-menu">
              <button {...tap(() => { void navigator.clipboard?.writeText(message.text).catch(() => undefined); setMenuMessageId(null) })}>复制</button>
              {!isUser && message.id === lastMessage?.id && <button disabled={generating} {...tap(() => { setMenuMessageId(null); regenerate() })}>重新生成</button>}
              <button className="danger" {...tap(() => { if (window.confirm('删除这条消息？')) setPersonaState((current) => updatePersonaThread(current, active.id, threadId, (item) => ({ ...item, messages: item.messages.filter((entry) => entry.id !== message.id) }))); setMenuMessageId(null) })}>删除</button>
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
    {drawerOpen && <div className="drawer-layer persona-drawer-layer" role="presentation">
      <button className="drawer-backdrop" aria-label="关闭" {...tap(() => { setDrawerOpen(false); setRenaming(null) })} />
      <aside ref={settingsRef} className="app-drawer right-drawer persona-drawer" role="dialog" aria-modal="true" aria-label="窗口与设置">
        <header className={`persona-settings-header ${settingsPanel === 'home' ? 'is-home' : ''}`}>
          {settingsPanel !== 'home' && <button className="persona-settings-back" aria-label="返回设置" {...tap(() => { setSettingsPanel('home'); setRenaming(null) })}>‹</button>}
          {settingsPanel === 'home' && avatarOf(activeCharacter, 'large')}
          <div><small>{settingsPanel === 'home' ? '人格窗口' : activeCharacter.name}</small><h2>{settingsPanel === 'home' ? activeCharacter.name : { threads: '聊天窗口', model: '模型与渠道', prompts: '系统提示词' }[settingsPanel]}</h2>{settingsPanel === 'home' && <p>和 {identity.name}，在这里慢慢相处。</p>}</div>
          <button className="persona-settings-close" aria-label="关闭" {...tap(() => { setDrawerOpen(false); setRenaming(null) })}>×</button>
        </header>
        <div className="right-drawer-scroll">
          {settingsPanel === 'home' && <PersonaSettingsHome promptLength={active.systemPrompt?.trim().length || 0} memoryCount={active.memories.length} threadCount={active.threads.length} threadTitle={thread?.title || ''} channelName={resolvePersonaApi(active, props.apiChannels, props.api).name} modelName={resolvePersonaApi(active, props.apiChannels, props.api).modelName || ''} pastLifeEnabled={active.pastLifeEnabled !== false} onNavigate={setSettingsPanel} onMemory={() => { setDrawerOpen(false); setView('memory') }} onManage={() => { setDrawerOpen(false); setView('manage') }} onTogglePastLife={togglePastLife} tap={tap} />}
          {settingsPanel === 'threads' && <section className="drawer-compact-group persona-threads">
            <div className="drawer-section-title"><strong>窗口（{active.threads.length}）</strong><button {...tap(() => { setPersonaState((current) => addPersonaThread(current, active.id)); setDrawerOpen(false); setRenaming(null) })}>＋ 新开窗口</button></div>
            {active.threads.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map((item) => {
              const last = [...item.messages].reverse().find((entry) => entry.text.trim())
              const current = item.id === threadId
              if (renaming?.id === item.id) return <div key={item.id} className="persona-thread-row editing">
                <input value={renaming.title} autoFocus maxLength={40} onFocus={scrollFieldIntoView} onChange={(event) => setRenaming({ id: item.id, title: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') { setPersonaState((state) => renamePersonaThread(state, active.id, item.id, renaming.title)); setRenaming(null) } }} />
                <button className="soft-button" {...tap(() => { setPersonaState((state) => renamePersonaThread(state, active.id, item.id, renaming.title)); setRenaming(null) })}>保存</button>
              </div>
              return <div key={item.id} className={`persona-thread-row${current ? ' active' : ''}`}>
                <button className="persona-thread-main" aria-current={current} {...tap(() => chooseThread(item.id))}><span><strong>{item.title}</strong><time>{timeLabel(item.updatedAt)}</time></span><small>{last ? `${last.role === 'user' ? '我：' : ''}${(last.role === 'user' ? last.text : personaReplyText(last.text)).replace(/\s+/g, ' ').slice(0, 40) || '等待正文'}` : '还没有对话'}{runtime.generating[item.id] ? ' · 回应中…' : ''}</small></button>
                <button className="persona-thread-action" aria-label={`重命名${item.title}`} {...tap(() => setRenaming({ id: item.id, title: item.title }))}>改名</button>
                <button className="persona-thread-action danger" aria-label={`删除${item.title}`} {...tap(() => { if (window.confirm(`删除「${item.title}」的聊天记录？长期记忆会保留（所有窗口共用）。此操作无法撤销。`)) { stopPersonaReply(item.id); setPersonaState((state) => deletePersonaThread(state, active.id, item.id)) } })}>删除</button>
              </div>
            })}
          </section>}
          {settingsPanel === 'model' && <section className="drawer-compact-group persona-model-group">
            <div className="drawer-section-title"><strong>模型</strong><small className="persona-drawer-hint">当前：{(() => { const chosen = resolvePersonaApi(active, props.apiChannels, props.api); return `${chosen.name} · ${chosen.modelName || '未填写模型'}` })()}</small></div>
            <PersonaModelPicker persona={active} channels={props.apiChannels} mainApi={props.api} onFocus={scrollFieldIntoView} onChange={(patch) => setPersonaState((current) => updatePersona(current, active.id, (item) => {
              const next = { ...item }
              delete next.apiChannelId
              delete next.modelName
              return { ...next, ...(patch.apiChannelId ? { apiChannelId: patch.apiChannelId } : {}), ...(patch.apiChannelId && patch.modelName ? { modelName: patch.modelName } : {}) }
            }))} />
          </section>}
          {settingsPanel === 'prompts' && <section className="persona-prompt-panel">
            <div className="persona-prompt-note"><strong>背景参考，自然相处</strong><p>角色卡提供性格、口吻与故事来历。这里不会自动扮演原卡身份，也不会把你当作原故事女主。</p></div>
            <label className="persona-prompt-label" htmlFor="persona-custom-prompt">给 {activeCharacter.name} 的补充提示词<span>{(active.systemPrompt || '').length.toLocaleString()} / 16,000</span></label>
            <textarea id="persona-custom-prompt" className="persona-prompt-editor" rows={9} maxLength={16000} value={active.systemPrompt || ''} onFocus={scrollFieldIntoView} onChange={(event) => { const systemPrompt = event.target.value; setPersonaState((current) => updatePersona(current, active.id, (item) => ({ ...item, systemPrompt }))) }} placeholder="例如：说话直接一点，可以主动表达自己的想法和情绪；多一点日常交流，少写大段场景。" />
            <small className="persona-prompt-save" role="status">自动保存 · 仅 {activeCharacter.name} 使用，所有窗口共用，下一次回复生效</small>
            <details className="persona-default-prompt"><summary>查看默认相处规则</summary><pre>{applyMacros(PERSONA_WINDOW_PRESET, activeCharacter, identity.name)}</pre></details>
            {active.systemPrompt?.trim() && <button className="danger-link" {...tap(() => { if (window.confirm(`清空给「${activeCharacter.name}」的补充提示词？默认相处规则、对话和记忆都会保留。`)) setPersonaState((current) => updatePersona(current, active.id, (item) => ({ ...item, systemPrompt: '' }))) })}>清空补充，使用默认规则</button>}
          </section>}
        </div>
      </aside>
    </div>}
    {viewerImage && <div className="chat-image-viewer" role="dialog" aria-modal="true" aria-label="查看图片" onClick={() => setViewerImage(null)}><img src={viewerImage.dataUrl} alt="" /><button type="button" aria-label="关闭图片">×</button></div>}
  </section>
}
