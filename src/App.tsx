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

type Page = 'home' | 'characters' | 'create' | 'import-preview' | 'character-detail' | 'card-data' | 'card-worldbook' | 'card-regex' | 'greeting-picker' | 'chat' | 'more' | 'api' | 'model' | 'settings' | 'identity' | 'worldbook' | 'preset' | 'memory' | 'memory-api' | 'memory-list'
type Message = { id: number; role: 'user' | 'assistant'; text: string; finishReason?: string | null }
type Drawer = 'left' | 'right'
type HistoryEntry = { page: Page; reopenDrawer?: Drawer }
type Conversation = {
  id: string
  characterId: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}
type LegacySessionMap = Record<string, Message[]>
type MemoryEntry = { id: string; createdAt: number; title: string; content: string; sourceCount: number }
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

const demoCharacter: Character = {
  id: 'huo-jin', name: '霍烬', tagline: '沉稳克制的守护者',
  description: 'A 国旧世家出身，寡言、冷静，习惯把所有风浪挡在身后。不会替你决定，但会一直站在你能看见的地方。',
  personality: '', scenario: '', greeting: '夜里风大。过来，站我这边。', alternateGreetings: [], mesExample: '', creatorNotes: '', systemPrompt: '', postHistoryInstructions: '',
  tags: ['慢热', '沉稳', '守护', '剧情向'], creator: '', characterVersion: '', regexScripts: [],
}

const defaultMemoryPrompt = `【暂停剧情扮演】请根据前文内容，对上次总结之后的剧情进行总结。生成一个详细的总结集合，涵盖所有主要事件、观点、关系变化与关键信息。总结需逻辑清晰，按时间顺序组织，每件事以独立条目呈现，并尽量标注具体时间点。若时间信息不明确，请根据上下文合理推测并注明。重点保留人物关系、承诺、冲突、情绪转折、世界设定与未完成事项，避免遗漏。`
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

const read = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value))

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
  const [characterMenuId, setCharacterMenuId] = useState<string | null>(null)
  const [characterQuery, setCharacterQuery] = useState('')
  const [characters, setCharacters] = useState<Character[]>(() => read<Partial<Character>[]>('weijing.characters', [demoCharacter]).map(normalizeStoredCharacter))
  const [activeId, setActiveId] = useState(() => read('weijing.activeCharacter', demoCharacter.id))
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations(read<Partial<Character>[]>('weijing.characters', [demoCharacter]).map(normalizeStoredCharacter)))
  const [activeConversationId, setActiveConversationId] = useState(() => read('weijing.activeConversation', ''))
  const [draft, setDraft] = useState('')
  const [newCharacter, setNewCharacter] = useState({ name: '', tagline: '', description: '', greeting: '', tags: '' })
  const [identity, setIdentity] = useState(() => read('weijing.identity', { name: '周惟惟', description: '由用户亲自决定言行、心理与关键选择。' }))
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
  const [memoryConfigs, setMemoryConfigs] = useState<MemoryConfigMap>(() => read('weijing.memoryConfigs', { [demoCharacter.id]: defaultMemoryConfig() }))
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntryMap>(() => read('weijing.memoryEntries', { [demoCharacter.id]: [] }))
  const [memoryState, setMemoryState] = useState<'idle' | 'summarizing' | 'ok' | 'error'>('idle')
  const [importState, setImportState] = useState<'idle' | 'reading' | 'error'>('idle')
  const [importError, setImportError] = useState('')
  const [pendingImport, setPendingImport] = useState<Character | null>(null)
  const [restartingConversationId, setRestartingConversationId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const phoneCanvasRef = useRef<HTMLElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const generationControllers = useRef(new Map<string, AbortController>())

  const activeCharacter = characters.find((item) => item.id === activeId) || characters[0] || demoCharacter
  const api = apiChannels.find((item) => item.id === activeApiId) || apiChannels[0]
  const activeConversation = conversations.find((item) => item.id === activeConversationId && item.characterId === activeCharacter.id)
    || conversations.filter((item) => item.characterId === activeCharacter.id).sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const messages = activeConversation?.messages || [{ id: 1, role: 'assistant' as const, text: activeCharacter.greeting }]
  const currentMemoryConfig = memoryConfigs[activeCharacter.id] || defaultMemoryConfig()
  const currentMemories = memoryEntries[activeCharacter.id] || []

  useEffect(() => write('weijing.characters', characters), [characters])
  useEffect(() => write('weijing.activeCharacter', activeId), [activeId])
  useEffect(() => write('weijing.conversations', conversations), [conversations])
  useEffect(() => write('weijing.activeConversation', activeConversation?.id || ''), [activeConversation?.id])
  useEffect(() => write('weijing.identity', identity), [identity])
  useEffect(() => write('weijing.worldbook', worldbook), [worldbook])
  useEffect(() => { write('weijing.presetSections', presetSections); write('weijing.preset', enabledPresetText(presetSections)) }, [presetSections])
  useEffect(() => write('weijing.apiChannels', apiChannels), [apiChannels])
  useEffect(() => write('weijing.activeApiChannel', api.id), [api.id])
  useEffect(() => write('weijing.api', { baseUrl: api.baseUrl, apiKey: api.apiKey, modelName: api.modelName, maxTokenField: api.maxTokenField }), [api])
  useEffect(() => write('weijing.memoryConfigs', memoryConfigs), [memoryConfigs])
  useEffect(() => write('weijing.memoryEntries', memoryEntries), [memoryEntries])
  useEffect(() => { write('weijing.temperature', temperature); write('weijing.topP', topP); write('weijing.memoryLength', memoryLength); write('weijing.maxTokens', maxTokens); write('weijing.streaming', streaming) }, [temperature, topP, memoryLength, maxTokens, streaming])
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
    const character = createBlankCharacter(newCharacter)
    const conversation = createConversation(character)
    setCharacters((current) => [...current, character])
    setConversations((current) => [...current, conversation])
    setActiveConversationId(conversation.id)
    setMemoryConfigs((current) => ({ ...current, [character.id]: defaultMemoryConfig() }))
    setMemoryEntries((current) => ({ ...current, [character.id]: [] }))
    setActiveId(character.id)
    setNewCharacter({ name: '', tagline: '', description: '', greeting: '', tags: '' })
    replacePage('character-detail')
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
    conversations.filter((item) => item.characterId === character.id).forEach((item) => abortConversation(item.id))
    const nextCharacters = characters.filter((item) => item.id !== character.id)
    const nextConversations = conversations.filter((item) => item.characterId !== character.id)
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
      const conversation = createConversation(activeCharacter, greeting)
      setConversations((current) => [...current, conversation])
      setActiveConversationId(conversation.id)
    }
    replacePage('chat')
  }

  const continueConversation = (character = activeCharacter) => {
    let conversation = conversations.filter((item) => item.characterId === character.id).sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (!conversation) {
      conversation = createConversation(character)
      setConversations((current) => [...current, conversation!])
    }
    setActiveId(character.id)
    setActiveConversationId(conversation.id)
    navigate('chat')
  }

  const openConversation = (conversation: Conversation) => {
    setActiveConversationId(conversation.id)
    setActiveId(conversation.characterId)
    setDrawer(null)
    setConversationMenuId(null)
    if (page !== 'chat') navigate('chat')
  }

  const renameConversation = (conversation: Conversation) => {
    const title = window.prompt('给这段对话重新命名', conversation.title)?.trim()
    if (!title) return
    setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, title, updatedAt: Date.now() } : item))
    setConversationMenuId(null)
  }

  const restartConversation = (conversation: Conversation) => {
    abortConversation(conversation.id)
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
        setActiveId(next.characterId)
        setActiveConversationId(next.id)
      } else {
        setActiveConversationId('')
        goHome()
      }
    }
  }

  const summarizeMemory = async (sourceMessages = messages) => {
    const config = currentMemoryConfig
    if (!config.api.baseUrl || !config.api.modelName || !config.api.apiKey || sourceMessages.length < 2) { setMemoryState('error'); return }
    setMemoryState('summarizing')
    const transcript = sourceMessages.map((item) => `${item.role === 'user' ? identity.name : activeCharacter.name}：${item.text}`).join('\n')
    const previous = currentMemories.slice(-8).map((item) => item.content).join('\n\n')
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
            { role: 'user', content: `角色：${activeCharacter.name}\n用户：${identity.name}\n已有记忆：\n${previous || '暂无'}\n\n待总结对话：\n${transcript}` },
          ],
        }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content?.trim()
      if (!content) throw new Error('empty memory')
      const entry: MemoryEntry = { id: crypto.randomUUID(), createdAt: Date.now(), title: `${new Date().toLocaleDateString()} · ${sourceMessages.length} 条消息`, content, sourceCount: sourceMessages.length }
      setMemoryEntries((current) => ({ ...current, [activeCharacter.id]: [...(current[activeCharacter.id] || []), entry].slice(-config.maxEntries) }))
      updateMemoryConfig({ lastSummarizedCount: sourceMessages.length })
      setMemoryState('ok')
    } catch (error) {
      console.error('记忆总结失败', error)
      setMemoryState('error')
    }
  }

  const sendMessage = async () => {
    const text = draft.trim(); if (!text) return
    if (!api.baseUrl.trim() || !api.apiKey.trim() || !api.modelName.trim()) {
      setChatError('请先在 API 连接中填写 Base URL、API Key 和模型名称。')
      return
    }

    let conversation = activeConversation
    if (!conversation) {
      conversation = createConversation(activeCharacter)
      setActiveConversationId(conversation.id)
    }
    const conversationId = conversation.id
    if (generationControllers.current.has(conversationId)) return

    const capturedCharacter = activeCharacter
    const capturedMemoryConfig = memoryConfigs[capturedCharacter.id] || defaultMemoryConfig()
    const capturedMemories = memoryEntries[capturedCharacter.id] || []
    const userMessage = { id: Date.now(), role: 'user' as const, text }
    const assistantMessage = { id: Date.now() + 1, role: 'assistant' as const, text: '正在回应…' }
    const nextMessages = [...messages, userMessage]
    const pendingMessages = [...nextMessages, assistantMessage]
    setConversations((current) => {
      const exists = current.some((item) => item.id === conversationId)
      if (!exists) return [...current, { ...conversation!, messages: pendingMessages, updatedAt: Date.now() }]
      return current.map((item) => item.id === conversationId ? { ...item, messages: pendingMessages, updatedAt: Date.now() } : item)
    })
    setDraft('')
    setChatError('')
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const list = messageListRef.current
      const userRows = list?.querySelectorAll<HTMLElement>('.message-row.user')
      const latest = userRows?.[userRows.length - 1]
      if (list && latest) list.scrollTop = Math.max(0, latest.offsetTop - list.offsetTop - 14)
    }))

    const controller = new AbortController()
    generationControllers.current.set(conversationId, controller)
    setGeneratingIds((current) => [...current.filter((id) => id !== conversationId), conversationId])
    let output = ''

    try {
      const promptMessages = buildChatPrompt({
        character: capturedCharacter,
        user: identity,
        messages: nextMessages,
        preset: enabledPresetText(presetSections),
        globalWorldbook: worldbook,
        memory: { entries: capturedMemories, injectPosition: capturedMemoryConfig.injectPosition, injectPrompt: capturedMemoryConfig.injectPrompt },
        memoryLength,
      })
      const completion = await completeChat({
        api,
        messages: promptMessages,
        temperature,
        topP,
        maxTokens,
        streaming,
        signal: controller.signal,
        onDelta: (delta) => {
          output += delta
          setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, messages: item.messages.map((message) => message.id === assistantMessage.id ? { ...message, text: output } : message), updatedAt: Date.now() } : item))
        },
      })
      if (!output.trim()) throw new Error('模型没有返回内容')
      if (completion.finishReason) {
        setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, messages: item.messages.map((message) => message.id === assistantMessage.id ? { ...message, finishReason: completion.finishReason } : message) } : item))
      }

      const completed = [...nextMessages, { ...assistantMessage, text: output }]
      if (capturedMemoryConfig.autoEvery > 0 && completed.length - capturedMemoryConfig.lastSummarizedCount >= capturedMemoryConfig.autoEvery && capturedMemoryConfig.api.apiKey) summarizeMemory(completed)
    } catch (error) {
      if (controller.signal.aborted) {
        setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, messages: item.messages.map((message) => message.id === assistantMessage.id ? { ...message, text: output || '已停止生成。' } : message) } : item))
      } else {
        const message = error instanceof Error ? error.message : '聊天请求失败'
        setChatError(message)
        setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, messages: item.messages.map((entry) => entry.id === assistantMessage.id ? { ...entry, text: `请求失败：${message}` } : entry) } : item))
      }
    } finally {
      if (generationControllers.current.get(conversationId) === controller) {
        generationControllers.current.delete(conversationId)
        setGeneratingIds((current) => current.filter((id) => id !== conversationId))
      }
    }
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
  const menuCharacter = characters.find((item) => item.id === characterMenuId)
  const filteredCharacters = characters.filter((item) => {
    const query = characterQuery.trim().toLocaleLowerCase()
    return !query || [item.name, item.tagline, item.creator, ...item.tags].some((value) => value.toLocaleLowerCase().includes(query))
  })
  const isGenerating = Boolean(activeConversation && generatingIds.includes(activeConversation.id))

  return <div className="app-shell"><main ref={phoneCanvasRef} className={`phone-canvas ${page === 'chat' ? 'chat-canvas' : ''}`}>
    <input ref={fileInputRef} className="hidden-file-input" type="file" accept="image/png,.png" onChange={(event) => handleCharacterFile(event.target.files?.[0])} />
    {page === 'home' && <section className="home-dashboard">
      <header className="home-heading"><p className="eyebrow">WeiWei Role</p><h1>{pageTitle}</h1><p>选择今天要进入的空间。</p></header>
      <div className="home-entrances">
        <button onClick={() => continueConversation()}><span className="home-icon">✦</span><strong>聊天</strong><small>{activeConversation ? `继续「${activeConversation.title}」` : '开始一段新的共演'}</small><i>›</i></button>
        <button onClick={() => navigate('characters')}><span className="home-icon">◉</span><strong>角色库</strong><small>导入、创建与管理角色</small><i>›</i></button>
        <button onClick={() => navigate('more')}><span className="home-icon">⌘</span><strong>设置</strong><small>API、模型、身份与应用</small><i>›</i></button>
      </div>
    </section>}

    {page === 'characters' && <><BackHeader title="角色库" onBack={goBack} action={<button className="text-button" onClick={() => fileInputRef.current?.click()}>导入</button>} /><section className="content-stack"><div className="section-heading"><div><h2>全部角色</h2><p>支持 Tavern PNG · Card V2/V3</p></div><div className="library-actions"><button onClick={() => navigate('create')}>＋ 新建</button></div></div><div className="character-search"><span>⌕</span><input value={characterQuery} onChange={(event) => setCharacterQuery(event.target.value)} placeholder="搜索名字、作者或标签" />{characterQuery && <button onClick={() => setCharacterQuery('')}>×</button>}</div>{importState === 'reading' && <div className="import-notice">正在解析角色卡、世界书与正则…</div>}{importState === 'error' && <div className="import-notice error">{importError}</div>}{filteredCharacters.map((item) => <CharacterCard key={item.id} item={item} />)}{filteredCharacters.length === 0 && <div className="library-empty">没有找到匹配的角色。</div>}</section></>}

    {page === 'create' && <><BackHeader title="新建角色" onBack={goBack} action={<button className="text-button" onClick={createCharacter}>保存</button>} /><section className="content-stack form-stack"><button className="drop-zone compact" onClick={() => fileInputRef.current?.click()}><span className="drop-plus">＋</span><strong>{importState === 'reading' ? '正在读取角色卡…' : '导入 PNG 角色卡'}</strong><small>自动解析头像、开场白、世界书和正则</small></button>{importState === 'error' && <div className="import-notice error">{importError}</div>}<div className="form-divider"><span>或者手动创建</span></div><label>角色名称<input value={newCharacter.name} onChange={(e) => setNewCharacter({ ...newCharacter, name: e.target.value })} placeholder="例如：霍烬" /></label><label>一句话简介<input value={newCharacter.tagline} onChange={(e) => setNewCharacter({ ...newCharacter, tagline: e.target.value })} /></label><label>角色设定<textarea rows={7} value={newCharacter.description} onChange={(e) => setNewCharacter({ ...newCharacter, description: e.target.value })} /></label><label>开场白<textarea rows={4} value={newCharacter.greeting} onChange={(e) => setNewCharacter({ ...newCharacter, greeting: e.target.value })} /></label><label>标签<input value={newCharacter.tags} onChange={(e) => setNewCharacter({ ...newCharacter, tags: e.target.value })} placeholder="慢热，守护，剧情向" /></label><button className="primary-button full" onClick={createCharacter}>创建并保存</button></section></>}

    {page === 'import-preview' && pendingImport && <ImportPreview character={pendingImport} onCancel={() => { setPendingImport(null); goBack() }} onConfirm={({ includeBook, includeRegex }) => {
    const character = { ...pendingImport, characterBook: includeBook ? pendingImport.characterBook : undefined, regexScripts: includeRegex ? pendingImport.regexScripts : [] }
      setPendingImport(null)
      addImportedCharacter(character, 'greeting-picker')
    }} />}

    {page === 'character-detail' && <><BackHeader title={activeCharacter.name} onBack={goBack} /><section className="detail-stack"><div className="character-hero"><CharacterPortrait item={activeCharacter} large /><div><p className="eyebrow">{activeCharacter.cardSpecVersion ? `CHARACTER CARD ${activeCharacter.cardSpecVersion}` : 'CHARACTER'}</p><h2>{activeCharacter.name}</h2><p>{activeCharacter.tagline}</p></div></div><div className="detail-card"><h3>角色简介</h3><p>{activeCharacter.description || '还没有填写角色简介。'}</p><div className="chips left">{activeCharacter.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div><button className="data-summary-card" onClick={() => navigate('card-data')}><div><strong>角色卡主体与开场白</strong><small>{activeCharacter.alternateGreetings.length + 1} 个开场 · Card {activeCharacter.cardSpecVersion || '本地'}</small></div><span>›</span></button><button className="data-summary-card compact" onClick={() => navigate('card-worldbook')}><div><strong>角色世界书</strong><small>{activeCharacter.characterBook?.entries.length || 0} 条 · 可编辑、启停和调整插入位置</small></div><span>›</span></button><button className="data-summary-card compact" onClick={() => navigate('card-regex')}><div><strong>角色正则与美化</strong><small>{activeCharacter.regexScripts.length} 条 · {activeCharacter.regexScripts.filter((script) => !script.disabled).length} 条启用</small></div><span>›</span></button><div className="detail-card"><h3>长期记忆</h3><p>这个角色拥有独立记忆库，目前保存 {currentMemories.length} 条记忆。</p><button className="inline-link" onClick={() => navigate('memory')}>管理记忆与总结模型 ›</button></div><div className="detail-card"><h3>开场白</h3><blockquote>{activeCharacter.greeting}</blockquote></div><div className="detail-actions"><button className="primary-button full" onClick={() => continueConversation()}>继续共演</button><button className="secondary-button" onClick={newSession}>选择开场并新建对话</button></div></section></>}

    {page === 'card-data' && <CharacterCardManager character={activeCharacter} onChange={updateActiveCharacter} onBack={goBack} />}
    {page === 'card-worldbook' && <CharacterCardManager character={activeCharacter} onChange={updateActiveCharacter} onBack={goBack} initialSection="worldbook" />}
    {page === 'card-regex' && <CharacterCardManager character={activeCharacter} onChange={updateActiveCharacter} onBack={goBack} initialSection="regex" />}

    {page === 'greeting-picker' && <GreetingPicker character={activeCharacter} userName={identity.name} onCancel={() => { const restarting = Boolean(restartingConversationId); setRestartingConversationId(null); restarting ? replacePage('chat') : goBack() }} onConfirm={beginWithGreeting} />}

    {page === 'chat' && <section className="chat-page"><header className="chat-header"><button className="icon-button drawer-trigger" aria-label="打开对话列表" onClick={() => setDrawer('left')}>☰</button><button className="chat-identity" onClick={() => navigate('character-detail')}>{activeCharacter.avatar ? <img src={activeCharacter.avatar} alt="" /> : <span>{activeCharacter.name.slice(-1)}</span>}<div><strong>{activeCharacter.name}</strong><small>{isGenerating ? '正在回应…' : activeConversation?.title || `${identity.name} · 沉浸共演中`}</small></div></button><button className="more-button" aria-label="打开聊天设置" onClick={() => setDrawer('right')}>•••</button></header><button className="scene-banner" onClick={() => navigate('card-worldbook')}><span>✦</span><p>{(activeCharacter.characterBook?.name || worldbook).slice(0, 24)} · {activeCharacter.characterBook?.entries.length || 0} 条</p></button>{chatError && <button className="chat-error" onClick={() => navigate('api')}><span>连接提示</span>{chatError}<i>前往 API 设置 ›</i></button>}<div ref={messageListRef} className="message-list">{messages.map((message) => <div key={message.id} className={`message-row ${message.role}`}><div className="message-bubble"><MessageContent text={message.text} role={message.role} character={activeCharacter} userName={identity.name} /></div>{message.role === 'assistant' && (message.finishReason === 'length' || message.finishReason === 'max_tokens') && <button className="message-continue" onClick={() => setDraft('请紧接上一句，从中断处继续，不要重复已经说过的内容。')}>回复达到上限 · 点此续写</button>}{message.role === 'assistant' && message.finishReason === 'content_filter' && <span className="message-finish-note">接口因内容过滤提前结束</span>}</div>)}</div><div className="composer"><button className="composer-plus">＋</button><textarea ref={composerRef} rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!isGenerating) sendMessage() } }} placeholder={isGenerating ? '可以先写下一条，停止后再发送' : '写下你的回应……'} /><button className={`send-button ${isGenerating ? 'stop' : ''}`} aria-label={isGenerating ? '停止生成' : '发送'} onClick={() => isGenerating && activeConversation ? abortConversation(activeConversation.id) : sendMessage()}>{isGenerating ? '■' : '↑'}</button></div></section>}

    {page === 'more' && <><BackHeader title="设置" onBack={goBack} /><section className="settings-stack">{[[['API 连接', 'api'], ['用户身份', 'identity']], [['模型设置', 'model'], ['全局预设', 'preset'], ['全局世界书', 'worldbook'], ['长记忆', 'memory']], [['应用设置', 'settings']]].map((group, index) => <div className="settings-group" key={index}>{group.map(([label, target]) => <button key={label} onClick={() => navigate(target as Page)}><span>{label}</span><span>›</span></button>)}</div>)}</section></>}

    {page === 'api' && <ApiSettingsPage api={api} channels={apiChannels} connection={connection} connectionMessage={connectionMessage} onApiChange={updateApiChannel} onSelectChannel={selectApiChannel} onAddChannel={addApiChannel} onDeleteChannel={deleteApiChannel} onConnectionReset={resetApiConnection} onBack={goBack} onTest={testConnection} />}

    {page === 'identity' && <EditablePage title="用户身份" value={identity.description} name={identity.name} onName={(name) => setIdentity({ ...identity, name })} onChange={(description) => setIdentity({ ...identity, description })} onBack={goBack} />}
    {page === 'worldbook' && <EditablePage title="世界书" value={worldbook} onChange={setWorldbook} onBack={goBack} />}
    {page === 'preset' && <PresetEditor sections={presetSections} onChange={setPresetSections} onBack={goBack} />}

    {page === 'memory' && <><BackHeader title={`${activeCharacter.name} · 长记忆`} onBack={goBack} action={<button className="soft-button" onClick={() => updateMemoryConfig({ ...defaultMemoryConfig(), api: currentMemoryConfig.api })}>恢复默认</button>} /><section className="settings-stack memory-settings"><div className="memory-character-banner"><div className="character-art"><span>{activeCharacter.name.slice(-1)}</span><i>✦</i></div><div><strong>独立记忆库</strong><small>仅属于 {activeCharacter.name}，不会与其他角色混用</small></div></div><button className="memory-api-row" onClick={() => navigate('memory-api')}><div><strong>总结专用 API</strong><small>{currentMemoryConfig.api.modelName || '未设置模型'}</small></div><span>›</span></button><div className="settings-group range-group"><RangeRow label="自动总结" hint={`每 ${currentMemoryConfig.autoEvery} 条消息总结一次，0 为禁用`} value={currentMemoryConfig.autoEvery} min={0} max={200} step={10} onChange={(value) => updateMemoryConfig({ autoEvery: value })} /><RangeRow label="记忆上限" hint={`最多保留 ${currentMemoryConfig.maxEntries} 条长期记忆`} value={currentMemoryConfig.maxEntries} min={100} max={3000} step={100} onChange={(value) => updateMemoryConfig({ maxEntries: value })} /></div><label className="memory-text-card"><strong>记忆总结提示词</strong><textarea rows={10} value={currentMemoryConfig.summaryPrompt} onChange={(e) => updateMemoryConfig({ summaryPrompt: e.target.value })} /><small>发送给记忆模型，用于生成长期记忆。</small></label><label className="memory-select-card"><strong>记忆注入位置</strong><select value={currentMemoryConfig.injectPosition} onChange={(e) => updateMemoryConfig({ injectPosition: e.target.value })}><option value="none">不注入</option><option value="before-main-prompt">↑ Main Prompt</option><option value="after-main-prompt">↓ Main Prompt</option><option value="before-chat-history">↑ Chat History</option><option value="after-chat-history">↓ Chat History</option><option value="depth-system">@Depth · system</option><option value="depth-user">@Depth · user</option><option value="depth-assistant">@Depth · assistant</option></select></label><label className="memory-text-card"><strong>记忆注入提示词</strong><textarea rows={6} value={currentMemoryConfig.injectPrompt} onChange={(e) => updateMemoryConfig({ injectPrompt: e.target.value })} /><small>使用 {'{{memories}}'} 作为记忆内容占位符。</small></label><div className="memory-actions"><button className="primary-button full" onClick={() => summarizeMemory()} disabled={memoryState === 'summarizing'}>{memoryState === 'summarizing' ? '正在总结…' : memoryState === 'error' ? '配置不完整或总结失败，重试' : '立即总结当前对话'}</button><button className="secondary-button" onClick={() => navigate('memory-list')}>查看与管理记忆（{currentMemories.length}）</button></div></section></>}

    {page === 'memory-api' && <><BackHeader title="记忆总结 API" onBack={goBack} action={<span className="saved-label">自动保存</span>} /><section className="content-stack form-stack"><div className="api-status"><span className={currentMemoryConfig.api.apiKey ? 'ok' : ''}></span><div><strong>{currentMemoryConfig.api.apiKey ? '已配置独立接口' : '尚未填写密钥'}</strong><small>仅供 {activeCharacter.name} 的记忆总结使用</small></div></div><label>Base URL<input value={currentMemoryConfig.api.baseUrl} onChange={(e) => updateMemoryApi({ baseUrl: e.target.value })} /></label><label>API Key<input type="password" value={currentMemoryConfig.api.apiKey} onChange={(e) => updateMemoryApi({ apiKey: e.target.value })} placeholder="sk-••••••••" /></label><label>模型名称<input value={currentMemoryConfig.api.modelName} onChange={(e) => updateMemoryApi({ modelName: e.target.value })} /></label><div className="privacy-note">此接口独立于聊天 API。密钥只保存在当前设备，不上传仓库。</div></section></>}

    {page === 'memory-list' && <><BackHeader title={`${activeCharacter.name} · 记忆库`} onBack={goBack} /><section className="content-stack">{currentMemories.length === 0 ? <div className="empty-memory"><span>✦</span><strong>还没有长期记忆</strong><p>返回上一页，配置总结 API 后可立即总结当前对话。</p></div> : currentMemories.slice().reverse().map((entry) => <article className="memory-entry" key={entry.id}><div><strong>{entry.title}</strong><small>{new Date(entry.createdAt).toLocaleString()} · 来源 {entry.sourceCount} 条消息</small></div><textarea rows={8} value={entry.content} onChange={(e) => setMemoryEntries((current) => ({ ...current, [activeCharacter.id]: (current[activeCharacter.id] || []).map((item) => item.id === entry.id ? { ...item, content: e.target.value } : item) }))} /><button className="danger-link" onClick={() => setMemoryEntries((current) => ({ ...current, [activeCharacter.id]: (current[activeCharacter.id] || []).filter((item) => item.id !== entry.id) }))}>删除这条记忆</button></article>)}</section></>}

    {page === 'model' && <><BackHeader title="模型设置" onBack={goBack} /><section className="settings-stack"><div className="settings-group range-group"><RangeRow label="记忆长度" value={memoryLength} min={10} max={100} step={1} onChange={setMemoryLength} /><RangeRow label="回复令牌限制" hint={`当前最多请求 ${maxTokens} 个输出令牌`} value={maxTokens} min={1000} max={64000} step={1000} onChange={setMaxTokens} /></div><div className="settings-group range-group"><RangeRow label="温度" value={temperature} min={0} max={2} step={0.05} onChange={setTemperature} /><RangeRow label="Top-P" value={topP} min={0} max={1} step={0.05} onChange={setTopP} /></div><div className="settings-group toggle-row"><div><strong>流式传输</strong><small>立即逐字显示回复</small></div><button className={`switch ${streaming ? 'on' : ''}`} onClick={() => setStreaming(!streaming)}><span /></button></div></section></>}
    {page === 'settings' && <><BackHeader title="应用设置" onBack={goBack} /><section className="settings-stack"><div className="settings-group">{['外观 · 跟随系统', '语言 · 简体中文', '字体 · 默认'].map((item) => <button key={item}><span>{item}</span><span>›</span></button>)}</div><BackupCard /><UpdateCard /></section></>}

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
        <header className="drawer-character"><CharacterPortrait item={activeCharacter} /><div><small>当前角色</small><h2>{activeCharacter.name}</h2><p>{activeConversation?.title}</p></div></header>
        <div className="drawer-settings">
          {[
            ['情景与角色资料', 'card-data', '◇'],
            ['用户身份', 'identity', '惟'],
            ['世界书', 'card-worldbook', '◎'],
            ['正则与美化', 'card-regex', '.*'],
            ['长期记忆', 'memory', '✦'],
            [`API · ${api.name || '当前渠道'}`, 'api', '⌁'],
            ['模型设置', 'model', '◫'],
            ['预设', 'preset', '≡'],
            ['应用设置', 'settings', '⚙'],
          ].map(([label, target, icon]) => <button key={label} onClick={() => navigate(target as Page, 'right')}><span>{icon}</span><strong>{label}</strong><i>›</i></button>)}
        </div>
        <button className="drawer-detail-link" onClick={() => navigate('character-detail', 'right')}>查看角色详情 <span>›</span></button>
      </aside>}

      {menuConversation && <section className="conversation-menu" aria-label="会话操作">
        <header><div><small>会话操作</small><strong>{menuConversation.title}</strong></div><button onClick={() => setConversationMenuId(null)}>×</button></header>
        <button onClick={() => renameConversation(menuConversation)}>重命名</button>
        <button onClick={() => restartConversation(menuConversation)}>重新开始</button>
        <button onClick={() => cloneConversation(menuConversation)}>克隆对话</button>
        <button className="danger" onClick={() => deleteConversation(menuConversation)}>删除对话</button>
      </section>}
    </div>}
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

  return <section className="update-card"><strong>应用更新</strong><p>主动检查并拉取最新网页版本，不会删除角色、聊天记录或本地设置。</p><button onClick={refresh} disabled={state === 'checking'}>{state === 'checking' ? '正在检查更新…' : state === 'error' ? '更新失败，点我重试' : '强制刷新到最新版'}</button></section>
}

function EditablePage({ title, value, onChange, onBack, name, onName }: { title: string; value: string; onChange: (value: string) => void; onBack: () => void; name?: string; onName?: (value: string) => void }) {
  return <><BackHeader title={title} onBack={onBack} action={<span className="saved-label">自动保存</span>} /><section className="content-stack form-stack">{onName && <label>名称<input value={name} onChange={(e) => onName(e.target.value)} /></label>}<label>{title}内容<textarea rows={14} value={value} onChange={(e) => onChange(e.target.value)} placeholder={`填写${title}内容……`} /></label><div className="privacy-note">内容会自动保存在当前设备。</div></section></>
}

function RangeRow({ label, hint, value, min, max, step, onChange }: { label: string; hint?: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <div className="range-row"><div><strong>{label}</strong>{hint && <small>{hint}</small>}</div><div className="range-controls"><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /><output>{Number.isInteger(value) ? value : value.toFixed(2)}</output></div></div>
}

export default App
