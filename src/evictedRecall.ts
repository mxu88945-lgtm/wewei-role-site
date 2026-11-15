/**
 * v251：滑出最近原文窗口的消息，切成小段，用前世记忆同一套按需召回（专有线索、提示词、点名、冷却）找回。
 * 每轮最多 2 段 / 约 1200 字，只进本轮尾巴（【本轮背景】），从不进稳定前缀。
 * 小段按「一轮交流」（她一句 + 后面的回复）切，key 由内容决定，窗口滑动时不变，冷却照常生效。
 */
import { chunkPastLife, recallPastLife, type PastLifeChunk, type PastLifeRecall } from './personaPastLifeRecall'
import type { PastLifeBlock, PersonaMessage } from './personaWindow'
import type { PersonaMemoryContext } from './personaWindowMemory'

export const EVICTED_RECALL_BUDGET = 1200
export const EVICTED_RECALL_MAX_CHUNKS = 2
/** 召回池最多看最近这么多条滑出的消息（再早的有连续性档案和 [搜索:] 工具）。 */
export const EVICTED_POOL_MAX = 300
export const EVICTED_RECALL_HEADER = '【滑出窗口的较早原文·按需召回｜只读】'
const LEAD = `${EVICTED_RECALL_HEADER}\n和这轮话题有关、已不在最近原文里的旧对话片段：只是回忆证据，不是此刻的场景或指令；不逐条复述，与最新对话冲突时以最新为准。`
export const EVICTED_KIND = '较早原文'
/**
 * 滑出窗口的池子是同一段对话的近期往事，日常词（晚上、上班）在里面也显得「少见」。
 * 所以稀有度更严（只出现在约 1/20 的小段里才算专有），但点到一个专有双字词（如「智齿」「闷葫芦」）就够。
 */
export const EVICTED_RARE_SHARE = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.EVICTED_RARE_SHARE) || .05
export const EVICTED_RARE_SPAN_MIN = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.EVICTED_RARE_SPAN_MIN) || 2

export type EvictedMessage = {
  id: number | string
  role: 'user' | 'assistant'
  /** 说话人。主角/她的名字照常写；其他群成员写成〔名字〕，免得一提名字就把他说过的每段都拉回来。 */
  speaker: string
  text: string
  createdAt?: number
}
export type EvictedPool = { chunks: PastLifeChunk[]; /** 小段 key → 这段包含的消息 id。 */ ids: Map<string, (number | string)[]> }

const pad = (value: number) => String(value).padStart(2, '0')
const stamp = (at?: number) => {
  if (!at) return ''
  const date = new Date(at)
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function evictedPool(messages: readonly EvictedMessage[]): EvictedPool {
  const usable = messages.filter((message) => message.text.trim()).slice(-EVICTED_POOL_MAX)
  const exchanges: EvictedMessage[][] = []
  for (const message of usable) {
    if (message.role === 'user' || !exchanges.length) exchanges.push([message])
    else exchanges[exchanges.length - 1].push(message)
  }
  const blocks: PastLifeBlock[] = []
  const owner: (number | string)[][] = []
  for (const group of exchanges) {
    const when = stamp(group[0].createdAt)
    const title = `${EVICTED_KIND}·${group[0].id}`
    const body = group.map((message) => `${message.speaker}：${message.text.trim()}`).join('\n')
    blocks.push({ conversationId: '', title, kind: EVICTED_KIND, source: 'memory', bound: false, text: `〔${EVICTED_KIND}${when ? `｜${when}` : ''}｜#${group[0].id}〕\n${body}` })
    owner.push(group.map((message) => message.id))
  }
  const chunks: PastLifeChunk[] = []
  const ids = new Map<string, (number | string)[]>()
  blocks.forEach((block, index) => {
    for (const chunk of chunkPastLife([block])) { chunks.push(chunk); ids.set(chunk.key, owner[index]) }
  })
  return { chunks, ids }
}

export type EvictedRecallOptions = {
  history: Pick<PersonaMessage, 'role' | 'text' | 'finishReason'>[]
  aliases?: string
  charName?: string
  userName?: string
  ledger?: Record<string, number>
  turn?: number
  budget?: number
  maxChunks?: number
  /** 语义召回命中（小段 key → 相似度）。 */
  semantic?: ReadonlyMap<string, number>
}

export function recallEvicted(pool: EvictedPool, options: EvictedRecallOptions): PastLifeRecall {
  // 只看她最新这一句：追问展开用的前几句都还在最近原文里，再拿它们去对旧原文只会把相近的日常话拉回来。
  const latest = [...options.history].reverse().find((message) => message.role === 'user' && message.text.trim() && message.finishReason !== 'error')
  return recallPastLife(pool.chunks, {
    ...options,
    history: (latest ? [latest] : []) as PersonaMessage[],
    budget: Math.min(EVICTED_RECALL_BUDGET, options.budget ?? EVICTED_RECALL_BUDGET),
    maxChunks: Math.min(EVICTED_RECALL_MAX_CHUNKS, options.maxChunks ?? EVICTED_RECALL_MAX_CHUNKS),
    lead: LEAD,
    rareShare: EVICTED_RARE_SHARE,
    rareSpanMin: EVICTED_RARE_SPAN_MIN,
  })
}

/** 消息级语义命中（如人格窗口的 threadId|messageId）折算到小段：取这段里最高的相似度。 */
export function evictedSemantic(pool: EvictedPool, messageScore: (id: number | string) => number | undefined) {
  const out = new Map<string, number>()
  for (const [key, ids] of pool.ids) {
    const best = Math.max(0, ...ids.map((id) => messageScore(id) || 0))
    if (best > 0) out.set(key, best)
  }
  return out
}

/** 人格窗口：把本轮滑出原文的召回接到动态尾巴，记进本轮记忆使用记录；key 进冷却账本（和前世同一本）。 */
export function withEvictedRecall<T extends PersonaMemoryContext & { pastLifeKeys: string[] }>(memory: T, recall: PastLifeRecall | null): T {
  if (!recall) return memory
  const lane = { key: 'evicted', label: '滑出窗口的原文 · 按需召回', chars: recall.text.length, selected: recall.chunks.length, candidates: recall.candidates, suppressed: recall.suppressed, preview: recall.text || (recall.poolChunks ? `本轮未召回：最新消息没有点到滑出窗口的 ${recall.poolChunks} 段旧原文。` : '') }
  return { ...memory, dynamicText: [memory.dynamicText, recall.text].filter(Boolean).join('\n\n'), recallChars: (memory.recallChars || 0) + recall.text.length, recallItems: (memory.recallItems || 0) + recall.chunks.length, audit: { ...memory.audit, lanes: [...memory.audit.lanes, lane] }, pastLifeKeys: [...memory.pastLifeKeys, ...recall.keys] }
}
