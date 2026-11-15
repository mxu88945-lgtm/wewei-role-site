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
import { chunkScoringUnits } from './personaPastLifeRecall'
import { stripTurnContext } from './promptTail'
import { backoffFor, CHUNK_KEY_PREFIX, runIndexPass, TRANSIENT_BACKOFF_MS } from './semanticIndex'
import {
  SEMANTIC_CANDIDATES,
  SEMANTIC_QUERY_TIMEOUT_MS,
  SEMANTIC_TIMEOUT_SKIP_MS,
  messageScores,
  topSemantic,
  withTimeout,
  SEMANTIC_TOP_K,
  SemanticTimeoutError,
  renderSemanticRecall,
  selectTurnHits,
  semanticQueryText,
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
  chunkNamespaces.clear()
  warming = false
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
  /** 本轮会原样带进上下文的消息 id（不重复召回）。v252：也包括滑出窗口、交给混合召回处理的那段。 */
  inContextIds: Set<number>
  speakerName: (message: SegmentMessage) => string
  now?: number
  /** v252：要打分的召回小段（如本会话角色核心记忆的较早条目），按 namespace 缓存向量。 */
  chunks?: { namespace: string; items: Array<{ key: string; text: string }> }
}

/** v252：长剧情一轮的语义结果：深处旧原文块（滑出窗口那段之外）+ 每条消息的原始分（给滑出窗口的混合召回）+ 小段分。 */
export type ConversationSemantic = { text: string; messageScores: Map<number, number>; chunkScores: Map<string, number> }
export const EMPTY_CONVERSATION_SEMANTIC: ConversationSemantic = { text: '', messageScores: new Map(), chunkScores: new Map() }

/** v252：查询向量——只嵌她最新一句；3 秒超时（之后 2 分钟直接跳过）。失败返回 null。 */
async function embedQuery(channel: ApiChannel, model: string, text: string): Promise<Float32Array | null> {
  try {
    const vector = await withTimeout(async (signal) => (await embedTexts(channel, model, [text], signal))[0], SEMANTIC_QUERY_TIMEOUT_MS)
    return vector?.length ? normalize(vector) : null
  } catch (error) {
    if (error instanceof SemanticTimeoutError) querySkipUntil = Date.now() + SEMANTIC_TIMEOUT_SKIP_MS
    return null
  }
}

/**
 * 当前对话的语义召回。关着时立刻返回空、不发请求；失败或 3 秒超时也返回空（超时后 2 分钟内直接跳过）。
 * v252：一轮只嵌一次她最新一句；旧原文块只放滑出窗口那段之外（更深处）的命中，不和滑出窗口的召回重复。
 */
export async function semanticRecallForConversation(input: ConversationRecallInput): Promise<ConversationSemantic> {
  try {
    if (!isSemanticReady()) return EMPTY_CONVERSATION_SEMANTIC
    const now = input.now ?? Date.now()
    if (querySkipUntil > now) return EMPTY_CONVERSATION_SEMANTIC
    const config = state.config
    const channel = semanticChannel(config)!
    const model = config.model.trim()
    const userTexts = input.conversation.messages.filter((message) => message.role === 'user' && !message.phoneNotice).slice(-1).map((message) => message.text || '')
    const query = semanticQueryText(userTexts)
    if (!query) return EMPTY_CONVERSATION_SEMANTIC
    const [q, records] = await Promise.all([embedQuery(channel, model, query), loadRecords(model, input.conversation.id)])
    if (!q) return EMPTY_CONVERSATION_SEMANTIC
    const list = [...records]
    const hits = topSemantic(q, list, { conversationId: input.conversation.id, topK: SEMANTIC_CANDIDATES })
    const selected = selectTurnHits(hits, input.conversation, input.inContextIds, SEMANTIC_TOP_K)
    const chunkScores = input.chunks ? await scoreChunks(channel, model, input.chunks.namespace, input.chunks.items, q) : new Map<string, number>()
    return { text: renderSemanticRecall(selected, input.conversation, input.inContextIds, input.speakerName), messageScores: messageScores(q, list, input.conversation), chunkScores }
  } catch {
    return EMPTY_CONVERSATION_SEMANTIC
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

/**
 * v252：召回小段（前世记忆、故事背景、核心记忆较早条目）的向量：算过一次就存进向量库（key 以 chunk| 开头，
 * 对话 id = chunk:<namespace>），刷新页面也不用重嵌；内存里按 模型|namespace|小段 key 缓存。
 * 小段换了内容 key 就变（内容哈希），旧的在下次补算时按 namespace 清掉。
 */
const chunkVectors = new Map<string, Float32Array>()
const chunkNamespaces = new Set<string>()
const CHUNK_VECTOR_LIMIT = 6000
const CHUNK_WARM_MAX = 128
let warming = false
const chunkCacheKey = (model: string, namespace: string, key: string) => `${model}|${namespace}|${key}`
const chunkRecordKey = (model: string, namespace: string, key: string) => `${CHUNK_KEY_PREFIX}${model}|${namespace}|${key}`
const chunkConversation = (namespace: string) => `chunk:${namespace}`

async function loadChunkNamespace(model: string, namespace: string) {
  const id = `${model}|${namespace}`
  if (chunkNamespaces.has(id)) return
  chunkNamespaces.add(id)
  try {
    const records = await vectorStore.forConversation(model, chunkConversation(namespace))
    const prefix = chunkRecordKey(model, namespace, '')
    for (const record of records) if (record.key.startsWith(prefix)) chunkVectors.set(chunkCacheKey(model, namespace, record.key.slice(prefix.length)), record.vec)
  } catch { /* 库打不开：只用内存，下次再补 */ }
}

async function warmChunkVectors(channel: ApiChannel, model: string, namespace: string, chunks: Array<{ key: string; text: string }>) {
  if (warming) return
  const missing = chunks.filter((chunk) => !chunkVectors.has(chunkCacheKey(model, namespace, chunk.key))).slice(0, CHUNK_WARM_MAX)
  if (!missing.length) return
  warming = true
  try {
    for (let index = 0; index < missing.length; index += 32) {
      const batch = missing.slice(index, index + 32)
      const vectors = await embedWithTimeout(channel, model, batch.map((chunk) => chunk.text.slice(0, 600)))
      const records: VectorRecord[] = []
      batch.forEach((chunk, at) => {
        if (!vectors[at]?.length) return
        const vec = normalize(vectors[at])
        chunkVectors.set(chunkCacheKey(model, namespace, chunk.key), vec)
        records.push({ key: chunkRecordKey(model, namespace, chunk.key), model, conversationId: chunkConversation(namespace), dim: vec.length, vec, text: '', msgIds: [], createdAt: Date.now() })
      })
      try { await vectorStore.put(records) } catch { /* 存不进库：这次会话内存里照用 */ }
      while (chunkVectors.size > CHUNK_VECTOR_LIMIT) chunkVectors.delete(chunkVectors.keys().next().value as string)
    }
    // 这个 namespace 里已经不在素材里的旧小段，从库里清掉。
    const current = new Set(chunks.map((chunk) => chunkRecordKey(model, namespace, chunk.key)))
    const stored = await vectorStore.forConversation(model, chunkConversation(namespace)).catch(() => [] as VectorRecord[])
    const stale = stored.map((record) => record.key).filter((key) => !current.has(key))
    if (stale.length && chunks.length) await vectorStore.remove(stale).catch(() => undefined)
  } catch {
    /* 下次发送再补 */
  } finally {
    warming = false
  }
}

/**
 * v252：小段的原始相似度 = 段里各「行单元」的最高分（有向量的都给）；没算过的单元在后台补上（下一轮就能用），这一轮不等。
 * 只要段里有一个单元算好了就给分（其余单元下轮补齐）。
 */
async function scoreChunks(channel: ApiChannel, model: string, namespace: string, chunks: Array<{ key: string; text: string }>, q: Float32Array) {
  await loadChunkNamespace(model, namespace)
  const out = new Map<string, number>()
  const units: Array<{ key: string; text: string }> = []
  for (const chunk of chunks) {
    let best: number | undefined
    for (const unit of chunkScoringUnits(chunk)) {
      units.push(unit)
      const vec = chunkVectors.get(chunkCacheKey(model, namespace, unit.key))
      if (vec && vec.length === q.length) best = Math.max(best ?? -1, cosine(q, vec))
    }
    if (best !== undefined) out.set(chunk.key, best)
  }
  void warmChunkVectors(channel, model, namespace, units)
  return out
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
    const [q, threadRecords, memoryRecords] = await Promise.all([
      embedQuery(channel, model, query),
      Promise.all(threads.map((thread) => loadPersonaRecords(model, `${PERSONA_THREAD_NS}${thread.id}`))),
      loadPersonaRecords(model, memoryConv),
    ])
    if (!q) return null
    const messages = new Map<string, number>()
    const scores = new Map<string, number>()
    threads.forEach((thread, index) => {
      const conversationId = `${PERSONA_THREAD_NS}${thread.id}`
      const inContext = new Set(thread.messages.filter((message) => input.inContextKeys.has(`${thread.id}|${message.id}`)).map((message) => message.id))
      const hits = topSemantic(q, threadRecords[index], { conversationId, topK: SEMANTIC_CANDIDATES })
      const conversation = { id: conversationId, messages: thread.messages.map(personaSegmentMessage) }
      for (const hit of selectTurnHits(hits, conversation, inContext, 6)) {
        for (const id of hit.record.msgIds) if (!inContext.has(id)) messages.set(`${thread.id}|${id}`, Math.max(messages.get(`${thread.id}|${id}`) || 0, hit.score))
      }
      // v252：滑出窗口的混合召回要每条消息的原始分（不按阈值删），只算当前窗口。
      if (thread.id === input.thread.id) for (const [id, score] of messageScores(q, threadRecords[index], conversation)) scores.set(`${thread.id}|${id}`, score)
    })
    // 长期记忆：向量记录的原文要和当前这条记忆一字不差（改过的旧向量不算）。
    const byText = new Map(persona.memories.map((entry) => [memorySemanticText(entry), entry.id]))
    const memories = new Map<string, number>()
    topSemantic(q, memoryRecords, { conversationId: memoryConv, topK: 12 }).forEach((hit) => {
      const id = byText.get(hit.record.text)
      if (id) memories.set(id, hit.score)
    })
    // v252：前世记忆 / 故事背景小段给原始分，阈值和线索一起在 recallPastLife 里判（混合召回）。
    const chunks = await scoreChunks(channel, model, persona.id, [...(input.pools.pastLife || []), ...input.pools.background, ...(input.pools.lore || [])], q)
    scheduleSemanticIndex(20_000)
    return { messages, memories, chunks, messageScores: scores }
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
