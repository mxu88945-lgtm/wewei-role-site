/**
 * v226 前世记忆·按需召回。前世记忆不再整段放进稳定前缀：素材切成 300–600 字的小段，
 * 每轮按最新消息（加最近两轮作弱上下文）打分，只把命中的几段接到本轮动态尾巴。
 * 纯函数，不调模型、不改任何会话；冷却沿用人格窗口的 recallLedger。
 */
import type { PastLifeBlock, PastLifeResult, PersonaMessage } from './personaWindow'
import { clipPersonaText, explicitPersonaRecall, personaRecallQuery, personaRecallTokens, semanticScore, PERSONA_RECALL_COOLDOWN, type PersonaMemoryContext } from './personaWindowMemory'

export const PAST_LIFE_CHUNK_MIN = 300
export const PAST_LIFE_CHUNK_MAX = 600
export const PAST_LIFE_RECALL_BUDGET = 1800
export const PAST_LIFE_RECALL_MAX_CHUNKS = 4
export const PAST_LIFE_RECALL_HEADER = '【前世记忆·按需召回｜只读】'
const LEAD = `${PAST_LIFE_RECALL_HEADER}\n和这轮话题有关的过往片段（小手机是过往线上交流；长剧情是你们一起写过的虚构故事，不是此刻）。自然想起即可，不逐条复述；与这扇窗口的记忆或最新对话冲突时，以这扇窗口为准。`
/** 稳定前缀里只留一句指路（不随话题变），告诉模型前世记忆会按需附上。 */
export const PAST_LIFE_POINTER = '【前世记忆｜按需召回】{{char}}在小手机交流与长剧情故事里和{{user}}有过往记录。聊到相关的人、群、剧本或往事时，应用会在本轮附上【前世记忆·按需召回】片段；没附上的细节不要编造，可以用 [搜索:关键词] 查本窗旧文，或如实说记不清。'

export type PastLifeChunk = { key: string; label: string; title: string; kind: string; bound: boolean; names: string[]; text: string }
export type PastLifeRecall = { text: string; chunks: PastLifeChunk[]; keys: string[]; candidates: number; suppressed: number; poolChunks: number; poolChars: number }

const normalized = (value: string) => value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
function hash(value: string) {
  let h = 0x811c9dc5
  for (let index = 0; index < value.length; index++) { h ^= value.charCodeAt(index); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(36)
}

/** 旧接口只给整段文字时，按〔来源〕标题拆回素材段。 */
export function pastLifeBlocksFromText(text: string): PastLifeBlock[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (!/(?:^|\n)〔[^\n]{1,120}〕\n/.test(trimmed)) return [{ conversationId: '', title: '前世记忆', kind: '前世记忆', source: 'memory', bound: false, text: trimmed }]
  return trimmed.split(/\n\n(?=〔[^\n]{1,120}〕\n)/).filter((part) => /^〔[^\n]{1,120}〕/.test(part)).map((part) => {
    const header = part.slice(1, part.indexOf('〕'))
    const bound = /^绑定的(?:剧本|群)｜/.test(header)
    const segments = header.replace(/^绑定的(?:剧本|群)｜/, '').split('｜')
    const kind = segments.length > 1 ? segments[0] : header
    const title = segments.length > 1 ? segments.slice(1).join('｜') : header
    return { conversationId: '', title, kind, source: 'memory' as const, bound, text: part }
  })
}

function splitLong(line: string) {
  if (line.length <= PAST_LIFE_CHUNK_MAX) return [line]
  const out: string[] = []
  let rest = line
  while (rest.length > PAST_LIFE_CHUNK_MAX) {
    const window = rest.slice(0, PAST_LIFE_CHUNK_MAX)
    const cut = Math.max(...['。', '！', '？', '；', '…', '!', '?', ';'].map((mark) => window.lastIndexOf(mark)))
    const at = cut >= PAST_LIFE_CHUNK_MIN ? cut + 1 : PAST_LIFE_CHUNK_MAX
    out.push(clipPersonaText(rest, at))
    rest = rest.slice(clipPersonaText(rest, at).length)
  }
  if (rest.trim()) out.push(rest)
  return out
}

const SUBHEAD = /^[^\s：:·]{1,10}[：:]$/

/** 每段素材按行（记忆条目/段落）切成约 300–600 字的小段，标题行保留在每段开头。 */
export function chunkPastLife(blocks: readonly PastLifeBlock[]): PastLifeChunk[] {
  const chunks: PastLifeChunk[] = []
  for (const block of blocks) {
    const lines = block.text.split('\n')
    const header = /^〔.*〕$/.test(lines[0] || '') ? lines.shift()! : `〔${block.kind}｜${block.title}〕`
    const label = header.replace(/^〔|〕$/g, '')
    const groups: { sub: string; lines: string[] }[] = []
    let sub = '', current: string[] = [], size = 0, currentSub = ''
    const flush = () => { if (current.some((line) => line.trim())) groups.push({ sub: currentSub, lines: current }); current = []; size = 0 }
    for (const raw of lines) {
      if (!raw.trim()) continue
      if (SUBHEAD.test(raw.trim())) {
        if (size >= PAST_LIFE_CHUNK_MIN) flush()
        sub = raw.trim()
        if (!current.length) currentSub = sub
        else { current.push(raw); size += raw.length + 1 }
        continue
      }
      for (const line of splitLong(raw)) {
        if (current.length && size + line.length + 1 > PAST_LIFE_CHUNK_MAX) flush()
        if (!current.length) currentSub = sub
        current.push(line); size += line.length + 1
      }
    }
    flush()
    // 太短的尾巴并回上一段，免得召回半句话。
    const merged: typeof groups = []
    for (const group of groups) {
      const previous = merged[merged.length - 1], length = group.lines.join('\n').length
      if (previous && length < 120 && previous.lines.join('\n').length + length + 1 <= PAST_LIFE_CHUNK_MAX + 150) previous.lines.push(...(group.sub !== previous.sub && group.sub ? [group.sub] : []), ...group.lines)
      else merged.push(group)
    }
    for (const group of merged) {
      const body = `${group.sub && group.lines[0] !== group.sub ? `${group.sub}\n` : ''}${group.lines.join('\n')}`
      chunks.push({ key: `past|${hash(`${label}\n${body}`)}`, label, title: block.title, kind: block.kind, bound: block.bound, names: block.names || [], text: `${header}\n${body}` })
    }
  }
  return chunks
}

export function pastLifeChunksFrom(input: string | PastLifeResult | undefined) {
  if (!input) return []
  if (typeof input === 'string') return chunkPastLife(pastLifeBlocksFromText(input))
  return chunkPastLife(input.blocks?.length ? input.blocks : pastLifeBlocksFromText(input.text))
}

const PAST_CUE = /前世|剧本|剧情|故事|戏里|戏外|群里|群聊|小手机|幕后|那时候|那会儿/
const SPEAKER = /^([^：:\n·〔]{2,12})[：:]/gm
const LABEL_WORDS = new Set(['他记得的事', '那段日子', '经过', '最后聊到的', '最后写到的'])

/** 最新用户消息为主，最近两轮为弱上下文。 */
function recallContext(history: PersonaMessage[]) {
  const usable = history.filter((message) => message.text.trim() && message.finishReason !== 'error')
  const lastUser = usable.map((message) => message.role).lastIndexOf('user')
  const before = usable.slice(Math.max(0, lastUser - 4), Math.max(0, lastUser))
  return before.map((message) => clipPersonaText(message.text, 300)).join('\n')
}

export function recallPastLife(chunks: readonly PastLifeChunk[], options: { history: PersonaMessage[]; aliases?: string; charName?: string; userName?: string; ledger?: Record<string, number>; turn?: number; budget?: number; maxChunks?: number }): PastLifeRecall {
  const poolChars = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0)
  const empty: PastLifeRecall = { text: '', chunks: [], keys: [], candidates: 0, suppressed: 0, poolChunks: chunks.length, poolChars }
  const query = personaRecallQuery(options.history)
  if (!chunks.length || !query.trim()) return empty
  const primary = personaRecallTokens(query, options.aliases)
  const context = [...personaRecallTokens(recallContext(options.history), options.aliases)].filter((token) => !primary.has(token))
  const cue = explicitPersonaRecall(query) || PAST_CUE.test(query)
  const q = normalized(query)
  const skip = new Set([options.charName, options.userName].filter(Boolean).map((name) => normalized(name!)))
  const lowered = chunks.map((chunk) => chunk.text.toLocaleLowerCase())
  // 出现在三分之一以上小段里的词是这批素材的通用词，降权。
  const df = (token: string) => lowered.reduce((sum, text) => sum + (text.includes(token) ? 1 : 0), 0)
  const weight = new Map<string, number>()
  const tokenWeight = (token: string) => {
    if (!weight.has(token)) weight.set(token, (token.length > 2 ? 2 : 1) * (chunks.length >= 3 && df(token) / chunks.length > .34 ? .34 : 1))
    return weight.get(token)!
  }
  const scored = chunks.map((chunk, index) => {
    const text = lowered[index]
    const lexical = [...primary].reduce((sum, token) => sum + (text.includes(token) ? tokenWeight(token) : 0), 0)
    const contextual = Math.min(2, context.reduce((sum, token) => sum + (text.includes(token) ? tokenWeight(token) / 2 : 0), 0))
    const title = normalized(chunk.title)
    const titleHit = title.length >= 2 && q.includes(title)
    const speakers = [...chunk.text.matchAll(SPEAKER)].map((match) => match[1].trim()).filter((name) => !LABEL_WORDS.has(name))
    const names = [...new Set([...chunk.names, ...speakers])].map(normalized).filter((name) => name.length >= 2 && !skip.has(name))
    const named = names.filter((name) => q.includes(name))
    const nameHit = named.some((name) => normalized(chunk.text).includes(name)) ? 6 : named.length ? 2 : 0
    const kindHit = cue && ((/群/.test(query) && /群/.test(chunk.kind)) || (/剧本|剧情|故事|戏里/.test(query) && /长剧情/.test(chunk.kind)) || (/幕后|戏外/.test(query) && /幕后/.test(chunk.kind)) || (/私聊/.test(query) && /私聊/.test(chunk.kind)))
    const semantic = lexical > 0 || cue ? semanticScore(query, chunk.text) : 0
    const qualifies = titleHit || nameHit >= 6 || lexical >= 5 || (cue && (lexical >= 2 || (lexical >= 1 && (semantic > 0 || kindHit))))
    const score = lexical + contextual + semantic + (titleHit ? 8 : 0) + nameHit + (kindHit ? 2 : 0) + (chunk.bound ? 2 : 0)
    return { chunk, score, qualifies }
  }).filter((row) => row.qualifies).sort((a, b) => b.score - a.score || Number(b.chunk.bound) - Number(a.chunk.bound))
  const turn = options.turn ?? 0
  const explicit = explicitPersonaRecall(query)
  const allowed = scored.filter((row) => explicit || !Number.isFinite(options.ledger?.[row.chunk.key]) || turn - options.ledger![row.chunk.key] >= PERSONA_RECALL_COOLDOWN)
  const budget = options.budget ?? PAST_LIFE_RECALL_BUDGET, max = options.maxChunks ?? PAST_LIFE_RECALL_MAX_CHUNKS
  const picked: PastLifeChunk[] = []
  let room = budget - LEAD.length
  for (const row of allowed) {
    if (picked.length >= max) break
    if (row.chunk.text.length + 1 > room) continue
    picked.push(row.chunk); room -= row.chunk.text.length + 1
  }
  return {
    ...empty,
    text: picked.length ? `${LEAD}\n${picked.map((chunk) => chunk.text).join('\n')}` : '',
    chunks: picked, keys: picked.map((chunk) => chunk.key), candidates: scored.length, suppressed: scored.length - allowed.length,
  }
}

/** 把本轮召回接到动态尾巴，并记进本轮记忆使用记录。 */
export function withPastLifeRecall(memory: PersonaMemoryContext, recall: PastLifeRecall | null): PersonaMemoryContext & { pastLifeKeys: string[] } {
  const enabled = Boolean(recall)
  const r = recall || { text: '', chunks: [], keys: [], candidates: 0, suppressed: 0, poolChunks: 0, poolChars: 0 }
  const lane = { key: 'past-life', label: '前世记忆 · 按需召回', chars: r.text.length, selected: r.chunks.length, candidates: r.candidates, suppressed: r.suppressed, preview: r.text || (enabled ? (r.poolChunks ? '本轮未召回：最新消息没有提到前世记忆里的人、群、剧本或往事。' : '还没有可召回的前世记忆素材。') : '前世记忆开关已关闭。') }
  return {
    ...memory,
    dynamicText: [memory.dynamicText, r.text].filter(Boolean).join('\n\n'),
    audit: { ...memory.audit, lanes: [...memory.audit.lanes, lane], pastLife: { enabled, poolChunks: r.poolChunks, poolChars: r.poolChars, recalled: r.chunks.map((chunk) => ({ label: chunk.label, chars: chunk.text.length })), chars: r.text.length } },
    pastLifeKeys: r.keys,
  }
}
