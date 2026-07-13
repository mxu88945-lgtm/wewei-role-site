import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ApiSettingsPage from './ApiSettingsPage'
import BackupCard from './BackupCard'
import PresetEditor from './PresetEditor'
import CharacterCardManager from './CharacterCardManager'
import { GreetingPicker, ImportPreview } from './ImportFlow'
import MessageContent from './MessageContent'
import { createBlankCharacter, importCharacterCard, normalizeStoredCharacter, type Character } from './characterCard'
import { completeChat, testApiConnection, type ApiConfig } from './chatApi'
import { buildChatPrompt } from './promptBuilder'
import { createApiChannel, normalizeApiChannels, type ApiChannel } from './apiChannels'
import { enabledPresetText, normalizePresetSections } from './presetConfig'
import { durableGet, durableSet } from './persistentStore'
import { sanitizeAssistantOutput } from './outputSanitizer'
import { memoriesForConversation } from './memoryEngine'

type Page = 'home' | 'characters' | 'create' | 'group-create' | 'import-preview' | 'character-detail' | 'card-data' | 'card-worldbook' | 'card-regex' | 'greeting-picker' | 'chat' | 'more' | 'api' | 'model' | 'settings' | 'appearance' | 'font' | 'identity' | 'worldbook' | 'preset' | 'memory' | 'memory-api' | 'memory-list'
type Message = { id: number; role: 'user' | 'assistant'; text: string; characterId?: string; finishReason?: string | null }
type Drawer = 'left' | 'right'
type GroupReplyMode = 'natural' | 'contextual' | 'all' | 'specified'
type HistoryEntry = { page: Page; reopenDrawer?: Drawer }
type Conversation = {
  id: string
  characterId: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  contextSummary?: string
  compressedUntil?: number
  kind?: 'single' | 'group'
  participantIds?: string[]
  participantApiIds?: Record<string, string>
  memorySummarizedCount?: number
  personaId?: string
}
type LegacySessionMap = Record<string, Message[]>
type MemoryEntry = { id: string; createdAt: number; title: string; content: string; sourceCount: number; pinned?: boolean; consolidated?: boolean }
type MemoryConfig = {
  api: ApiConfig
  autoEvery: number
  maxEntries: number
  summaryPrompt: string
  injectPosition: string
  injectPrompt: string
  lastSummarizedCount: number
}
type MemoryConfigMap = Record<string, MemoryConfig>
type MemoryEntryMap = Record<string, MemoryEntry[]>
type UserIdentity = { id: string; name: string; description: string; avatar?: string }

const demoCharacter: Character = {
  id: 'huo-jin', name: '霍烬', tagline: '沉稳克制的守护者',
  description: 'A 国旧世家出身，寡言、冷静，习惯把所有风浪挡在身后。不会替你决定，但会一直站在你能看见的地方。',
  personality: '', scenario: '', greeting: '夜里风大。过来，站我这边。', alternateGreetings: [], mesExample: '', creatorNotes: '', systemPrompt: '', postHistoryInstructions: '',
  tags: ['慢热', '沉稳', '守护', '剧情向'], creator: '', characterVersion: '', regexScripts: [],
}

const legacyMemoryPrompt = `【暂停剧情扮演】请根据前文内容，对上次总结之后的剧情进行总结。生成一个详细的总结集合，涵盖所有主要事件、观点、关系变化与关键信息。总结需逻辑清晰，按时间顺序组织，每件事以独立条目呈现，并尽量标注具体时间点。若时间信息不明确，请根据上下文合理推测并注明。重点保留人物关系、承诺、冲突、情绪转折、世界设定与未完成事项，避免遗漏。`
const defaultMemoryPrompt = `【长期记忆整理｜不要继续角色扮演】
你只整理“本次新增对话”，输出可供后续剧情检索的长期记忆，不续写剧情，不复述提示词。
要求：
1. 只记录实际发生或明确说出的事实，不把猜测写成事实；时间不明时写“时间未明确”，禁止擅自编造日期。
2. 按发生顺序整理，优先保留事件、地点、人物关系变化、承诺、冲突、情绪转折、重要物品、世界设定与未完成事项。
3. 区分角色与用户各自的言行，禁止把角色行为记到用户身上。
4. “已有长期记忆”仅用于查重；不要复制或改写已保存内容，只补充新增信息或明确发生的变化。
5. 删除寒暄、重复描述、文风修辞、状态栏格式要求及与长期剧情无关的细节。
输出格式：
【时间线】
- 时间/阶段｜地点｜事件与结果
【关系与状态变化】
- 人物｜变化｜原因
【未完成事项】
- 事项｜当前进度
没有内容的栏目写“无”，不要输出其他说明。`
const defaultInjectPrompt = `以下是该角色与用户的长期记忆。请把它当作已经发生过的事实，自然延续，不要逐条复述，也不要替用户决定言行：\n\n{{memories}}`

const defaultMemoryConfig = (): MemoryConfig => ({
  api: { baseUrl: 'https://api.openai.com/v1', apiKey: '', modelName: 'gpt-4.1-mini' },
  autoEvery: 50,
  maxEntries: 2000,
  summaryPrompt: defaultMemoryPrompt,
  injectPosition: 'after-main-prompt',
  injectPrompt: defaultInjectPrompt,
  lastSummarizedCount: 0,
})

const migrateMemoryConfigs = (configs: MemoryConfigMap) => Object.fromEntries(Object.entries(configs).map(([id, config]) => [id, {
  ...config,
  summaryPrompt: config.summaryPrompt === legacyMemoryPrompt ? defaultMemoryPrompt : config.summaryPrompt,
}]))

const read = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value))
const writeDurable = (key: string, value: unknown) => {
  try { write(key, value) } catch (error) { console.warn('本地轻量储存已满，继续写入 IndexedDB', error) }
  void durableSet(key, value).catch((error) => console.error('IndexedDB 写入失败', error))
}

async function imageThumbnail(file: File, size = 256) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size
  const context = canvas.getContext('2d'); if (!context) return ''
  const scale = Math.max(size / bitmap.width, size / bitmap.height)
  const width = bitmap.width * scale; const height = bitmap.height * scale
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', .82)
}

async function backgroundImageData(file: File, maxEdge = 1600) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return ''
  context.fillStyle = '#f7f3fa'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', .84)
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.replace(/[\\/:*?"<>|]/g, '_')
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportableCharacter(character: Character) {
  return {
    spec: 'chara_card_v3',
    spec_version: character.cardSpecVersion || '3.0',
    data: {
      name: character.name,
      description: character.description,
      personality: character.personality,
      scenario: character.scenario,
      first_mes: character.greeting,
      alternate_greetings: character.alternateGreetings,
      mes_example: character.mesExample,
      creator_notes: character.creatorNotes,
      system_prompt: character.systemPrompt,
      post_history_instructions: character.postHistoryInstructions,
      tags: character.tags,
      creator: character.creator,
      character_version: character.characterVersion,
      character_book: character.characterBook,
      extensions: { regex_scripts: character.regexScripts },
    },
  }
}

const createConversation = (character: Character, greeting = character.greeting, title?: string): Conversation => ({
  id: `${character.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  characterId: character.id,
  title: title || `与${character.name}的对话`,
  messages: [{ id: Date.now(), role: 'assistant', text: greeting }],
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

const loadConversations = (characters: Character[]): Conversation[] => {
  const stored = read<Conversation[]>('weijing.conversations', [])
  if (Array.isArray(stored) && stored.length) return stored

  const legacy = read<LegacySessionMap>('weijing.sessions', {})
  const migrated = Object.entries(legacy).map(([characterId, messages], index) => {
    const character = characters.find((item) => item.id === characterId) || demoCharacter
    const timestamp = Date.now() - index
    return {
      id: `${characterId}-migrated-${timestamp}`,
      characterId,
      title: `与${character.name}的对话`,
      messages: Array.isArray(messages) && messages.length ? messages : [{ id: timestamp, role: 'assistant' as const, text: character.greeting }],
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  })
  return migrated.length ? migrated : [createConversation(characters[0] || demoCharacter)]
}

function BackHeader({ title, onBack, action }: { title: string; onBack: () => void; action?: React.ReactNode }) {
  return <header className="page-header"><button className="icon-button" onClick={onBack}>‹</button><h1>{title}</h1><div className="header-action">{action}</div></header>
}

function App() {
  const [page, setPage] = useState<Page>('home')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [drawer, setDrawer] = useState<Drawer | null>(null)
  const [conversationMenuId, setConversationMenuId] = useState<string | null>(null)
  const [messageMenuId, setMessageMenuId] = useState<number | null>(null)
  const [characterMenuId, setCharacterMenuId] = useState<string | null>(null)
  const [characterQuery, setCharacterQuery] = useState('')
  const [groupDraft, setGroupDraft] = useState<{ title: string; participantIds: string[]; apiIds: Record<string, string> }>({ title: '', participantIds: [], apiIds: {} })
  const [groupReplyMode, setGroupReplyMode] = useState<GroupReplyMode>(() => read('weijing.groupReplyMode', 'natural'))
  const [mentionPickerOpen, setMentionPickerOpen] = useState(false)
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)
  const [characterIntroExpanded, setCharacterIntroExpanded] = useState(false)
  const [characters, setCharacters] = useState<Character[]>(() => read<Partial<Character>[]>('weijing.characters', [demoCharacter]).map(normalizeStoredCharacter))
  const [activeId, setActiveId] = useState(() => read('weijing.activeCharacter', demoCharacter.id))
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations(read<Partial<Character>[]>('weijing.characters', [demoCharacter]).map(normalizeStoredCharacter)))
  const [activeConversationId, setActiveConversationId] = useState(() => read('weijing.activeConversation', ''))
  const [draft, setDraft] = useState('')
  const [newCharacter, setNewCharacter] = useState({ name: '', tagline: '', description: '', greeting: '', tags: '', avatar: '' })
  const [characterUrl, setCharacterUrl] = useState('')
  const legacyIdentity = read<{ name: string; description: string; avatar?: string }>('weijing.identity', { name: '周惟惟', description: '由用户亲自决定言行、心理与关键选择。' })
  const [identities, setIdentities] = useState<UserIdentity[]>(() => read<UserIdentity[]>('weijing.identities', [{ id: 'persona-default', ...legacyIdentity }]))
  const [activePersonaId, setActivePersonaId] = useState(() => read('weijing.activePersona', 'persona-default'))
  const [worldbook, setWorldbook] = useState(() => read('weijing.worldbook', 'A 国旧世家与现代都市并存。剧情缓慢推进，不替用户角色做决定。'))
  const [presetSections, setPresetSections] = useState(() => normalizePresetSections(read('weijing.presetSections', []), read('weijing.preset', '克制、细腻、慢热；每轮携带微量剧情进展。')))
  const [apiChannels, setApiChannels] = useState<ApiChannel[]>(() => normalizeApiChannels(read('weijing.apiChannels', []), read('weijing.api', { baseUrl: 'https://api.openai.com/v1', apiKey: '', modelName: 'gpt-4.1-mini' })))
  const [activeApiId, setActiveApiId] = useState(() => read('weijing.activeApiChannel', ''))
  const [connection, setConnection] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [connectionMessage, setConnectionMessage] = useState('尚未测试连接')
  const [chatError, setChatError] = useState('')
  const [generatingIds, setGeneratingIds] = useState<string[]>([])
  const [temperature, setTemperature] = useState(() => read('weijing.temperature', 0.95))
  const [topP, setTopP] = useState(() => read('weijing.topP', 0.9))
  const [memoryLength, setMemoryLength] = useState(() => read('weijing.memoryLength', 47))
  const [maxTokens, setMaxTokens] = useState(() => read('weijing.maxTokens', 8000))
  const [streaming, setStreaming] = useState(() => read('weijing.streaming', true))
  const [chatLayout, setChatLayout] = useState<'bubble' | 'flat'>(() => read('weijing.chatLayout', 'bubble'))
  const [chatFontSize, setChatFontSize] = useState(() => read('weijing.chatFontSize', 16))
  const [chatTextColor, setChatTextColor] = useState(() => read('weijing.chatTextColor', '#4e4852'))
  const [chatNarrationColor, setChatNarrationColor] = useState(() => read('weijing.chatNarrationColor', '#7f7089'))
  const [chatQuoteColor, setChatQuoteColor] = useState(() => read('weijing.chatQuoteColor', '#7b4d67'))
  const [chatBaseColor, setChatBaseColor] = useState(() => read('weijing.chatBaseColor', '#f5f1f8'))
  const [chatTheme, setChatTheme] = useState<'mist' | 'pearl'>(() => read('weijing.chatTheme', 'mist'))
  const [chatBackgroundFrost, setChatBackgroundFrost] = useState(() => read('weijing.chatBackgroundFrost', .72))
  const [chatBackground, setChatBackground] = useState('')
  const [memoryConfigs, setMemoryConfigs] = useState<MemoryConfigMap>(() => migrateMemoryConfigs(read('weijing.memoryConfigs', { [demoCharacter.id]: defaultMemoryConfig() })))
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntryMap>(() => read('weijing.memoryEntries', { [demoCharacter.id]: [] }))
  const [memoryState, setMemoryState] = useState<'idle' | 'summarizing' | 'ok' | 'error'>('idle')
  const [importState, setImportState] = useState<'idle' | 'reading' | 'error'>('idle')
  const [importError, setImportError] = useState('')
  const [pendingImport, setPendingImport] = useState<Character | null>(null)
  const [restartingConversationId, setRestartingConversationId] = useState<string | null>(null)
  const [chatJump, setChatJump] = useState({ up: false, down: false })
  const [persistenceReady, setPersistenceReady] = useState(false)
  const [storageUsage, setStorageUsage] = useState('正在计算…')
  const [appDataUsage, setAppDataUsage] = useState('正在计算…')
  const [compressingContext, setCompressingContext] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const phoneCanvasRef = useRef<HTMLElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const lastChatScrollTopRef = useRef(0)
  const streamScrollLockRef = useRef<{ top: number; version: number } | null>(null)
  const generationControllers = useRef(new Map<string, AbortController>())

  const explicitConversation = conversations.find((item) => item.id === activeConversationId)
  const groupLeadId = explicitConversation?.kind === 'group' ? explicitConversation.participantIds?.[0] : undefined
  const activeCharacter = characters.find((item) => item.id === (groupLeadId || activeId)) || characters[0] || demoCharacter
  const api = apiChannels.find((item) => item.id === activeApiId) || apiChannels[0]
  const activeConversation = (explicitConversation?.kind === 'group' ? explicitConversation : conversations.find((item) => item.id === activeConversationId && item.characterId === activeCharacter.id))
    || conversations.filter((item) => item.characterId === activeCharacter.id).sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const identity = identities.find((item) => item.id === activeConversation?.personaId) || identities.find((item) => item.id === activePersonaId) || identities[0] || { id: 'persona-default', name: '周惟惟', description: '由用户亲自决定言行、心理与关键选择。' }
  const messages = activeConversation?.messages || [{ id: 1, role: 'assistant' as const, text: activeCharacter.greeting }]
  const currentMemoryConfig = memoryConfigs[activeCharacter.id] || defaultMemoryConfig()
  const memoryScopeId = activeConversation?.id || activeCharacter.id
  const currentMemories = memoriesForConversation(memoryEntries, activeConversation?.id, activeCharacter.id) as MemoryEntry[]

  useEffect(() => {
    let cancelled = false
    Promise.all([
      durableGet<Partial<Character>[]>('weijing.characters'), durableGet<Conversation[]>('weijing.conversations'),
      durableGet<UserIdentity[]>('weijing.identities'), durableGet<UserIdentity>('weijing.identity'), durableGet<MemoryConfigMap>('weijing.memoryConfigs'), durableGet<MemoryEntryMap>('weijing.memoryEntries'), durableGet<string>('weijing.chatBackground'),
    ]).then(([storedCharacters, storedConversations, storedIdentities, storedIdentity, storedConfigs, storedEntries, storedBackground]) => {
      if (cancelled) return
      if (storedCharacters?.length) setCharacters(storedCharacters.map(normalizeStoredCharacter))
      if (storedConversations?.length) setConversations(storedConversations)
      if (storedIdentities?.length) setIdentities(storedIdentities)
      else if (storedIdentity) setIdentities([{ ...storedIdentity, id: storedIdentity.id || 'persona-default' }])
      if (storedConfigs) setMemoryConfigs(migrateMemoryConfigs(storedConfigs))
      if (storedEntries) setMemoryEntries(storedEntries)
      if (storedBackground) setChatBackground(storedBackground)
      setPersistenceReady(true)
    }).catch(() => setPersistenceReady(true))
    navigator.storage?.estimate().then(({ usage = 0, quota = 0 }) => setStorageUsage(`${(usage / 1048576).toFixed(1)} MB / ${(quota / 1048576).toFixed(0)} MB`))
    return () => { cancelled = true }
  }, [])
  useEffect(() => { if (persistenceReady) writeDurable('weijing.characters', characters) }, [characters, persistenceReady])
  useEffect(() => write('weijing.activeCharacter', activeId), [activeId])
  useEffect(() => setCharacterIntroExpanded(false), [activeId])
  useEffect(() => { if (persistenceReady) writeDurable('weijing.conversations', conversations) }, [conversations, persistenceReady])
  useEffect(() => write('weijing.activeConversation', activeConversation?.id || ''), [activeConversation?.id])
  useEffect(() => { if (persistenceReady) writeDurable('weijing.identities', identities) }, [identities, persistenceReady])
  useEffect(() => { write('weijing.activePersona', activePersonaId) }, [activePersonaId])
  useEffect(() => write('weijing.worldbook', worldbook), [worldbook])
  useEffect(() => { write('weijing.presetSections', presetSections); write('weijing.preset', enabledPresetText(presetSections)) }, [presetSections])
  useEffect(() => write('weijing.apiChannels', apiChannels), [apiChannels])
  useEffect(() => write('weijing.activeApiChannel', api.id), [api.id])
  useEffect(() => write('weijing.api', { baseUrl: api.baseUrl, apiKey: api.apiKey, modelName: api.modelName, maxTokenField: api.maxTokenField }), [api])
  useEffect(() => { if (persistenceReady) writeDurable('weijing.memoryConfigs', memoryConfigs) }, [memoryConfigs, persistenceReady])
  useEffect(() => { if (persistenceReady) writeDurable('weijing.memoryEntries', memoryEntries) }, [memoryEntries, persistenceReady])
  useEffect(() => { write('weijing.temperature', temperature); write('weijing.topP', topP); write('weijing.memoryLength', memoryLength); write('weijing.maxTokens', maxTokens); write('weijing.streaming', streaming) }, [temperature, topP, memoryLength, maxTokens, streaming])
  useEffect(() => write('weijing.chatLayout', chatLayout), [chatLayout])
  useEffect(() => write('weijing.chatTheme', chatTheme), [chatTheme])
  useEffect(() => write('weijing.groupReplyMode', groupReplyMode), [groupReplyMode])
  useEffect(() => {
    write('weijing.chatFontSize', chatFontSize)
    write('weijing.chatTextColor', chatTextColor)
    write('weijing.chatNarrationColor', chatNarrationColor)
    write('weijing.chatQuoteColor', chatQuoteColor)
    write('weijing.chatBaseColor', chatBaseColor)
    write('weijing.chatBackgroundFrost', chatBackgroundFrost)
  }, [chatFontSize, chatTextColor, chatNarrationColor, chatQuoteColor, chatBaseColor, chatBackgroundFrost])
  useEffect(() => { if (persistenceReady) void durableSet('weijing.chatBackground', chatBackground) }, [chatBackground, persistenceReady])
  useEffect(() => {
    const bytes = new Blob([JSON.stringify({ characters, conversations, identities, memoryConfigs, memoryEntries, chatBackground })]).size
    setAppDataUsage(bytes < 1048576 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1048576).toFixed(2)} MB`)
  }, [characters, conversations, identities, memoryConfigs, memoryEntries, chatBackground])
  useEffect(() => {
    document.documentElement.classList.toggle('chat-layout-flat', chatLayout === 'flat')
    return () => document.documentElement.classList.remove('chat-layout-flat')
  }, [chatLayout])
  useEffect(() => () => generationControllers.current.forEach((controller) => controller.abort()), [])
  useEffect(() => { if (activeApiId !== api.id) setActiveApiId(api.id) }, [activeApiId, api.id])
  useLayoutEffect(() => {
    const textarea = composerRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 40), 144)}px`
  }, [draft])
  useLayoutEffect(() => {
    phoneCanvasRef.current?.scrollTo({ top: 0, left: 0 })
  }, [page])
  useLayoutEffect(() => {
    if (page !== 'chat') return
    const list = messageListRef.current
    if (!list) return
    const bottom = () => { list.scrollTop = list.scrollHeight; setChatJump({ up: list.scrollTop > 240, down: false }) }
    window.requestAnimationFrame(() => window.requestAnimationFrame(bottom))
  }, [page, activeConversation?.id])
  useLayoutEffect(() => {
    const lock = streamScrollLockRef.current
    const list = messageListRef.current
    if (!lock || !list) return
    const restore = () => {
      if (streamScrollLockRef.current?.version === lock.version) list.scrollTop = lock.top
    }
    restore()
    window.requestAnimationFrame(() => {
      restore()
      window.requestAnimationFrame(restore)
    })
    const timer = window.setTimeout(restore, 80)
    return () => window.clearTimeout(timer)
  }, [messages])

  const pageTitle = useMemo(() => page === 'home' ? '惟境' : page === 'characters' ? '角色' : '', [page])
  const navigate = (target: Page, reopenDrawer?: Drawer) => {
    setHistory((current) => [...current, { page, reopenDrawer }])
    setDrawer(null)
    setConversationMenuId(null)
    setPage(target)
  }
  const replacePage = (target: Page) => {
    setDrawer(null)
    setConversationMenuId(null)
    setPage(target)
  }
  const goHome = () => {
    setHistory([])
    replacePage('home')
  }
  const goBack = () => {
    const previous = history[history.length - 1]
    if (!previous) { goHome(); return }
    setHistory((current) => current.slice(0, -1))
    setPage(previous.page)
    setDrawer(previous.reopenDrawer || null)
    setConversationMenuId(null)
  }

  const abortConversation = (conversationId: string) => {
    generationControllers.current.get(conversationId)?.abort()
    generationControllers.current.delete(conversationId)
    setGeneratingIds((current) => current.filter((id) => id !== conversationId))
  }

  const resetApiConnection = () => {
    setConnection('idle')
    setConnectionMessage('配置已修改，请重新测试')
  }
  const updateApiChannel = (next: ApiChannel) => setApiChannels((current) => current.map((item) => item.id === next.id ? next : item))
  const selectApiChannel = (id: string) => {
    setActiveApiId(id)
    setConnection('idle')
    setConnectionMessage('已切换渠道，请测试连接')
    setChatError('')
  }
  const addApiChannel = (seed?: Partial<ApiChannel>) => {
    const channel = { ...createApiChannel(apiChannels.length + 1), ...seed }
    setApiChannels((current) => [...current, channel])
    selectApiChannel(channel.id)
  }
  const deleteApiChannel = (id: string) => {
    if (apiChannels.length <= 1 || !window.confirm(`删除 API 渠道“${api.name}”？`)) return
    const next = apiChannels.filter((item) => item.id !== id)
    setApiChannels(next)
    selectApiChannel(next[0].id)
  }

  const updateMemoryConfig = (patch: Partial<MemoryConfig>) => setMemoryConfigs((current) => ({ ...current, [activeCharacter.id]: { ...(current[activeCharacter.id] || defaultMemoryConfig()), ...patch } }))
  const updateMemoryApi = (patch: Partial<ApiConfig>) => updateMemoryConfig({ api: { ...currentMemoryConfig.api, ...patch } })
  const openCharacter = (id: string) => {
    setActiveId(id)
    setMemoryConfigs((current) => current[id] ? current : { ...current, [id]: defaultMemoryConfig() })
    setMemoryEntries((current) => current[id] ? current : { ...current, [id]: [] })
    navigate('character-detail')
  }
  const createCharacter = () => {
    if (!newCharacter.name.trim()) return
    const character = { ...createBlankCharacter(newCharacter), avatar: newCharacter.avatar || undefined }
    const conversation = { ...createConversation(character), personaId: activePersonaId }
    setCharacters((current) => [...current, character])
    setConversations((current) => [...current, conversation])
    setActiveConversationId(conversation.id)
    setMemoryConfigs((current) => ({ ...current, [character.id]: defaultMemoryConfig() }))
    setMemoryEntries((current) => ({ ...current, [character.id]: [] }))
    setActiveId(character.id)
    setNewCharacter({ name: '', tagline: '', description: '', greeting: '', tags: '', avatar: '' })
    replacePage('character-detail')
  }

  const createGroupConversation = () => {
    if (groupDraft.participantIds.length < 2) { window.alert('群聊至少选择两个角色。'); return }
    const now = Date.now()
    const participants = groupDraft.participantIds.map((id) => characters.find((item) => item.id === id)).filter(Boolean) as Character[]
    const conversation: Conversation = {
      id: `group-${now}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'group', characterId: participants[0].id,
      participantIds: participants.map((item) => item.id),
      participantApiIds: Object.fromEntries(participants.map((item) => [item.id, groupDraft.apiIds[item.id] || api.id])),
      title: groupDraft.title.trim() || participants.map((item) => item.name).join('、'),
      messages: [], createdAt: now, updatedAt: now, personaId: activePersonaId,
    }
    setConversations((current) => [...current, conversation])
    setActiveId(participants[0].id); setActiveConversationId(conversation.id)
    setGroupDraft({ title: '', participantIds: [], apiIds: {} }); setGroupReplyMode('natural')
    replacePage('chat')
  }

  const conversationMemberIds = (conversation = activeConversation) => conversation?.kind === 'group' ? (conversation.participantIds || []) : conversation ? [conversation.characterId] : []
  const addConversationMember = (characterId: string) => {
    if (!activeConversation || conversationMemberIds().includes(characterId)) return
    const participantIds = [...conversationMemberIds(), characterId]
    setConversations((current) => current.map((item) => item.id === activeConversation.id ? {
      ...item,
      kind: 'group',
      participantIds,
      participantApiIds: { ...(item.participantApiIds || {}), [item.characterId]: item.participantApiIds?.[item.characterId] || api.id, [characterId]: api.id },
      title: item.kind === 'group' ? item.title : participantIds.map((id) => characters.find((character) => character.id === id)?.name).filter(Boolean).join('、'),
      updatedAt: Date.now(),
    } : item))
    setGroupReplyMode('natural')
  }
  const removeConversationMember = (characterId: string) => {
    if (!activeConversation) return
    const remaining = conversationMemberIds().filter((id) => id !== characterId)
    if (!remaining.length) return
    setConversations((current) => current.map((item) => {
      if (item.id !== activeConversation.id) return item
      const participantApiIds = { ...(item.participantApiIds || {}) }; delete participantApiIds[characterId]
      if (remaining.length === 1) return { ...item, kind: 'single', characterId: remaining[0], participantIds: undefined, participantApiIds: undefined, title: `与${characters.find((character) => character.id === remaining[0])?.name || '角色'}的对话`, updatedAt: Date.now() }
      return { ...item, characterId: remaining[0], participantIds: remaining, participantApiIds, updatedAt: Date.now() }
    }))
    setActiveId(remaining[0])
  }
  const updateConversationMemberApi = (characterId: string, channelId: string) => {
    if (!activeConversation) return
    setConversations((current) => current.map((item) => item.id === activeConversation.id ? { ...item, participantApiIds: { ...(item.participantApiIds || {}), [characterId]: channelId } } : item))
  }

  const addImportedCharacter = (character: Character, nextPage: Page = 'character-detail') => {
    setCharacters((current) => [...current.filter((item) => item.id !== character.id), character])
    setActiveConversationId('')
    setMemoryConfigs((current) => ({ ...current, [character.id]: defaultMemoryConfig() }))
    setMemoryEntries((current) => ({ ...current, [character.id]: [] }))
    setActiveId(character.id)
    replacePage(nextPage)
  }

  const handleCharacterFile = async (file?: File) => {
    if (!file) return
    setImportState('reading')
    setImportError('')
    try {
      setPendingImport(await importCharacterCard(file))
      navigate('import-preview')
      setImportState('idle')
    } catch (error) {
      setImportState('error')
      setImportError(error instanceof Error ? error.message : '角色卡导入失败')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleCharacterUrl = async () => {
    const url = characterUrl.trim()
    if (!url) return
    setImportState('reading')
    setImportError('')
    try {
      const parsed = new URL(url)
      if (!/^https?:$/.test(parsed.protocol)) throw new Error('请填写 http 或 https 角色卡地址')
      const response = await fetch(parsed.toString(), { mode: 'cors' })
      if (!response.ok) throw new Error(`下载失败（${response.status}）`)
      const blob = await response.blob()
      const pathname = decodeURIComponent(parsed.pathname)
      const extension = blob.type.includes('json') || pathname.toLowerCase().endsWith('.json') ? '.json' : '.png'
      const filename = pathname.split('/').filter(Boolean).pop() || `角色卡${extension}`
      const file = new File([blob], filename.includes('.') ? filename : `${filename}${extension}`, { type: blob.type || (extension === '.json' ? 'application/json' : 'image/png') })
      setPendingImport(await importCharacterCard(file))
      setCharacterUrl('')
      navigate('import-preview')
      setImportState('idle')
    } catch (error) {
      setImportState('error')
      const message = error instanceof TypeError ? '该网址禁止跨域读取，请下载角色卡后用文件导入' : error instanceof Error ? error.message : 'URL 角色卡导入失败'
      setImportError(message)
    }
  }

  const updateActiveCharacter = (next: Character) => setCharacters((current) => current.map((item) => item.id === next.id ? next : item))
  const duplicateCharacter = (character: Character) => {
    const copy = structuredClone(character)
    copy.id = crypto.randomUUID()
    copy.name = `${character.name} · 副本`
    copy.sourceFileName = undefined
    setCharacters((current) => [...current, copy])
    setMemoryConfigs((current) => ({ ...current, [copy.id]: defaultMemoryConfig() }))
    setMemoryEntries((current) => ({ ...current, [copy.id]: [] }))
    setCharacterMenuId(null)
  }
  const deleteCharacter = (character: Character) => {
    if (characters.length <= 1) { window.alert('至少保留一个角色。'); return }
    if (!window.confirm(`删除角色“${character.name}”以及他的全部会话和记忆？`)) return
    conversations.filter((item) => item.characterId === character.id || item.participantIds?.includes(character.id)).forEach((item) => abortConversation(item.id))
    const nextCharacters = characters.filter((item) => item.id !== character.id)
    const nextConversations = conversations.filter((item) => item.characterId !== character.id && !item.participantIds?.includes(character.id))
    setCharacters(nextCharacters)
    setConversations(nextConversations)
    setMemoryConfigs((current) => { const next = { ...current }; delete next[character.id]; return next })
    setMemoryEntries((current) => { const next = { ...current }; delete next[character.id]; return next })
    setCharacterMenuId(null)
    if (activeId === character.id) {
      const nextCharacter = nextCharacters[0]
      const nextConversation = nextConversations.filter((item) => item.characterId === nextCharacter.id).sort((a, b) => b.updatedAt - a.updatedAt)[0]
      setActiveId(nextCharacter.id)
      setActiveConversationId(nextConversation?.id || '')
    }
  }
  const exportCharacter = (character: Character) => {
    downloadJson(`${character.name}-character-card-v3.json`, exportableCharacter(character))
    setCharacterMenuId(null)
  }
  const newSession = () => navigate('greeting-picker')
  const beginWithGreeting = (greeting: string) => {
    if (restartingConversationId) {
      const id = restartingConversationId
      setConversations((current) => current.map((item) => item.id === id ? { ...item, messages: [{ id: Date.now(), role: 'assistant', text: greeting }], updatedAt: Date.now() } : item))
      setActiveConversationId(id)
      setRestartingConversationId(null)
    } else {
      const conversation = { ...createConversation(activeCharacter, greeting), personaId: activePersonaId }
      setConversations((current) => [...current, conversation])
      setActiveConversationId(conversation.id)
    }
    replacePage('chat')
  }

  const continueConversation = (character = activeCharacter) => {
    let conversation = conversations.filter((item) => item.characterId === character.id).sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (!conversation) {
      conversation = { ...createConversation(character), personaId: activePersonaId }
      setConversations((current) => [...current, conversation!])
    }
    setActiveId(character.id)
    setActiveConversationId(conversation.id)
    navigate('chat')
  }

  const openConversation = (conversation: Conversation) => {
    setActiveConversationId(conversation.id)
    setActiveId(conversation.participantIds?.[0] || conversation.characterId)
    setDrawer(null)
    setConversationMenuId(null)
    if (page !== 'chat') navigate('chat')
  }

  const updateIdentity = (patch: Partial<UserIdentity>) => {
    setIdentities((current) => current.map((item) => item.id === identity.id ? { ...item, ...patch, id: item.id } : item))
  }
  const selectIdentity = (id: string) => {
    setActivePersonaId(id)
    if (activeConversation) {
      setConversations((current) => current.map((item) => item.id === activeConversation.id ? { ...item, personaId: id, updatedAt: Date.now() } : item))
    }
  }
  const addIdentity = () => {
    const next: UserIdentity = { id: crypto.randomUUID(), name: `新身份 ${identities.length + 1}`, description: '填写这个用户角色的人设、背景、关系与行为边界。' }
    setIdentities((current) => [...current, next])
    selectIdentity(next.id)
  }
  const deleteIdentity = (id: string) => {
    if (identities.length <= 1) { window.alert('至少保留一个用户身份。'); return }
    const target = identities.find((item) => item.id === id)
    if (!window.confirm(`删除用户身份“${target?.name || '未命名'}”？`)) return
    const next = identities.filter((item) => item.id !== id)
    const fallbackId = next[0].id
    setIdentities(next)
    setActivePersonaId(fallbackId)
    setConversations((current) => current.map((item) => item.personaId === id ? { ...item, personaId: fallbackId } : item))
  }

  const renameConversation = (conversation: Conversation) => {
    const title = window.prompt('给这段对话重新命名', conversation.title)?.trim()
    if (!title) return
    setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, title, updatedAt: Date.now() } : item))
    setConversationMenuId(null)
  }

  const restartConversation = (conversation: Conversation) => {
    abortConversation(conversation.id)
    if (conversation.kind === 'group') {
      if (!window.confirm('清空这段群聊并重新开始？')) return
      setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, messages: [], contextSummary: '', compressedUntil: 0, updatedAt: Date.now() } : item))
      setActiveConversationId(conversation.id); setConversationMenuId(null); setDrawer(null); replacePage('chat'); return
    }
    const character = characters.find((item) => item.id === conversation.characterId) || demoCharacter
    setActiveId(character.id)
    setActiveConversationId(conversation.id)
    setRestartingConversationId(conversation.id)
    setConversationMenuId(null)
    setDrawer(null)
    replacePage('greeting-picker')
  }

  const cloneConversation = (conversation: Conversation) => {
    const copy: Conversation = { ...conversation, id: `${conversation.characterId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: `${conversation.title} · 副本`, messages: conversation.messages.map((message) => ({ ...message })), createdAt: Date.now(), updatedAt: Date.now() }
    setConversations((current) => [...current, copy])
    setActiveId(copy.characterId)
    setActiveConversationId(copy.id)
    setConversationMenuId(null)
    setDrawer(null)
    replacePage('chat')
  }

  const deleteConversation = (conversation: Conversation) => {
    if (!window.confirm(`删除“${conversation.title}”？此操作只删除这段对话。`)) return
    abortConversation(conversation.id)
    const remaining = conversations.filter((item) => item.id !== conversation.id)
    setConversations(remaining)
    setConversationMenuId(null)
    if (activeConversation?.id === conversation.id) {
      const next = remaining.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (next) {
        setActiveId(next.participantIds?.[0] || next.characterId)
        setActiveConversationId(next.id)
      } else {
        setActiveConversationId('')
        goHome()
      }
    }
  }

  const summarizeMemory = async (sourceMessages = messages, targetConversation = activeConversation, targetCharacter = activeCharacter) => {
    const config = memoryConfigs[targetCharacter.id] || defaultMemoryConfig()
    const summarizedCount = Math.min(targetConversation?.memorySummarizedCount || 0, sourceMessages.length)
    const pendingMessages = sourceMessages.slice(summarizedCount)
    if (!targetConversation || !config.api.baseUrl || !config.api.modelName || !config.api.apiKey || pendingMessages.length < 2) { setMemoryState('error'); return }
    setMemoryState('summarizing')
    const scopeId = targetConversation.id
    const transcript = pendingMessages.map((item) => `${item.role === 'user' ? identity.name : characters.find((character) => character.id === item.characterId)?.name || targetCharacter.name}：${item.text}`).join('\n')
    const conversationMemories = memoriesForConversation(memoryEntries, scopeId, targetCharacter.id) as MemoryEntry[]
    const previous = [...conversationMemories.filter((item) => item.pinned), ...conversationMemories.filter((item) => !item.pinned).slice(-6)].map((item) => item.content).join('\n\n').slice(-12000)
    try {
      const endpoint = `${config.api.baseUrl.replace(/\/$/, '')}/chat/completions`
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.api.apiKey}` },
        body: JSON.stringify({
          model: config.api.modelName,
          temperature: 0.2,
          messages: [
            { role: 'system', content: config.summaryPrompt },
            { role: 'user', content: `角色：${targetCharacter.name}\n用户：${identity.name}\n已有长期记忆（仅供查重）：\n${previous || '暂无'}\n\n本次新增对话（只总结这一段）：\n${transcript}` },
          ],
        }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content?.trim()
      if (!content) throw new Error('empty memory')
      const entry: MemoryEntry = { id: crypto.randomUUID(), createdAt: Date.now(), title: `${new Date().toLocaleDateString()} · 新增 ${pendingMessages.length} 条`, content, sourceCount: pendingMessages.length }
      let nextEntries = [...conversationMemories.filter((item) => item.pinned), ...[...conversationMemories.filter((item) => !item.pinned), entry].slice(-config.maxEntries)]
      const ordinary = nextEntries.filter((item) => !item.pinned)
      if (ordinary.length >= 12) {
        try {
          const consolidationResponse = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.api.apiKey}` },
            body: JSON.stringify({
              model: config.api.modelName,
              temperature: 0.1,
              messages: [
                { role: 'system', content: '你是长期记忆整理器。把多份剧情记忆合并成一份完整、无重复、按时间顺序的事实档案。必须保留关系变化、承诺、冲突、关键事件、重要物品、当前状态和未完成事项；新事实明确推翻旧事实时保留最新状态并注明变化。不得续写或虚构。' },
                { role: 'user', content: ordinary.map((item, index) => `【记忆 ${index + 1}】\n${item.content}`).join('\n\n').slice(-24000) },
              ],
            }),
          })
          if (consolidationResponse.ok) {
            const consolidationData = await consolidationResponse.json()
            const consolidated = consolidationData?.choices?.[0]?.message?.content?.trim()
            if (consolidated) nextEntries = [...nextEntries.filter((item) => item.pinned), { id: crypto.randomUUID(), createdAt: Date.now(), title: `${new Date().toLocaleDateString()} · 阶段记忆整理`, content: consolidated, sourceCount: ordinary.reduce((sum, item) => sum + item.sourceCount, 0), consolidated: true }]
          }
        } catch (error) { console.warn('自动整理长期记忆失败，保留原记忆', error) }
      }
      setMemoryEntries((current) => ({ ...current, [scopeId]: nextEntries }))
      setConversations((current) => current.map((item) => item.id === targetConversation.id ? { ...item, memorySummarizedCount: sourceMessages.length } : item))
      setMemoryState('ok')
    } catch (error) {
      console.error('记忆总结失败', error)
      setMemoryState('error')
    }
  }

  const generateAssistant = async (conversation: Conversation, nextMessages: Message[], speaker = activeCharacter, speakerApi = api): Promise<Message[]> => {
    if (!speakerApi.baseUrl.trim() || !speakerApi.apiKey.trim() || !speakerApi.modelName.trim()) {
      setChatError(`请先为 ${speaker.name} 配置完整的 API 渠道。`)
      return nextMessages
    }
    const conversationId = conversation.id
    if (generationControllers.current.has(conversationId)) return nextMessages

    const capturedCharacter = speaker
    const capturedMemoryConfig = memoryConfigs[capturedCharacter.id] || defaultMemoryConfig()
    const capturedMemories = memoriesForConversation(memoryEntries, conversation.id, capturedCharacter.id) as MemoryEntry[]
    const assistantMessage: Message = { id: Date.now() + Math.floor(Math.random() * 1000), role: 'assistant', characterId: speaker.id, text: '正在回应…' }
    const pendingMessages = [...nextMessages, assistantMessage]
    setConversations((current) => {
      const exists = current.some((item) => item.id === conversationId)
      if (!exists) return [...current, { ...conversation!, messages: pendingMessages, updatedAt: Date.now() }]
      return current.map((item) => item.id === conversationId ? { ...item, messages: pendingMessages, updatedAt: Date.now() } : item)
    })
    setChatError('')

    const controller = new AbortController()
    generationControllers.current.set(conversationId, controller)
    setGeneratingIds((current) => [...current.filter((id) => id !== conversationId), conversationId])
    let output = ''

    try {
      const isGroup = conversation.kind === 'group'
      const groupNames = (conversation.participantIds || []).map((id) => characters.find((item) => item.id === id)?.name).filter(Boolean)
      const promptMessages = buildChatPrompt({
        character: capturedCharacter,
        user: identity,
        messages: nextMessages.map((message) => ({ ...message, text: message.role === 'assistant' && isGroup ? `【${characters.find((item) => item.id === message.characterId)?.name || '其他角色'}】\n${message.text}` : message.text })),
        preset: [enabledPresetText(presetSections), isGroup && `【群聊发言边界｜最高优先级】\n本轮你只能扮演 ${speaker.name}。群聊成员为：${groupNames.join('、')}。不得替用户发言、行动或思考；不得代替其他群聊角色说话、行动或决定。你可以观察并回应其他成员，但本轮输出只能属于 ${speaker.name}。`].filter(Boolean).join('\n\n'),
        globalWorldbook: worldbook,
        memory: { entries: capturedMemories, injectPosition: capturedMemoryConfig.injectPosition, injectPrompt: capturedMemoryConfig.injectPrompt },
        memoryLength,
        contextSummary: conversation.contextSummary,
      })
      const completion = await completeChat({
        api: speakerApi,
        messages: promptMessages,
        temperature,
        topP,
        maxTokens,
        streaming,
        signal: controller.signal,
        onDelta: (delta) => {
          const list = messageListRef.current
          if (list) streamScrollLockRef.current = { top: list.scrollTop, version: (streamScrollLockRef.current?.version || 0) + 1 }
          output += delta
          const visibleOutput = sanitizeAssistantOutput(output)
          setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, messages: item.messages.map((message) => message.id === assistantMessage.id ? { ...message, text: visibleOutput || '正在整理回复…' } : message), updatedAt: Date.now() } : item))
        },
      })
      if (!output.trim()) throw new Error('模型没有返回内容')
      if (completion.finishReason) {
        setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, messages: item.messages.map((message) => message.id === assistantMessage.id ? { ...message, finishReason: completion.finishReason } : message) } : item))
      }

      const cleanOutput = sanitizeAssistantOutput(output) || output
      setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, messages: item.messages.map((message) => message.id === assistantMessage.id ? { ...message, text: cleanOutput } : message), updatedAt: Date.now() } : item))
      const completed = [...nextMessages, { ...assistantMessage, text: cleanOutput }]
      const summarizedCount = Math.min(conversation.memorySummarizedCount || 0, completed.length)
      if (!isGroup && capturedMemoryConfig.autoEvery > 0 && completed.length - summarizedCount >= capturedMemoryConfig.autoEvery && capturedMemoryConfig.api.apiKey) summarizeMemory(completed, conversation, capturedCharacter)
      return completed
    } catch (error) {
      if (controller.signal.aborted) {
        setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, messages: item.messages.map((message) => message.id === assistantMessage.id ? { ...message, text: sanitizeAssistantOutput(output) || '已停止生成。' } : message) } : item))
      } else {
        const message = error instanceof Error ? error.message : '聊天请求失败'
        setChatError(message)
        setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, messages: item.messages.map((entry) => entry.id === assistantMessage.id ? { ...entry, text: `请求失败：${message}` } : entry) } : item))
      }
      return [...nextMessages, { ...assistantMessage, text: sanitizeAssistantOutput(output) || (controller.signal.aborted ? '已停止生成。' : '生成失败。') }]
    } finally {
      if (generationControllers.current.get(conversationId) === controller) {
        generationControllers.current.delete(conversationId)
        setGeneratingIds((current) => current.filter((id) => id !== conversationId))
      }
      window.setTimeout(() => { streamScrollLockRef.current = null }, 120)
    }
  }

  const sendMessage = async (textOverride?: string, historyOverride?: Message[]) => {
    const text = (textOverride ?? draft).trim(); if (!text) return
    let conversation = activeConversation
    if (!conversation) {
      conversation = { ...createConversation(activeCharacter), personaId: activePersonaId }
      setConversations((current) => [...current, conversation!])
      setActiveConversationId(conversation.id)
    }
    const userMessage = { id: Date.now(), role: 'user' as const, text }
    setDraft('')
    const baseMessages: Message[] = [...(historyOverride ?? messages), userMessage]
    if (conversation.kind === 'group') {
      setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, messages: baseMessages, updatedAt: Date.now() } : item))
      const participantIds = conversation.participantIds || []
      const mentionedIds = participantIds.filter((id) => {
        const name = characters.find((item) => item.id === id)?.name
        return Boolean(name && (text.includes(`@${name}`) || text.includes(`＠${name}`)))
      })
      const lastSpeakerId = [...baseMessages].reverse().find((item) => item.role === 'assistant')?.characterId
      const availableIds = participantIds.filter((id) => id !== lastSpeakerId)
      let speakerIds: string[] = []
      if (groupReplyMode === 'all') speakerIds = participantIds
      else if (groupReplyMode === 'specified') speakerIds = mentionedIds
      else if (mentionedIds.length) speakerIds = groupReplyMode === 'natural' ? mentionedIds.slice(0, 1) : mentionedIds
      else {
        const pool = availableIds.length ? availableIds : participantIds
        const first = pool[Math.floor(Math.random() * Math.max(1, pool.length))]
        speakerIds = first ? [first] : []
        if (groupReplyMode === 'contextual' && /你们|大家|两人|所有人|一起|分别/.test(text)) {
          const second = participantIds.find((id) => id !== first)
          if (second) speakerIds.push(second)
        }
      }
      if (!speakerIds.length) {
        setChatError('指定发言模式需要在消息里写 @角色名，例如“@顾荒 你怎么看？”')
        return
      }
      setChatError('')
      let groupMessages = baseMessages
      for (const speakerId of speakerIds) {
        const speaker = characters.find((item) => item.id === speakerId)
        if (!speaker) continue
        const channelId = conversation.participantApiIds?.[speakerId]
        const channel = apiChannels.find((item) => item.id === channelId) || api
        groupMessages = await generateAssistant(conversation, groupMessages, speaker, channel)
      }
      const memoryCharacter = characters.find((item) => item.id === participantIds[0]) || activeCharacter
      const groupMemoryConfig = memoryConfigs[memoryCharacter.id] || defaultMemoryConfig()
      const summarizedCount = Math.min(conversation.memorySummarizedCount || 0, groupMessages.length)
      if (groupMemoryConfig.autoEvery > 0 && groupMessages.length - summarizedCount >= groupMemoryConfig.autoEvery && groupMemoryConfig.api.apiKey) void summarizeMemory(groupMessages, conversation, memoryCharacter)
      return
    }
    await generateAssistant(conversation, baseMessages)
  }

  const insertGroupMention = (name: string) => {
    setDraft((current) => /[@＠][^@＠\s]*$/.test(current) ? current.replace(/[@＠][^@＠\s]*$/, `@${name} `) : `${current}${current && !/\s$/.test(current) ? ' ' : ''}@${name} `)
    setMentionPickerOpen(false)
    window.requestAnimationFrame(() => composerRef.current?.focus())
  }

  const copyMessage = async (message: Message) => {
    try { await navigator.clipboard.writeText(message.text) } catch {
      const area = document.createElement('textarea'); area.value = message.text; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove()
    }
    setMessageMenuId(null)
  }

  const editAssistantMessage = (message: Message) => {
    const text = window.prompt('改写这条模型消息', message.text)
    if (text === null || !activeConversation) return
    setConversations((current) => current.map((item) => item.id === activeConversation.id ? { ...item, messages: item.messages.map((entry) => entry.id === message.id ? { ...entry, text, finishReason: null } : entry), updatedAt: Date.now() } : item))
    setMessageMenuId(null)
  }

  const withdrawMessage = (message: Message) => {
    if (!activeConversation || !window.confirm('撤回这条模型消息？')) return
    setConversations((current) => current.map((item) => item.id === activeConversation.id ? { ...item, messages: item.messages.filter((entry) => entry.id !== message.id), updatedAt: Date.now() } : item))
    setMessageMenuId(null)
  }

  const regenerateMessage = async (message: Message) => {
    if (!activeConversation || isGenerating) return
    const index = messages.findIndex((entry) => entry.id === message.id)
    if (index < 0) return
    setMessageMenuId(null)
    const speaker = characters.find((item) => item.id === message.characterId) || activeCharacter
    const channel = activeConversation.kind === 'group' ? apiChannels.find((item) => item.id === activeConversation.participantApiIds?.[speaker.id]) || api : api
    await generateAssistant(activeConversation, messages.slice(0, index), speaker, channel)
  }

  const editAndResendUserMessage = async (message: Message) => {
    if (!activeConversation || isGenerating) return
    const text = window.prompt('编辑后重新发送', message.text)?.trim()
    if (!text) return
    const index = messages.findIndex((entry) => entry.id === message.id)
    if (index < 0) return
    setMessageMenuId(null)
    await sendMessage(text, messages.slice(0, index))
  }

  const exportConversationTxt = () => {
    if (!activeConversation) return
    const body = messages.map((message) => `${message.role === 'user' ? identity.name : characters.find((item) => item.id === message.characterId)?.name || activeCharacter.name}\n${message.text}`).join('\n\n--------------------\n\n')
    const participantNames = activeConversation.kind === 'group' ? (activeConversation.participantIds || []).map((id) => characters.find((item) => item.id === id)?.name).filter(Boolean).join('、') : activeCharacter.name
    const blob = new Blob([`${activeConversation.title}\n角色：${participantNames}\n用户：${identity.name}\n导出时间：${new Date().toLocaleString()}\n\n${body}`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${activeConversation.title.replace(/[\\/:*?"<>|]/g, '_')}.txt`; anchor.click(); URL.revokeObjectURL(url)
    setDrawer(null)
  }

  const compressOldContext = async () => {
    if (!activeConversation || compressingContext || messages.length < 16) return
    if (!api.apiKey || !api.baseUrl || !api.modelName) { setChatError('请先配置当前聊天 API，再压缩上下文。'); return }
    const keepRecent = Math.max(10, Math.floor(memoryLength / 2))
    const oldMessages = messages.slice(0, Math.max(0, messages.length - keepRecent))
    if (oldMessages.length < 6) return
    setCompressingContext(true); setDrawer(null); let summary = ''
    try {
      const controller = new AbortController()
      await completeChat({
        api, temperature: .2, topP: 1, maxTokens: Math.min(3000, maxTokens), streaming: false,
        signal: controller.signal,
        messages: [
          { role: 'system', content: '你是剧情上下文压缩器。只总结已经发生的事实，保留时间、地点、人物关系、承诺、冲突、情绪转折、重要物品、未完成事项和角色状态。不得续写剧情，不得虚构，不得省略影响后续扮演的信息。' },
          { role: 'user', content: `${activeConversation.contextSummary ? `此前摘要：\n${activeConversation.contextSummary}\n\n` : ''}待压缩对话：\n${oldMessages.map((item) => `${item.role === 'user' ? identity.name : characters.find((character) => character.id === item.characterId)?.name || activeCharacter.name}：${item.text}`).join('\n\n')}` },
        ],
        onDelta: (delta) => { summary += delta },
      })
      if (!summary.trim()) throw new Error('模型没有生成摘要')
      setConversations((current) => current.map((item) => item.id === activeConversation.id ? { ...item, contextSummary: summary.trim(), compressedUntil: oldMessages.length, updatedAt: Date.now() } : item))
    } catch (error) { setChatError(error instanceof Error ? error.message : '上下文压缩失败') }
    finally { setCompressingContext(false) }
  }

  const updateChatJump = () => {
    const list = messageListRef.current; if (!list) return
    const header = phoneCanvasRef.current?.querySelector<HTMLElement>('.chat-header')
    const previousTop = lastChatScrollTopRef.current
    if (header) {
      const movingDown = list.scrollTop > previousTop + 3
      const movingUp = list.scrollTop < previousTop - 3
      if (list.scrollTop < 24 || movingUp) {
        header.style.transform = 'translateY(0)'
        header.style.opacity = '1'
        header.style.pointerEvents = 'auto'
      } else if (movingDown) {
        header.style.transform = 'translateY(calc(-100% - 18px))'
        header.style.opacity = '0'
        header.style.pointerEvents = 'none'
      }
    }
    lastChatScrollTopRef.current = list.scrollTop
    const distanceToBottom = list.scrollHeight - list.scrollTop - list.clientHeight
    setChatJump({ up: list.scrollTop > 280, down: distanceToBottom > 280 })
  }

  const jumpChat = (edge: 'top' | 'bottom') => {
    const list = messageListRef.current; if (!list) return
    list.scrollTo({ top: edge === 'top' ? 0 : list.scrollHeight, behavior: 'smooth' })
  }

  const testConnection = async () => {
    setConnection('testing')
    setConnectionMessage('正在请求模型列表…')
    try {
      await testApiConnection(api)
      setConnection('ok')
      setConnectionMessage('连接正常，密钥与地址可用')
      setChatError('')
    } catch (error) {
      setConnection('error')
      setConnectionMessage(error instanceof Error ? error.message : '连接测试失败')
    }
  }

  const CharacterPortrait = ({ item, large = false }: { item: Character; large?: boolean }) => <div className={large ? 'hero-portrait' : 'character-art'}>{item.avatar ? <img src={item.avatar} alt="" /> : <><span>{item.name.slice(-1)}</span><i>✦</i></>}</div>
  const CharacterCard = ({ item }: { item: Character }) => <div className="character-card-shell"><button className="character-card" onClick={() => openCharacter(item.id)}><CharacterPortrait item={item} /><div className="character-copy"><div className="character-title"><strong>{item.name}</strong><span>{item.id === activeId ? '最近共演' : item.cardSpecVersion ? `Card ${item.cardSpecVersion}` : '角色卡'}</span></div><p>{item.tagline}</p><small>“{item.greeting}”</small></div></button><button className="character-card-more" aria-label={`管理${item.name}`} onClick={() => setCharacterMenuId(item.id)}>•••</button></div>
  const sortedConversations = conversations.slice().sort((a, b) => b.updatedAt - a.updatedAt)
  const menuConversation = conversations.find((item) => item.id === conversationMenuId)
  const menuMessage = messages.find((item) => item.id === messageMenuId)
  const menuCharacter = characters.find((item) => item.id === characterMenuId)
  const groupParticipants = activeConversation?.kind === 'group' ? (activeConversation.participantIds || []).map((id) => characters.find((item) => item.id === id)).filter(Boolean) as Character[] : []
  const resolveMessageCharacter = (message: Message) => characters.find((item) => item.id === message.characterId) || activeCharacter
  const filteredCharacters = characters.filter((item) => {
    const query = characterQuery.trim().toLocaleLowerCase()
    return !query || [item.name, item.tagline, item.creator, ...item.tags].some((value) => value.toLocaleLowerCase().includes(query))
  })
  const isGenerating = Boolean(activeConversation && generatingIds.includes(activeConversation.id))
  const renderChatMessage = (message: Message) => {
    const messageCharacter = resolveMessageCharacter(message)
    const isUser = message.role === 'user'
    const authorName = isUser ? identity.name : messageCharacter.name
    const avatar = isUser ? identity.avatar : messageCharacter.avatar
    const avatarNode = <div className="message-avatar">{avatar ? <img src={avatar} alt="" /> : authorName.slice(-1)}</div>
    let displayText = isUser && activeConversation?.kind === 'group' ? message.text.replace(/^(?:[@＠][^\s@＠]+\s*)+/, '').trim() : message.text
    if (!isUser && activeConversation?.kind === 'group') {
      const trimmed = displayText.trimStart()
      const labels = [`【${messageCharacter.name}】`, `[${messageCharacter.name}]`, `［${messageCharacter.name}］`]
      const label = labels.find((item) => trimmed.startsWith(item))
      if (label) displayText = trimmed.slice(label.length).trimStart()
    }
    if (isUser && !displayText) return null
    const content = <MessageContent text={displayText} role={message.role} character={messageCharacter} userName={identity.name} layout={chatLayout} />

    return <div key={message.id} className={`message-row ${message.role} message-layout-${chatLayout}`}>
      {chatLayout === 'flat' ? <div className="message-line message-line-flat">
        <div className="message-author">{avatarNode}<span>{authorName}</span></div>
        <div className="message-flat-body">{content}</div>
      </div> : <div className="message-line message-line-bubble">
        {avatarNode}
        <div className="message-bubble-column"><span className="message-bubble-author">{authorName}</span>{content}</div>
      </div>}
      <button className="message-action-trigger" aria-label="消息操作" onClick={() => setMessageMenuId(message.id)}>•••</button>
      {message.role === 'assistant' && (message.finishReason === 'length' || message.finishReason === 'max_tokens') && <button className="message-continue" onClick={() => setDraft('请紧接上一句，从中断处继续，不要重复已经说过的内容。')}>回复达到上限 · 点此续写</button>}
      {message.role === 'assistant' && message.finishReason === 'content_filter' && <span className="message-finish-note">接口因内容过滤提前结束</span>}
    </div>
  }

  return <div className="app-shell"><main ref={phoneCanvasRef} className={`phone-canvas theme-${chatTheme} ${page === 'chat' ? 'chat-canvas' : ''}`} style={{ '--chat-font-size': `${chatFontSize}px`, '--chat-text-color': chatTextColor, '--chat-narration-color': chatNarrationColor, '--chat-quote-color': chatQuoteColor, '--chat-base-color': chatBaseColor } as React.CSSProperties}>
    <input ref={fileInputRef} className="hidden-file-input" type="file" accept="image/png,.png,application/json,.json" onChange={(event) => handleCharacterFile(event.target.files?.[0])} />
    {page === 'chat' && <div className="chat-background" style={{ backgroundImage: chatBackground ? `url(${JSON.stringify(chatBackground)})` : undefined, '--chat-background-frost': chatBackgroundFrost } as React.CSSProperties} />}
    {page === 'home' && <section className="home-dashboard">
      <header className="home-heading"><p className="eyebrow">WeiWei Role</p><h1>{pageTitle}</h1><p>选择今天要进入的空间。</p></header>
      <div className="home-entrances">
        <button onClick={() => continueConversation()}><span className="home-icon">✦</span><strong>聊天</strong><small>{activeConversation ? `继续「${activeConversation.title}」` : '开始一段新的共演'}</small><i>›</i></button>
        <button onClick={() => navigate('characters')}><span className="home-icon">◉</span><strong>角色库</strong><small>导入、创建与管理角色</small><i>›</i></button>
        <button onClick={() => navigate('group-create')}><span className="home-icon">◎</span><strong>群聊共演</strong><small>多个角色 · 独立模型 · 共享剧情</small><i>›</i></button>
        <button onClick={() => navigate('more')}><span className="home-icon">⌘</span><strong>设置</strong><small>API、模型、身份与应用</small><i>›</i></button>
      </div>
    </section>}

    {page === 'characters' && <><BackHeader title="角色库" onBack={goBack} action={<button className="text-button" onClick={() => fileInputRef.current?.click()}>导入</button>} /><section className="content-stack"><div className="section-heading"><div><h2>全部角色</h2><p>支持 Tavern PNG · Card V2/V3</p></div><div className="library-actions"><button onClick={() => navigate('create')}>＋ 新建</button></div></div><div className="character-search"><span>⌕</span><input value={characterQuery} onChange={(event) => setCharacterQuery(event.target.value)} placeholder="搜索名字、作者或标签" />{characterQuery && <button onClick={() => setCharacterQuery('')}>×</button>}</div>{importState === 'reading' && <div className="import-notice">正在解析角色卡、世界书与正则…</div>}{importState === 'error' && <div className="import-notice error">{importError}</div>}{filteredCharacters.map((item) => <CharacterCard key={item.id} item={item} />)}{filteredCharacters.length === 0 && <div className="library-empty">没有找到匹配的角色。</div>}</section></>}

    {page === 'create' && <><BackHeader title="新建角色" onBack={goBack} action={<button className="text-button" onClick={createCharacter}>保存</button>} /><section className="content-stack form-stack"><button className="drop-zone compact" onClick={() => fileInputRef.current?.click()}><span className="drop-plus">＋</span><strong>{importState === 'reading' ? '正在读取角色卡…' : '从文件导入角色卡'}</strong><small>支持带元数据的 PNG 与 JSON</small></button><div className="url-import-card"><div><strong>从 URL 导入角色卡</strong><small>粘贴 PNG 或 JSON 角色卡直链</small></div><div><input type="url" value={characterUrl} onChange={(event) => setCharacterUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleCharacterUrl() } }} placeholder="https://…/character.png" /><button onClick={handleCharacterUrl} disabled={!characterUrl.trim() || importState === 'reading'}>{importState === 'reading' ? '读取中' : '导入'}</button></div></div>{importState === 'error' && <div className="import-notice error">{importError}</div>}<div className="form-divider"><span>或者手动创建</span></div><label className="avatar-upload-row"><span className="avatar-upload-preview">{newCharacter.avatar ? <img src={newCharacter.avatar} alt="" /> : '＋'}</span><span><strong>角色头像</strong><small>选择照片并自动裁成方形</small></span><input type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setNewCharacter({ ...newCharacter, avatar: await imageThumbnail(file) }); event.currentTarget.value = '' }} /></label><label>角色名称<input value={newCharacter.name} onChange={(e) => setNewCharacter({ ...newCharacter, name: e.target.value })} placeholder="例如：霍烬" /></label><label>一句话简介<input value={newCharacter.tagline} onChange={(e) => setNewCharacter({ ...newCharacter, tagline: e.target.value })} /></label><label>角色设定<textarea rows={7} value={newCharacter.description} onChange={(e) => setNewCharacter({ ...newCharacter, description: e.target.value })} /></label><label>开场白<textarea rows={4} value={newCharacter.greeting} onChange={(e) => setNewCharacter({ ...newCharacter, greeting: e.target.value })} /></label><label>标签<input value={newCharacter.tags} onChange={(e) => setNewCharacter({ ...newCharacter, tags: e.target.value })} placeholder="慢热，守护，剧情向" /></label><button className="primary-button full" onClick={createCharacter}>创建并保存</button></section></>}

    {page === 'group-create' && <><BackHeader title="新建群聊" onBack={goBack} action={<span className="saved-label">{groupDraft.participantIds.length} 位成员</span>} /><section className="content-stack group-create-page"><label className="group-title-field">群聊名称<input value={groupDraft.title} onChange={(event) => setGroupDraft({ ...groupDraft, title: event.target.value })} placeholder="例如：雨夜重逢" /></label><div className="privacy-note">选择至少两位角色。每位角色会使用自己的角色卡、世界书、美化和长期记忆，并可绑定不同 API 渠道。</div><div className="group-member-list">{characters.map((character) => { const selected = groupDraft.participantIds.includes(character.id); return <article className={selected ? 'selected' : ''} key={character.id}><button className="group-member-toggle" onClick={() => setGroupDraft((current) => ({ ...current, participantIds: selected ? current.participantIds.filter((id) => id !== character.id) : [...current.participantIds, character.id], apiIds: { ...current.apiIds, [character.id]: current.apiIds[character.id] || api.id } }))}><CharacterPortrait item={character} /><div><strong>{character.name}</strong><small>{character.tagline}</small></div><span>{selected ? '✓' : '＋'}</span></button>{selected && <label>API 渠道<select value={groupDraft.apiIds[character.id] || api.id} onChange={(event) => setGroupDraft((current) => ({ ...current, apiIds: { ...current.apiIds, [character.id]: event.target.value } }))}>{apiChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name} · {channel.modelName || '未选模型'}</option>)}</select></label>}</article> })}</div><button className="primary-button full" disabled={groupDraft.participantIds.length < 2} onClick={createGroupConversation}>创建群聊并进入</button></section></>}

    {page === 'import-preview' && pendingImport && <ImportPreview character={pendingImport} onCancel={() => { setPendingImport(null); goBack() }} onConfirm={({ includeBook, includeRegex }) => {
    const character = { ...pendingImport, characterBook: includeBook ? pendingImport.characterBook : undefined, regexScripts: includeRegex ? pendingImport.regexScripts : [] }
      setPendingImport(null)
      addImportedCharacter(character, 'greeting-picker')
    }} />}

    {page === 'character-detail' && <><BackHeader title={activeCharacter.name} onBack={goBack} /><section className="detail-stack"><div className="character-hero"><CharacterPortrait item={activeCharacter} large /><div><p className="eyebrow">{activeCharacter.cardSpecVersion ? `CHARACTER CARD ${activeCharacter.cardSpecVersion}` : 'CHARACTER'}</p><h2>{activeCharacter.name}</h2><p>{activeCharacter.tagline}</p></div></div><div className={`detail-card character-intro-card ${characterIntroExpanded ? 'expanded' : ''}`}><div className="detail-card-heading"><h3>角色简介</h3><button onClick={() => setCharacterIntroExpanded(!characterIntroExpanded)}>{characterIntroExpanded ? '收起⌃' : '展开⌄'}</button></div><p>{activeCharacter.description || '还没有填写角色简介。'}</p><div className="chips left">{activeCharacter.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div><button className="data-summary-card" onClick={() => navigate('card-data')}><div><strong>角色卡主体与开场白</strong><small>{activeCharacter.alternateGreetings.length + 1} 个开场 · Card {activeCharacter.cardSpecVersion || '本地'}</small></div><span>›</span></button><button className="data-summary-card compact" onClick={() => navigate('card-worldbook')}><div><strong>角色世界书</strong><small>{activeCharacter.characterBook?.entries.length || 0} 条 · 可编辑、启停和调整插入位置</small></div><span>›</span></button><button className="data-summary-card compact" onClick={() => navigate('card-regex')}><div><strong>角色正则与美化</strong><small>{activeCharacter.regexScripts.length} 条 · {activeCharacter.regexScripts.filter((script) => !script.disabled).length} 条启用</small></div><span>›</span></button><div className="detail-card"><h3>长期记忆</h3><p>这个角色拥有独立记忆库，目前保存 {currentMemories.length} 条记忆。</p><button className="inline-link" onClick={() => navigate('memory')}>管理记忆与总结模型 ›</button></div><div className="detail-card"><h3>开场白</h3><blockquote>{activeCharacter.greeting}</blockquote></div><div className="detail-actions"><button className="primary-button full" onClick={() => continueConversation()}>继续共演</button><button className="secondary-button" onClick={newSession}>选择开场并新建对话</button></div></section></>}

    {page === 'card-data' && <CharacterCardManager character={activeCharacter} onChange={updateActiveCharacter} onBack={goBack} />}
    {page === 'card-worldbook' && <CharacterCardManager character={activeCharacter} onChange={updateActiveCharacter} onBack={goBack} initialSection="worldbook" />}
    {page === 'card-regex' && <CharacterCardManager character={activeCharacter} onChange={updateActiveCharacter} onBack={goBack} initialSection="regex" />}

    {page === 'greeting-picker' && <GreetingPicker character={activeCharacter} userName={identity.name} onCancel={() => { const restarting = Boolean(restartingConversationId); setRestartingConversationId(null); restarting ? replacePage('chat') : goBack() }} onConfirm={beginWithGreeting} />}

    {page === 'chat' && <section className="chat-page"><header className="chat-header"><button className="icon-button drawer-trigger" aria-label="打开对话列表" onClick={() => setDrawer('left')}>☰</button><button className="chat-identity" onClick={() => navigate('character-detail')}>{activeCharacter.avatar ? <img src={activeCharacter.avatar} alt="" /> : <span>{activeCharacter.name.slice(-1)}</span>}<div><strong>{activeConversation?.kind === 'group' ? activeConversation.title : activeCharacter.name}</strong><small>{isGenerating ? '正在回应…' : activeConversation?.title || `${identity.name} · 沉浸共演中`}</small></div></button><button className="more-button" aria-label="打开聊天设置" onClick={() => setDrawer('right')}>•••</button></header>{chatError && <button className="chat-error" onClick={() => navigate('api')}><span>连接提示</span>{chatError}<i>前往 API 设置 ›</i></button>}<div ref={messageListRef} className="message-list" onScroll={updateChatJump}>{messages.map(renderChatMessage)}</div>{(chatJump.up || chatJump.down) && <nav className="chat-jump-controls" aria-label="快速浏览对话">{chatJump.up && <button onClick={() => jumpChat('top')} aria-label="回到对话顶部">↑</button>}{chatJump.down && <button onClick={() => jumpChat('bottom')} aria-label="跳到最新消息">↓</button>}</nav>}<div className="composer"><button className="composer-plus">＋</button><textarea ref={composerRef} rows={1} value={draft} onChange={(e) => { setDraft(e.target.value); if (activeConversation?.kind === 'group' && /[@＠][^@＠\s]*$/.test(e.target.value)) setMentionPickerOpen(true) }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!isGenerating) sendMessage() } }} placeholder={isGenerating ? '可以先写下一条，停止后再发送' : groupReplyMode === 'specified' && activeConversation?.kind === 'group' ? '输入 @ 选择回答的角色……' : '写下你的回应……'} /><button className={`send-button ${isGenerating ? 'stop' : ''}`} aria-label={isGenerating ? '停止生成' : '发送'} onClick={() => isGenerating && activeConversation ? abortConversation(activeConversation.id) : sendMessage()}>{isGenerating ? '■' : '↑'}</button></div></section>}

    {page === 'more' && <><BackHeader title="设置" onBack={goBack} /><section className="settings-stack compact-settings">{[[['API 连接', 'api'], ['用户身份', 'identity']], [['模型设置', 'model'], ['全局预设', 'preset'], ['全局世界书', 'worldbook'], ['长记忆', 'memory']], [['应用设置', 'settings']]].map((group, index) => <div className="settings-group" key={index}>{group.map(([label, target]) => <button key={label} onClick={() => navigate(target as Page)}><span>{label}</span><span>›</span></button>)}</div>)}</section></>}

    {page === 'api' && <ApiSettingsPage api={api} channels={apiChannels} connection={connection} connectionMessage={connectionMessage} onApiChange={updateApiChannel} onSelectChannel={selectApiChannel} onAddChannel={addApiChannel} onDeleteChannel={deleteApiChannel} onConnectionReset={resetApiConnection} onBack={goBack} onTest={testConnection} />}

    {page === 'identity' && <PersonaPage identities={identities} selectedId={identity.id} isBound={Boolean(activeConversation?.personaId)} onSelect={selectIdentity} onAdd={addIdentity} onDelete={deleteIdentity} onUpdate={updateIdentity} onBack={goBack} />}
    {page === 'worldbook' && <EditablePage title="世界书" value={worldbook} onChange={setWorldbook} onBack={goBack} />}
    {page === 'preset' && <PresetEditor sections={presetSections} onChange={setPresetSections} onBack={goBack} />}

    {page === 'memory' && <><BackHeader title={`${activeCharacter.name} · 长记忆`} onBack={goBack} action={<button className="soft-button" onClick={() => updateMemoryConfig({ ...defaultMemoryConfig(), api: currentMemoryConfig.api })}>恢复默认</button>} /><section className="settings-stack memory-settings"><div className="memory-character-banner"><div className="character-art"><span>{activeCharacter.name.slice(-1)}</span><i>✦</i></div><div><strong>独立记忆库</strong><small>仅属于 {activeCharacter.name}，不会与其他角色混用</small></div></div><button className="memory-api-row" onClick={() => navigate('memory-api')}><div><strong>总结专用 API</strong><small>{currentMemoryConfig.api.modelName || '未设置模型'}</small></div><span>›</span></button><div className="settings-group range-group"><RangeRow label="自动总结" hint={`每 ${currentMemoryConfig.autoEvery} 条消息总结一次，0 为禁用`} value={currentMemoryConfig.autoEvery} min={0} max={200} step={10} onChange={(value) => updateMemoryConfig({ autoEvery: value })} /><RangeRow label="记忆上限" hint={`最多保留 ${currentMemoryConfig.maxEntries} 条长期记忆`} value={currentMemoryConfig.maxEntries} min={100} max={3000} step={100} onChange={(value) => updateMemoryConfig({ maxEntries: value })} /></div><label className="memory-text-card"><strong>记忆总结提示词</strong><textarea rows={10} value={currentMemoryConfig.summaryPrompt} onChange={(e) => updateMemoryConfig({ summaryPrompt: e.target.value })} /><small>发送给记忆模型，用于生成长期记忆。</small></label><label className="memory-select-card"><strong>记忆注入位置</strong><select value={currentMemoryConfig.injectPosition} onChange={(e) => updateMemoryConfig({ injectPosition: e.target.value })}><option value="none">不注入</option><option value="before-main-prompt">↑ Main Prompt</option><option value="after-main-prompt">↓ Main Prompt</option><option value="before-chat-history">↑ Chat History</option><option value="after-chat-history">↓ Chat History</option><option value="depth-system">@Depth · system</option><option value="depth-user">@Depth · user</option><option value="depth-assistant">@Depth · assistant</option></select></label><label className="memory-text-card"><strong>记忆注入提示词</strong><textarea rows={6} value={currentMemoryConfig.injectPrompt} onChange={(e) => updateMemoryConfig({ injectPrompt: e.target.value })} /><small>使用 {'{{memories}}'} 作为记忆内容占位符。</small></label><div className="memory-actions"><button className="primary-button full" onClick={() => summarizeMemory()} disabled={memoryState === 'summarizing'}>{memoryState === 'summarizing' ? '正在总结…' : memoryState === 'error' ? '配置不完整或总结失败，重试' : '立即总结当前对话'}</button><button className="secondary-button" onClick={() => navigate('memory-list')}>查看与管理记忆（{currentMemories.length}）</button></div></section></>}

    {page === 'memory-api' && <><BackHeader title="记忆总结 API" onBack={goBack} action={<span className="saved-label">自动保存</span>} /><section className="content-stack form-stack"><div className="api-status"><span className={currentMemoryConfig.api.apiKey ? 'ok' : ''}></span><div><strong>{currentMemoryConfig.api.apiKey ? '已配置独立接口' : '尚未填写密钥'}</strong><small>仅供 {activeCharacter.name} 的记忆总结使用</small></div></div><label>Base URL<input value={currentMemoryConfig.api.baseUrl} onChange={(e) => updateMemoryApi({ baseUrl: e.target.value })} /></label><label>API Key<input type="password" value={currentMemoryConfig.api.apiKey} onChange={(e) => updateMemoryApi({ apiKey: e.target.value })} placeholder="sk-••••••••" /></label><label>模型名称<input value={currentMemoryConfig.api.modelName} onChange={(e) => updateMemoryApi({ modelName: e.target.value })} /></label><div className="privacy-note">此接口独立于聊天 API。密钥只保存在当前设备，不上传仓库。</div></section></>}

    {page === 'memory-list' && <><BackHeader title={`${activeConversation?.title || activeCharacter.name} · 记忆库`} onBack={goBack} /><section className="content-stack"><div className="privacy-note">这份记忆只属于当前对话。标为核心后会永久注入，不会被相关性筛选或自动整理移除。</div>{currentMemories.length === 0 ? <div className="empty-memory"><span>✦</span><strong>还没有长期记忆</strong><p>返回上一页，配置总结 API 后可立即总结当前对话。</p></div> : currentMemories.slice().reverse().map((entry) => <article className={`memory-entry ${entry.pinned ? 'pinned' : ''}`} key={entry.id}><div><strong>{entry.pinned ? '★ 核心 · ' : entry.consolidated ? '阶段整理 · ' : ''}{entry.title}</strong><small>{new Date(entry.createdAt).toLocaleString()} · 来源 {entry.sourceCount} 条消息</small></div><textarea rows={8} value={entry.content} onChange={(e) => setMemoryEntries((current) => ({ ...current, [memoryScopeId]: (memoriesForConversation(current, activeConversation?.id, activeCharacter.id) as MemoryEntry[]).map((item) => item.id === entry.id ? { ...item, content: e.target.value } : item) }))} /><div className="memory-entry-actions"><button className="soft-button" onClick={() => setMemoryEntries((current) => ({ ...current, [memoryScopeId]: (memoriesForConversation(current, activeConversation?.id, activeCharacter.id) as MemoryEntry[]).map((item) => item.id === entry.id ? { ...item, pinned: !item.pinned } : item) }))}>{entry.pinned ? '取消核心' : '设为核心记忆'}</button><button className="danger-link" onClick={() => setMemoryEntries((current) => ({ ...current, [memoryScopeId]: (memoriesForConversation(current, activeConversation?.id, activeCharacter.id) as MemoryEntry[]).filter((item) => item.id !== entry.id) }))}>删除</button></div></article>)}</section></>}

    {page === 'model' && <><BackHeader title="模型设置" onBack={goBack} /><section className="settings-stack compact-settings"><div className="settings-group range-group"><RangeRow label="记忆长度" value={memoryLength} min={10} max={100} step={1} onChange={setMemoryLength} /><RangeRow label="回复令牌限制" hint={`当前最多请求 ${maxTokens} 个输出令牌`} value={maxTokens} min={1000} max={64000} step={1000} onChange={setMaxTokens} /></div><div className="settings-group range-group"><RangeRow label="温度" value={temperature} min={0} max={2} step={0.05} onChange={setTemperature} /><RangeRow label="Top-P" value={topP} min={0} max={1} step={0.05} onChange={setTopP} /></div><div className="settings-group toggle-row"><div><strong>流式传输</strong><small>立即逐字显示回复</small></div><button className={`switch ${streaming ? 'on' : ''}`} onClick={() => setStreaming(!streaming)}><span /></button></div></section></>}
    {page === 'settings' && <><BackHeader title="应用设置" onBack={goBack} /><section className="settings-stack compact-settings"><div className="storage-health-card"><div><strong>本地数据保险库</strong><small>惟境真实数据：{appDataUsage}</small><small>Safari 站点总占用：{storageUsage}（含 PWA 缓存与系统预留，刷新波动不代表聊天重复增长）</small></div><span>{appDataUsage}</span></div><div className="settings-group"><button onClick={() => navigate('appearance')}><span>外观 · 自定义主题</span><span>›</span></button><button><span>语言 · 简体中文</span><span>›</span></button><button onClick={() => navigate('font')}><span>字体 · {chatFontSize}px</span><span>›</span></button></div><BackupCard /><UpdateCard /></section></>}
    {page === 'appearance' && <><BackHeader title="外观与背景" onBack={goBack} action={<button className="soft-button" onClick={() => { setChatTheme('mist'); setChatBaseColor('#f5f1f8'); setChatBackgroundFrost(.72); setChatBackground('') }}>恢复默认</button>} /><section className="settings-stack appearance-page compact-settings"><div className="theme-choice-card"><div><strong>主题预设</strong><small>选择后仍可继续调整背景图与底色</small></div><div className="theme-choice-grid"><button className={chatTheme === 'mist' ? 'active mist' : 'mist'} onClick={() => { setChatTheme('mist'); setChatBaseColor('#f5f1f8') }}><i /><span><strong>惟境紫雾</strong><small>柔紫 · 轻盈</small></span></button><button className={chatTheme === 'pearl' ? 'active pearl' : 'pearl'} onClick={() => { setChatTheme('pearl'); setChatBaseColor('#f8f7f5') }}><i /><span><strong>月光珍珠</strong><small>月白 · 通透</small></span></button></div></div><div className="appearance-preview theme-preview" style={{ color: chatTextColor, backgroundColor: chatBaseColor, backgroundImage: chatBackground ? `linear-gradient(rgba(255,255,255,${chatBackgroundFrost}),rgba(255,255,255,${chatBackgroundFrost})),url(${JSON.stringify(chatBackground)})` : undefined }}><small>主题预览</small><p>背景与聊天卡片会保持清晰、轻盈。</p></div><div className="appearance-card"><label className="appearance-color-row"><div><strong>背景底色</strong><small>{chatBaseColor}</small></div><input type="color" value={chatBaseColor} onChange={(event) => setChatBaseColor(event.target.value)} /></label></div><div className="appearance-card background-card"><div><strong>聊天背景图</strong><small>图片会压缩并保存在本机 IndexedDB，不上传仓库。</small></div>{chatBackground && <div className="background-preview" style={{ backgroundImage: `url(${JSON.stringify(chatBackground)})` }} />}<div className="appearance-actions"><label className="primary-button">选择背景图<input type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setChatBackground(await backgroundImageData(file)); event.currentTarget.value = '' }} /></label>{chatBackground && <button className="secondary-button" onClick={() => setChatBackground('')}>移除背景</button>}</div>{chatBackground && <RangeRow label="背景白纱" hint="数值越高，文字越清楚" value={chatBackgroundFrost} min={0} max={.92} step={.04} onChange={setChatBackgroundFrost} />}</div></section></>}
    {page === 'font' && <><BackHeader title="字体与文字颜色" onBack={goBack} action={<button className="soft-button" onClick={() => { setChatFontSize(16); setChatTextColor('#4e4852'); setChatNarrationColor('#7f7089'); setChatQuoteColor('#7b4d67') }}>恢复默认</button>} /><section className="settings-stack appearance-page compact-settings"><div className="appearance-preview" style={{ color: chatTextColor, fontSize: chatFontSize }}><small>聊天正文预览</small><p><span style={{ color: chatNarrationColor }}>（他终于等到你回来。）</span><br /><span style={{ color: chatQuoteColor }}>“我一直在这里。”</span></p></div><div className="appearance-card"><RangeRow label="正文字号" hint="只调整聊天正文，不影响按钮与设置页" value={chatFontSize} min={13} max={22} step={1} onChange={setChatFontSize} /><label className="appearance-color-row"><div><strong>正文颜色</strong><small>{chatTextColor}</small></div><input type="color" value={chatTextColor} onChange={(event) => setChatTextColor(event.target.value)} /></label><label className="appearance-color-row"><div><strong>旁白颜色</strong><small>识别 *旁白*、（旁白）</small></div><input type="color" value={chatNarrationColor} onChange={(event) => setChatNarrationColor(event.target.value)} /></label><label className="appearance-color-row"><div><strong>引用颜色</strong><small>识别 “对话” 与「对话」</small></div><input type="color" value={chatQuoteColor} onChange={(event) => setChatQuoteColor(event.target.value)} /></label></div></section></>}

    {mentionPickerOpen && activeConversation?.kind === 'group' && <div className="mention-picker-layer"><button className="drawer-backdrop" aria-label="关闭角色选择" onClick={() => setMentionPickerOpen(false)} /><section className="mention-picker"><header><strong>选择 @ 的角色</strong><button onClick={() => setMentionPickerOpen(false)}>×</button></header>{groupParticipants.map((member) => <button className="mention-member" key={member.id} onClick={() => insertGroupMention(member.name)}>{member.avatar ? <img src={member.avatar} alt="" /> : <span>{member.name.slice(-1)}</span>}<strong>{member.name}</strong></button>)}</section></div>}

    {menuCharacter && <div className="character-menu-layer"><button className="drawer-backdrop" aria-label="关闭角色菜单" onClick={() => setCharacterMenuId(null)} /><section className="conversation-menu character-action-menu"><header><div><small>角色操作</small><strong>{menuCharacter.name}</strong></div><button onClick={() => setCharacterMenuId(null)}>×</button></header><button onClick={() => { setActiveId(menuCharacter.id); setCharacterMenuId(null); navigate('card-data') }}>编辑角色卡</button><button onClick={() => duplicateCharacter(menuCharacter)}>复制角色</button><button onClick={() => exportCharacter(menuCharacter)}>导出 Character Card V3 JSON</button><button className="danger" onClick={() => deleteCharacter(menuCharacter)}>删除角色及相关数据</button></section></div>}

    {drawer && <div className="drawer-layer" role="presentation">
      <button className="drawer-backdrop" aria-label="关闭抽屉" onClick={() => { setDrawer(null); setConversationMenuId(null) }} />
      {drawer === 'left' && <aside className="app-drawer left-drawer" aria-label="对话列表">
        <header className="drawer-header"><div><small>惟境</small><h2>全部聊天</h2></div><button onClick={goHome}>回首页</button></header>
        <div className="conversation-list">{sortedConversations.length ? sortedConversations.map((conversation) => {
          const character = characters.find((item) => item.id === conversation.characterId) || demoCharacter
          const preview = conversation.messages[conversation.messages.length - 1]?.text || character.greeting
          return <div className={`conversation-row ${conversation.id === activeConversation?.id ? 'active' : ''}`} key={conversation.id}>
            <button className="conversation-main" onClick={() => openConversation(conversation)}>{character.avatar ? <img src={character.avatar} alt="" /> : <span>{character.name.slice(-1)}</span>}<div><strong>{conversation.title}</strong><small>{character.name} · {preview.slice(0, 32)}</small></div></button>
            <button className="conversation-more" aria-label={`管理${conversation.title}`} onClick={() => setConversationMenuId(conversation.id)}>•••</button>
          </div>
        }) : <div className="drawer-empty">还没有对话，从角色库选择一个角色开始吧。</div>}</div>
        <nav className="drawer-bottom-nav"><button onClick={() => navigate('api', 'left')}><span>⌁</span><small>API 连接</small></button><button onClick={() => navigate('characters', 'left')}><span>◉</span><small>角色</small></button><button onClick={() => navigate('more', 'left')}><span>•••</span><small>更多</small></button></nav>
      </aside>}

      {drawer === 'right' && <aside className="app-drawer right-drawer" aria-label="聊天设置">
        <header className="drawer-character compact"><div><small>{activeConversation?.kind === 'group' ? '群聊设置' : '聊天设置'}</small><h2>{activeConversation?.title || activeCharacter.name}</h2></div><button onClick={() => setDrawer(null)}>×</button></header>
        <div className="right-drawer-scroll">
          <section className="drawer-members-section"><div className="drawer-section-title"><strong>成员（{conversationMemberIds().length}）</strong><button onClick={() => { setDrawer(null); setMemberPickerOpen(true) }}>添加</button></div><div className="drawer-member-row">{conversationMemberIds().map((id) => { const member = characters.find((item) => item.id === id); if (!member) return null; return <div className="drawer-member-chip" key={id}>{member.avatar ? <img src={member.avatar} alt="" /> : <span>{member.name.slice(-1)}</span>}<small>{member.name}</small>{conversationMemberIds().length > 1 && <button aria-label={`移除${member.name}`} onClick={() => removeConversationMember(id)}>×</button>}</div> })}</div></section>
          <section className="drawer-compact-group"><div className="drawer-section-title"><strong>聊天设置</strong></div>{[['情景与角色资料', 'card-data'], ['用户身份', 'identity'], ['聊天外观与主题', 'appearance']].map(([label, target]) => <button key={label} onClick={() => navigate(target as Page, 'right')}><span>{label}</span><i>›</i></button>)}</section>
          <section className="drawer-compact-group"><div className="drawer-section-title"><strong>显示与回复</strong></div><div className="drawer-inline-setting"><span>消息显示</span><div className="mini-segment"><button className={chatLayout === 'bubble' ? 'active' : ''} onClick={() => setChatLayout('bubble')}>气泡</button><button className={chatLayout === 'flat' ? 'active' : ''} onClick={() => setChatLayout('flat')}>平铺</button></div></div>{activeConversation?.kind === 'group' && <div className="drawer-inline-setting reply-mode-row"><span>回复模式</span><select value={groupReplyMode} onChange={(event) => setGroupReplyMode(event.target.value as GroupReplyMode)}><option value="natural">自然聊天</option><option value="contextual">情境发言</option><option value="all">全员回复</option><option value="specified">指定 @</option></select></div>}</section>
          <section className="drawer-compact-group"><div className="drawer-section-title"><strong>角色与高级设置</strong></div>{[['世界书', 'card-worldbook'], ['正则与美化', 'card-regex'], ['长期记忆', 'memory'], [`API · ${api.name || '当前渠道'}`, 'api'], ['模型设置', 'model'], ['预设', 'preset'], ['应用设置', 'settings']].map(([label, target]) => <button key={label} onClick={() => navigate(target as Page, 'right')}><span>{label}</span><i>›</i></button>)}</section>
          <section className="drawer-compact-group drawer-actions-group"><button onClick={() => navigate('character-detail', 'right')}><span>查看角色详情</span><i>›</i></button><button onClick={compressOldContext} disabled={compressingContext || messages.length < 16}><span>{compressingContext ? '正在压缩旧上下文…' : activeConversation?.contextSummary ? `更新上下文摘要 · 已压缩 ${activeConversation.compressedUntil || 0} 条` : '压缩旧上下文'}</span><i>⌁</i></button><button onClick={exportConversationTxt}><span>导出当前对话 TXT</span><i>↓</i></button></section>
        </div>
      </aside>}

      {menuConversation && <section className="conversation-menu" aria-label="会话操作">
        <header><div><small>会话操作</small><strong>{menuConversation.title}</strong></div><button onClick={() => setConversationMenuId(null)}>×</button></header>
        <button onClick={() => renameConversation(menuConversation)}>重命名</button>
        <button onClick={() => restartConversation(menuConversation)}>重新开始</button>
        <button onClick={() => cloneConversation(menuConversation)}>克隆对话</button>
        <button className="danger" onClick={() => deleteConversation(menuConversation)}>删除对话</button>
      </section>}
    </div>}

    {memberPickerOpen && activeConversation && <div className="member-picker-layer"><button className="drawer-backdrop" aria-label="关闭成员管理" onClick={() => setMemberPickerOpen(false)} /><section className="member-picker"><header><div><small>当前会话</small><strong>成员与独立 API</strong></div><button onClick={() => setMemberPickerOpen(false)}>×</button></header><div className="member-picker-list">{characters.map((character) => { const joined = conversationMemberIds().includes(character.id); const canRemove = conversationMemberIds().length > 1; return <article className={joined ? 'joined' : ''} key={character.id} onClick={() => { if (!joined) addConversationMember(character.id) }}><div className="member-picker-main"><CharacterPortrait item={character} /><div><strong>{character.name}</strong><small>{joined ? '已在当前会话' : character.tagline}</small></div><button onClick={(event) => { event.stopPropagation(); if (joined) { if (canRemove) removeConversationMember(character.id) } else addConversationMember(character.id) }} disabled={joined && !canRemove}>{joined ? canRemove ? '移除' : '保留' : '＋ 加入'}</button></div>{joined && <label onClick={(event) => event.stopPropagation()}>回复渠道<select value={activeConversation.participantApiIds?.[character.id] || api.id} onChange={(event) => updateConversationMemberApi(character.id, event.target.value)}>{apiChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name} · {channel.modelName || '未选模型'}</option>)}</select></label>}</article> })}</div><div className="privacy-note">单聊加入第二位角色后会原地变成群聊；移除到只剩一位时恢复 1v1。已有消息与署名不会丢失。</div></section></div>}

    {menuMessage && <div className="message-menu-layer"><button className="drawer-backdrop" aria-label="关闭消息菜单" onClick={() => setMessageMenuId(null)} /><section className="message-action-sheet"><header><div><small>{menuMessage.role === 'assistant' ? '模型消息' : '用户消息'}</small><strong>消息操作</strong></div><button onClick={() => setMessageMenuId(null)}>×</button></header>{menuMessage.role === 'assistant' ? <><button onClick={() => regenerateMessage(menuMessage)} disabled={isGenerating}>重新生成</button><button onClick={() => editAssistantMessage(menuMessage)}>编辑改写</button><button onClick={() => copyMessage(menuMessage)}>复制文本</button><button className="danger" onClick={() => withdrawMessage(menuMessage)}>撤回消息</button></> : <><button onClick={() => editAndResendUserMessage(menuMessage)} disabled={isGenerating}>编辑并重新发送</button><button onClick={() => copyMessage(menuMessage)}>复制文本</button></>}</section></div>}
  </main></div>
}

function UpdateCard() {
  const [state, setState] = useState<'idle' | 'checking' | 'error'>('idle')
  const refresh = async () => {
    setState('checking')
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration('/wewei-role-site/')
        await registration?.update()
        if (registration?.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.filter((name) => name.startsWith('weijing-')).map((name) => caches.delete(name)))
      }
      const url = new URL(window.location.href)
      url.searchParams.set('_refresh', Date.now().toString())
      window.location.replace(url.toString())
    } catch (error) {
      console.error('更新失败', error)
      setState('error')
    }
  }

  return <section className="update-card"><strong>应用更新</strong><p>主动检查并拉取最新网页版本，不会删除角色、聊天记录或本地设置。</p><small>当前版本：2026.07.12 · 双布局渲染</small><button onClick={refresh} disabled={state === 'checking'}>{state === 'checking' ? '正在检查更新…' : state === 'error' ? '更新失败，点我重试' : '强制刷新到最新版'}</button></section>
}

function PersonaPage({ identities, selectedId, isBound, onSelect, onAdd, onDelete, onUpdate, onBack }: { identities: UserIdentity[]; selectedId: string; isBound: boolean; onSelect: (id: string) => void; onAdd: () => void; onDelete: (id: string) => void; onUpdate: (patch: Partial<UserIdentity>) => void; onBack: () => void }) {
  const selected = identities.find((item) => item.id === selectedId) || identities[0]
  if (!selected) return null
  return <><BackHeader title="用户身份" onBack={onBack} action={<span className="saved-label">自动保存</span>} /><section className="content-stack persona-page"><div className="persona-heading"><div><strong>我的身份库</strong><small>{isBound ? '当前身份已绑定这段对话，切换角色不会串用。' : '选择后会绑定到当前对话。'}</small></div><button className="soft-button" onClick={onAdd}>＋ 新建</button></div><div className="persona-tabs">{identities.map((item) => <button key={item.id} className={item.id === selected.id ? 'active' : ''} onClick={() => onSelect(item.id)}>{item.avatar ? <img src={item.avatar} alt="" /> : <span>{item.name.slice(-1) || '惟'}</span>}<div><strong>{item.name || '未命名身份'}</strong><small>{item.id === selected.id ? '当前对话使用' : '点按切换'}</small></div></button>)}</div><div className="persona-editor"><div className="identity-avatar-editor"><div>{selected.avatar ? <img src={selected.avatar} alt="用户头像" /> : <span>{selected.name.slice(-1) || '惟'}</span>}</div><label className="soft-button">选择用户头像<input type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (file) onUpdate({ avatar: await imageThumbnail(file) }) }} /></label>{selected.avatar && <button className="text-button" onClick={() => onUpdate({ avatar: '' })}>移除</button>}</div><label>名称<input value={selected.name} onChange={(event) => onUpdate({ name: event.target.value })} /></label><label>用户身份内容<textarea rows={14} value={selected.description} onChange={(event) => onUpdate({ description: event.target.value })} placeholder="填写该身份的人设、背景和关系……" /></label>{identities.length > 1 && <button className="danger-link persona-delete" onClick={() => onDelete(selected.id)}>删除这个身份</button>}</div><div className="privacy-note">每段对话会记住自己选择的身份。顾荒可以使用苏禾，程妄或其他角色可以选择另一位女主，互不覆盖。</div></section></>
}

function EditablePage({ title, value, onChange, onBack, name, onName, avatar, onAvatar }: { title: string; value: string; onChange: (value: string) => void; onBack: () => void; name?: string; onName?: (value: string) => void; avatar?: string; onAvatar?: (value: string) => void }) {
  return <><BackHeader title={title} onBack={onBack} action={<span className="saved-label">自动保存</span>} /><section className="content-stack form-stack">{onAvatar && <div className="identity-avatar-editor"><div>{avatar ? <img src={avatar} alt="用户头像" /> : <span>{name?.slice(-1) || '惟'}</span>}</div><label className="soft-button">选择用户头像<input type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (file) onAvatar(await imageThumbnail(file)) }} /></label>{avatar && <button className="text-button" onClick={() => onAvatar('')}>移除</button>}</div>}{onName && <label>名称<input value={name} onChange={(e) => onName(e.target.value)} /></label>}<label>{title}内容<textarea rows={14} value={value} onChange={(e) => onChange(e.target.value)} placeholder={`填写${title}内容……`} /></label><div className="privacy-note">内容会自动保存在当前设备。</div></section></>
}

function RangeRow({ label, hint, value, min, max, step, onChange }: { label: string; hint?: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <div className="range-row"><div><strong>{label}</strong>{hint && <small>{hint}</small>}</div><div className="range-controls"><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /><output>{Number.isInteger(value) ? value : value.toFixed(2)}</output></div></div>
}

export default App
