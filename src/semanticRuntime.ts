/**
 * 语义召回的接线层：配置、后台增量索引调度、给聊天提供「本对话」查询。
 * 开关关着（或没有可用渠道）时，所有入口直接返回：不发请求、不开向量库，聊天和原来完全一样。
 */
import type { ApiChannel } from './apiChannels'
import { embedTexts, SILICONFLOW_BASE_URL } from './semanticEmbeddings'
import { buildAllSegments, type SegmentConversation, type SegmentMessage } from './semanticSegments'
import { idbVectorStore, type VectorRecord, type VectorStore } from './semanticVectorDb'
import { backoffFor, runIndexPass, TRANSIENT_BACKOFF_MS } from './semanticIndex'
import {
  SEMANTIC_CANDIDATES,
  SEMANTIC_TIMEOUT_SKIP_MS,
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
  if (cache?.model !== model) return
  records.forEach((record) => { if (record.conversationId === cache!.conversationId) cache!.records.set(record.key, record) })
}

function cacheRemove(model: string, keys: string[]) {
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

/* ---------------- 后台增量索引 ---------------- */

function gatherSegments(model: string) {
  // 只索引剧情对话（单聊 / 群聊）；小手机不进向量库。
  const conversations = (sources?.conversations() ?? []).filter((conversation) => !conversation.phone)
  return buildAllSegments(conversations, model)
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
    const segments = gatherSegments(model)
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
    })
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
    const segments = gatherSegments(model)
    const keys = await vectorStore.keys(model)
    const indexed = segments.filter((segment) => keys.has(segment.key)).length
    const inBackoff = backoffUntil > Date.now()
    setProgress({ indexed, total: segments.length, backoffUntil: inBackoff ? backoffUntil : undefined })
    if (autoResume && indexed < segments.length && !inBackoff && !running) scheduleSemanticIndex(500)
  } catch {
    /* 统计失败不影响使用 */
  }
}
