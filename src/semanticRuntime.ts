/**
 * 语义召回的接线层：配置、后台增量索引调度、给聊天提供「本对话」查询。
 * 开关关着（或没有可用渠道）时，所有入口直接返回：不发请求、不开向量库，聊天和原来完全一样。
 */
import type { ApiChannel } from './apiChannels'
import { embedTexts, SILICONFLOW_BASE_URL } from './semanticEmbeddings'
import { buildAllSegments, segmentConversation, segmentKey, type Segment, type SegmentConversation, type SegmentMessage } from './semanticSegments'
import { cosine, idbVectorStore, normalize, type VectorRecord, type VectorStore } from './semanticVectorDb'
import { getPersonaState, isPersonaStoreHydrated } from './personaWindowStore'
import { memorySemanticText, type PersonaSemanticHits } from './personaMemoryRank'
import type { PersonaMessage, PersonaWindow } from './personaWindow'
import type { PersonaSemanticInput } from './personaWindowRuntime'
import { personaReplyText } from './personaWindowPresentation'
import { stripTurnContext } from './promptTail'
import { backoffFor, runIndexPass, TRANSIENT_BACKOFF_MS } from './semanticIndex'
import {
  SEMANTIC_CANDIDATES,
  SEMANTIC_QUERY_TIMEOUT_MS,
  SEMANTIC_THRESHOLD,
  SEMANTIC_TIMEOUT_SKIP_MS,
  topSemantic,
  withTimeout,
  SEMANTIC_TOP_K,
  SemanticTimeoutError,
  renderSemanticRecall,
  selectTurnHits,
  semanticQueryText,
  semanticSearch,
} from './semanticRecall'

export const SEMANTIC_CONFIG_KEY = 'weijing.semanticRecall'
export const DEFAULT_EMBED_MODEL = 'BAAI/bge-m3'
/** 后台每批嵌入的单次请求超时 */
const INDEX_REQUEST_TIMEOUT_MS = 60 * 1000

export type SemanticConfig = { enabled: boolean; channelId: string; model: string }
export type SemanticProgress = { indexed: number; total: number; running: boolean; error?: string; backoffUntil?: number }

export const DEFAULT_SEMANTIC: SemanticConfig = { enabled: false, channelId: '', model: DEFAULT_EMBED_MODEL }

type Sources = { conversations: () => Array<SegmentConversation & { phone?: unknown }>; channels: () => ApiChannel[] }

/* ---------------- 小型外部 store（设置页用 useSyncExternalStore 订阅） ---------------- */

function readConfig(): SemanticConfig {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(SEMANTIC_CONFIG_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<SemanticConfig>) : {}
    return {
      enabled: parsed.enabled === true,
      channelId: typeof parsed.channelId === 'string' ? parsed.channelId : '',
      model: typeof parsed.model === 'string' && parsed.model.trim() ? parsed.model : DEFAULT_EMBED_MODEL,
    }
  } catch {
    return { ...DEFAULT_SEMANTIC }
  }
}

let state: { config: SemanticConfig; progress: SemanticProgress } = {
  config: readConfig(),
  progress: { indexed: 0, total: 0, running: false },
}
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

export function subscribeSemantic(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function getSemanticState() {
  return state
}

export function updateSemanticConfig(patch: Partial<SemanticConfig>): void {
  const config = { ...state.config, ...patch }
  try { localStorage.setItem(SEMANTIC_CONFIG_KEY, JSON.stringify(config)) } catch { /* 存不下也不影响本次使用 */ }
  state = { ...state, config }
  emit()
}

function setProgress(patch: Partial<SemanticProgress>): void {
  state = { ...state, progress: { ...state.progress, ...patch } }
  emit()
}

/* ---------------- 数据来源（App 注册） ---------------- */

let sources: Sources | null = null
let vectorStore: VectorStore = idbVectorStore
export function registerSemanticSources(next: Sources): void {
  sources = next
}

/** 测试用：重置模块内状态 */
export function resetSemanticRuntimeForTest(store?: VectorStore): void {
  state = { config: readConfig(), progress: { indexed: 0, total: 0, running: false } }
  sources = null
  cache = null
  personaCache = null
  chunkVectors.clear()
  querySkipUntil = 0
  backoffUntil = 0
  running = false
  pending = false
  if (timer) clearTimeout(timer)
  timer = undefined
  if (resumeTimer) clearTimeout(resumeTimer)
  resumeTimer = undefined
  vectorStore = store ?? idbVectorStore
}


/** 选中的渠道；没选时默认用硅基流动渠道（地址里带 siliconflow 的第一个）。 */
export function semanticChannel(config: SemanticConfig = state.config, channels: ApiChannel[] = sources?.channels() ?? []): ApiChannel | undefined {
  const picked = config.channelId ? channels.find((channel) => channel.id === config.channelId) : undefined
  if (picked) return picked
  return channels.find((channel) => /siliconflow/i.test(channel.baseUrl) || channel.baseUrl.trim().replace(/\/+$/, '') === SILICONFLOW_BASE_URL)
}

/** 开关开着、渠道有 Key、模型填了，才算启用。 */
export function isSemanticReady(): boolean {
  const config = state.config
  if (!config.enabled || !config.model.trim() || !sources) return false
  const channel = semanticChannel(config)
  return Boolean(channel && channel.apiKey.trim() && channel.protocol !== 'anthropic')
}

/** 设置页「测试」：嵌入一句话，返回维度。 */
export async function testSemanticEmbedding(channel: ApiChannel, model: string): Promise<number> {
  const [vec] = await embedTexts(channel, model.trim() || DEFAULT_EMBED_MODEL, ['测试一下语义召回'])
  return vec.length
}

/* ---------------- 向量缓存（只缓存当前对话，召回时不必每轮读库） ---------------- */

let cache: { model: string; conversationId: string; records: Map<string, VectorRecord> } | null = null

async function loadRecords(model: string, conversationId: string): Promise<Iterable<VectorRecord>> {
  if (cache?.model === model && cache.conversationId === conversationId) return cache.records.values()
  const list = await vectorStore.forConversation(model, conversationId)
  cache = { model, conversationId, records: new Map(list.map((record) => [record.key, record])) }
  return cache.records.values()
}

function cachePut(model: string, records: VectorRecord[]) {
  if (personaCache?.model === model) records.forEach((record) => personaCache!.byConv.get(record.conversationId)?.set(record.key, record))
  if (cache?.model !== model) return
  records.forEach((record) => { if (record.conversationId === cache!.conversationId) cache!.records.set(record.key, record) })
}

function cacheRemove(model: string, keys: string[]) {
  if (personaCache?.model === model) personaCache.byConv.forEach((map) => keys.forEach((key) => map.delete(key)))
  if (cache?.model !== model) return
  keys.forEach((key) => cache!.records.delete(key))
}

/* ---------------- 查询（每轮发送前） ---------------- */

let querySkipUntil = 0

export type ConversationRecallInput = {
  conversation: { id: string; messages: SegmentMessage[] }
  /** 本轮会原样带进上下文的消息 id（不重复召回） */
  inContextIds: Set<number>
  speakerName: (message: SegmentMessage) => string
  now?: number
}

/**
 * 当前对话的语义召回块。关着时立刻返回 ''、不发请求；
 * 失败或 4 秒超时也返回 ''（超时后 2 分钟内直接跳过，不再等）。
 */
export async function semanticRecallForConversation(input: ConversationRecallInput): Promise<string> {
  try {
    if (!isSemanticReady()) return ''
    const now = input.now ?? Date.now()
    if (querySkipUntil > now) return ''
    const config = state.config
    const channel = semanticChannel(config)!
    const model = config.model.trim()
    const userTexts = input.conversation.messages.filter((message) => message.role === 'user' && !message.phoneNotice).slice(-2).map((message) => message.text || '')
    const query = semanticQueryText(userTexts)
    if (!query) return ''
    const hits = await semanticSearch(query, {
      conversationId: input.conversation.id,
      embedQuery: async (text, signal) => (await embedTexts(channel, model, [text], signal))[0],
      loadRecords: () => loadRecords(model, input.conversation.id),
      topK: SEMANTIC_CANDIDATES,
      onError: (error) => {
        if (error instanceof SemanticTimeoutError) querySkipUntil = Date.now() + SEMANTIC_TIMEOUT_SKIP_MS
      },
    })
    const selected = selectTurnHits(hits, input.conversation, input.inContextIds, SEMANTIC_TOP_K)
    return renderSemanticRecall(selected, input.conversation, input.inContextIds, input.speakerName)
  } catch {
    return ''
  }
}

/* ---------------- 人格窗口（v236） ---------------- */

let personaCache: { model: string; byConv: Map<string, Map<string, VectorRecord>> } | null = null

async function loadPersonaRecords(model: string, conversationId: string): Promise<VectorRecord[]> {
  if (personaCache?.model !== model) personaCache = { model, byConv: new Map() }
  const hit = personaCache.byConv.get(conversationId)
  if (hit) return [...hit.values()]
  const list = await vectorStore.forConversation(model, conversationId)
  personaCache.byConv.set(conversationId, new Map(list.map((record) => [record.key, record])))
  return list
}

/** 前世记忆 / 故事背景的小段会随剧情变，只在内存里存向量（按 模型|人格|小段 key），不进库、不参与清理。 */
const chunkVectors = new Map<string, Float32Array>()
const CHUNK_VECTOR_LIMIT = 3000
let warming = false

async function warmChunkVectors(channel: ApiChannel, model: string, personaId: string, chunks: Array<{ key: string; text: string }>) {
  if (warming) return
  const missing = chunks.filter((chunk) => !chunkVectors.has(`${model}|${personaId}|${chunk.key}`)).slice(0, 64)
  if (!missing.length) return
  warming = true
  try {
    for (let index = 0; index < missing.length; index += 32) {
      const batch = missing.slice(index, index + 32)
      const vectors = await embedWithTimeout(channel, model, batch.map((chunk) => chunk.text.slice(0, 1200)))
      batch.forEach((chunk, at) => { if (vectors[at]) chunkVectors.set(`${model}|${personaId}|${chunk.key}`, normalize(vectors[at])) })
      while (chunkVectors.size > CHUNK_VECTOR_LIMIT) chunkVectors.delete(chunkVectors.keys().next().value as string)
    }
  } catch {
    /* 下次发送再补 */
  } finally {
    warming = false
  }
}

/**
 * 人格窗口的语义召回：用她最新一句 + 他上一条回复做一次查询向量，
 * 只在「这个人格」的窗口原文（按旧文检索范围）、他的长期记忆、本轮素材池里找。
 * 关着时立刻 null；失败或 4 秒超时也 null（之后 2 分钟直接跳过），人格窗口自动回退到线索 + 关键词。
 */
export async function semanticRecallForPersona(input: PersonaSemanticInput): Promise<PersonaSemanticHits | null> {
  try {
    if (!isSemanticReady()) return null
    const now = Date.now()
    if (querySkipUntil > now) return null
    const query = Array.from(input.query.replace(/\s+/g, ' ').trim()).slice(-500).join('')
    if (!query) return null
    const config = state.config
    const channel = semanticChannel(config)!
    const model = config.model.trim()
    const persona = input.persona
    const threads = persona.recallScope === 'thread' ? [input.thread] : persona.threads.map((thread) => thread.id === input.thread.id ? input.thread : thread)
    const memoryConv = `${PERSONA_MEMORY_NS}${persona.id}`
    const [vector, threadRecords, memoryRecords] = await Promise.all([
      withTimeout(async (signal) => (await embedTexts(channel, model, [query], signal))[0], SEMANTIC_QUERY_TIMEOUT_MS),
      Promise.all(threads.map((thread) => loadPersonaRecords(model, `${PERSONA_THREAD_NS}${thread.id}`))),
      loadPersonaRecords(model, memoryConv),
    ])
    const q = normalize(vector)
    const messages = new Map<string, number>()
    threads.forEach((thread, index) => {
      const conversationId = `${PERSONA_THREAD_NS}${thread.id}`
      const inContext = new Set(thread.messages.filter((message) => input.inContextKeys.has(`${thread.id}|${message.id}`)).map((message) => message.id))
      const hits = topSemantic(q, threadRecords[index], { conversationId, topK: SEMANTIC_CANDIDATES })
      const conversation = { id: conversationId, messages: thread.messages.map(personaSegmentMessage) }
      for (const hit of selectTurnHits(hits, conversation, inContext, 6)) {
        for (const id of hit.record.msgIds) if (!inContext.has(id)) messages.set(`${thread.id}|${id}`, Math.max(messages.get(`${thread.id}|${id}`) || 0, hit.score))
      }
    })
    // 长期记忆：向量记录的原文要和当前这条记忆一字不差（改过的旧向量不算）。
    const byText = new Map(persona.memories.map((entry) => [memorySemanticText(entry), entry.id]))
    const memories = new Map<string, number>()
    topSemantic(q, memoryRecords, { conversationId: memoryConv, topK: 12 }).forEach((hit) => {
      const id = byText.get(hit.record.text)
      if (id) memories.set(id, hit.score)
    })
    const pool = [...(input.pools.pastLife || []), ...input.pools.background]
    const chunks = new Map<string, number>()
    for (const chunk of pool) {
      const vec = chunkVectors.get(`${model}|${persona.id}|${chunk.key}`)
      if (!vec || vec.length !== q.length) continue
      const score = cosine(q, vec)
      if (score >= SEMANTIC_THRESHOLD) chunks.set(chunk.key, score)
    }
    // 没算过向量的小段在后台补上（下一轮就能用），这一轮不等。
    void warmChunkVectors(channel, model, persona.id, pool)
    scheduleSemanticIndex(20_000)
    return { messages, memories, chunks }
  } catch (error) {
    if (error instanceof SemanticTimeoutError) querySkipUntil = Date.now() + SEMANTIC_TIMEOUT_SKIP_MS
    return null
  }
}

/* ---------------- 后台增量索引 ---------------- */

/**
 * v236：人格窗口也进向量库，但各有各的命名空间——窗口原文 persona:<窗口id>、长期记忆 persona-mem:<人格id>。
 * 人格数据还没从本地读出来时返回 null：这一轮先不建也不清理，免得把人格的向量当成过期删掉。
 */
function gatherSegments(model: string): { segments: Segment[]; complete: boolean } {
  // 只索引剧情对话（单聊 / 群聊）；小手机不进向量库。
  const conversations = (sources?.conversations() ?? []).filter((conversation) => !conversation.phone)
  const complete = isPersonaStoreHydrated()
  return { segments: [...buildAllSegments(conversations, model), ...(complete ? personaSegments(getPersonaState().personas, model) : [])], complete }
}

export const PERSONA_THREAD_NS = 'persona:'
export const PERSONA_MEMORY_NS = 'persona-mem:'

const personaSegmentMessage = (message: PersonaMessage): SegmentMessage => ({ id: message.id, role: message.role, text: message.finishReason === 'error' ? '' : message.role === 'assistant' ? personaReplyText(message.text) : stripTurnContext(message.text) })

/** 人格窗口的片段：每扇窗口单独切（和剧情同一套规则），每条长期记忆一段（线索 + 标题 + 本体）。 */
export function personaSegments(personas: readonly PersonaWindow[], model: string): Segment[] {
  const out: Segment[] = []
  const seen = new Set<string>()
  for (const persona of personas) {
    for (const thread of persona.threads) {
      for (const segment of segmentConversation({ id: `${PERSONA_THREAD_NS}${thread.id}`, messages: thread.messages.map(personaSegmentMessage) }, model)) {
        if (!seen.has(segment.key)) { seen.add(segment.key); out.push(segment) }
      }
    }
    const conversationId = `${PERSONA_MEMORY_NS}${persona.id}`
    for (const entry of persona.memories) {
      const text = memorySemanticText(entry)
      const key = segmentKey(model, conversationId, text)
      if (!seen.has(key)) { seen.add(key); out.push({ key, conversationId, text, msgIds: [] }) }
    }
  }
  return out
}

/** 退避只存在内存里：刷新页面就重新试。 */
let backoffUntil = 0
let running = false
let pending = false
let timer: ReturnType<typeof setTimeout> | undefined
let resumeTimer: ReturnType<typeof setTimeout> | undefined

function embedWithTimeout(channel: ApiChannel, model: string, texts: string[]): Promise<number[][]> {
  const controller = new AbortController()
  const handle = setTimeout(() => controller.abort(), INDEX_REQUEST_TIMEOUT_MS)
  return embedTexts(channel, model, texts, controller.signal)
    .catch((error) => {
      if (controller.signal.aborted) throw new Error('向量请求超时')
      throw error
    })
    .finally(() => clearTimeout(handle))
}

/** 限速 / 超时 / 5xx / 断网：歇 1 分钟后自动续建；其他错误歇 30 分钟（只记在内存里）。 */
function enterBackoff(message: string) {
  const wait = backoffFor(message)
  backoffUntil = Date.now() + wait
  setProgress({ error: message, backoffUntil })
  if (wait === TRANSIENT_BACKOFF_MS) {
    if (resumeTimer) clearTimeout(resumeTimer)
    resumeTimer = setTimeout(() => { resumeTimer = undefined; scheduleSemanticIndex(0) }, wait + 1000)
  }
}

async function runOnce(): Promise<void> {
  if (!isSemanticReady()) return
  if (backoffUntil > Date.now()) {
    setProgress({ backoffUntil })
    return
  }
  const config = state.config
  const channel = semanticChannel(config)!
  const model = config.model.trim()
  running = true
  setProgress({ running: true, error: undefined })
  try {
    const { segments, complete } = gatherSegments(model)
    const result = await runIndexPass(segments, model, {
      store: vectorStore,
      embed: (texts) => embedWithTimeout(channel, model, texts),
      shouldContinue: () => {
        const current = state.config
        return current.enabled && semanticChannel(current)?.id === channel.id && current.model.trim() === model
      },
      onProgress: (indexed, total) => setProgress({ indexed, total }),
      onPut: (records) => cachePut(model, records),
      onRemove: (keys) => cacheRemove(model, keys),
    }, { prune: complete })
    if (result.error) {
      enterBackoff(result.error)
    } else {
      backoffUntil = 0
      setProgress({ backoffUntil: undefined })
    }
  } catch (error) {
    enterBackoff((error as Error)?.message || '索引失败')
  } finally {
    running = false
    setProgress({ running: false })
  }
}

/** 安排一次后台增量索引（默认 3 秒后）。正在跑就记一笔，跑完再补一次。关着时什么也不做。 */
export function scheduleSemanticIndex(delayMs = 3000): void {
  if (!isSemanticReady()) return
  if (running) {
    pending = true
    return
  }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = undefined
    void runOnce().then(() => {
      if (pending) {
        pending = false
        scheduleSemanticIndex(5000)
      }
    })
  }, delayMs)
}

/** 「重建索引」：清空当前模型的向量，取消退避，马上重新建。 */
export async function rebuildSemanticIndex(): Promise<void> {
  const model = state.config.model.trim()
  if (!model) return
  await vectorStore.clear(model)
  if (cache?.model === model) cache = null
  backoffUntil = 0
  setProgress({ indexed: 0, error: undefined, backoffUntil: undefined })
  scheduleSemanticIndex(0)
}

/**
 * 设置页打开时：数一下「已建 N/M 段」（不发请求）；没建完、也不在退避里，就自动续建。
 */
export async function refreshSemanticCounts(autoResume = true): Promise<void> {
  const model = state.config.model.trim()
  if (!model || !sources) return
  try {
    const { segments } = gatherSegments(model)
    const keys = await vectorStore.keys(model)
    const indexed = segments.filter((segment) => keys.has(segment.key)).length
    const inBackoff = backoffUntil > Date.now()
    setProgress({ indexed, total: segments.length, backoffUntil: inBackoff ? backoffUntil : undefined })
    if (autoResume && indexed < segments.length && !inBackoff && !running) scheduleSemanticIndex(500)
  } catch {
    /* 统计失败不影响使用 */
  }
}
