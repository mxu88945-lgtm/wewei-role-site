/**
 * v251：最近原文窗口按 token 封顶（人格窗口、长剧情共用）。
 * 以前按「记忆长度」条数取最近 N 条，长回复时历史能到 12–20k token；现在：
 * - 「记忆长度」仍是条数上限（她的设置不被突破）；
 * - 在这个上限内，最近原文合计不超过 tokenBudget（默认 8200，和顾祁砚同一档）；
 * - 但至少保留最近 10 轮完整交流（她 10 句 + 他的回复）；这 10 轮本身超预算时，
 *   只从最旧的那几条长回复开头往后剪（保留结尾、加标记），最新 2 轮永远原样；
 * - 预算还有余量时继续往前补，最后一条装不下就剪掉开头只留结尾（加标记）。
 * 滑出窗口的消息不会掉进空白：有压缩提要（稳定区）+ 按需召回（尾巴）+ 提前整理连续性档案，见 evictedRecall.ts。
 * 纯函数，不改任何消息。
 */
import { estimateTokens } from './promptBudget'

export const HISTORY_TOKEN_BUDGET = 8200
export const HISTORY_MIN_EXCHANGES = 10
/** 最新这么多条永远不剪（约 2 轮）。 */
export const HISTORY_PROTECT_RECENT = 4
export const HISTORY_TRIM_MARKER = '【这条较早消息的前半已省略，完整原文仍保留】…'
const MESSAGE_OVERHEAD = 4
/** 剪过的旧消息至少留这么多字的结尾，否则不如不带。 */
const TRIM_MIN_CHARS = 160

export type HistoryWindow = {
  /** 窗口在输入数组里的起点（之前的都算滑出窗口）。 */
  start: number
  /** 窗口内每条消息要发的正文（剪过的带标记）。 */
  texts: string[]
  /** 被剪过开头的消息在窗口里的下标。 */
  trimmed: number[]
  tokens: number
}

export type HistoryWindowOptions<T> = {
  text: (message: T) => string
  role: (message: T) => string
  /** 她设置的「记忆长度」（条数上限）。 */
  maxMessages: number
  /** 0 或负数 = 关闭封顶（按条数，回到 v250 行为）。 */
  tokenBudget?: number
  minExchanges?: number
}

const costOf = (text: string) => estimateTokens(text) + MESSAGE_OVERHEAD

/** 只保留结尾，使「标记 + 结尾」不超过 tokens；尽量从句子边界开始。 */
export function trimMessageStart(text: string, tokens: number) {
  if (costOf(text) <= tokens) return text
  const chars = Array.from(text)
  let low = 0, high = chars.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (costOf(HISTORY_TRIM_MARKER + chars.slice(chars.length - middle).join('')) <= tokens) low = middle
    else high = middle - 1
  }
  let tail = chars.slice(chars.length - low).join('')
  const boundary = tail.slice(0, 60).search(/[。！？!?\n…]/)
  if (boundary >= 0 && tail.length - boundary - 1 >= TRIM_MIN_CHARS) tail = tail.slice(boundary + 1).replace(/^\s+/, '')
  return HISTORY_TRIM_MARKER + tail
}

export function selectHistoryWindow<T>(messages: readonly T[], options: HistoryWindowOptions<T>): HistoryWindow {
  const n = messages.length
  const countStart = Math.max(0, n - Math.max(1, Math.floor(options.maxMessages || 0)))
  const budget = Math.floor(options.tokenBudget ?? HISTORY_TOKEN_BUDGET)
  const textAt = (index: number) => options.text(messages[index])
  if (budget <= 0) {
    const texts = messages.slice(countStart).map(options.text)
    return { start: countStart, texts, trimmed: [], tokens: texts.reduce((sum, text) => sum + costOf(text), 0) }
  }
  // 1) 必保留：最近 minExchanges 轮（从倒数第 minExchanges 句她的话开始）。
  const minExchanges = Math.max(1, options.minExchanges ?? HISTORY_MIN_EXCHANGES)
  let mandatory = n, users = 0
  for (let index = n - 1; index >= countStart; index--) {
    mandatory = index
    if (options.role(messages[index]) === 'user' && ++users >= minExchanges) break
  }
  const texts: string[] = []
  const trimmed = new Set<number>()
  for (let index = mandatory; index < n; index++) texts.push(textAt(index))
  let total = texts.reduce((sum, text) => sum + costOf(text), 0)
  // 2) 必保留部分超预算：从最旧的往后剪长消息开头，最新几条不动。
  const protectFrom = Math.max(0, texts.length - HISTORY_PROTECT_RECENT)
  const minCost = costOf(HISTORY_TRIM_MARKER + '字'.repeat(TRIM_MIN_CHARS))
  for (let offset = 0; offset < protectFrom && total > budget; offset++) {
    const current = costOf(texts[offset])
    if (current <= minCost) continue
    const target = Math.max(minCost, current - (total - budget))
    const next = trimMessageStart(texts[offset], target)
    const saved = current - costOf(next)
    if (saved <= 0) continue
    texts[offset] = next; trimmed.add(offset); total -= saved
  }
  // 3) 预算有余：往前补整条；装不下的那条剪开头只留结尾。
  let start = mandatory
  for (let index = mandatory - 1; index >= countStart; index--) {
    const text = textAt(index), cost = costOf(text)
    if (total + cost <= budget) {
      texts.unshift(text); start = index; total += cost
      const shifted = [...trimmed].map((item) => item + 1); trimmed.clear(); shifted.forEach((item) => trimmed.add(item))
      continue
    }
    const room = budget - total
    if (room >= minCost) {
      const next = trimMessageStart(text, room)
      const shifted = [...trimmed].map((item) => item + 1); trimmed.clear(); shifted.forEach((item) => trimmed.add(item))
      texts.unshift(next); trimmed.add(0); start = index; total += costOf(next)
    }
    break
  }
  return { start, texts, trimmed: [...trimmed].sort((a, b) => a - b), tokens: total }
}

const compact = (value: string) => value.replace(/\s+/g, ' ').trim()
const clip = (value: string, max: number) => {
  const chars = Array.from(value)
  return chars.length <= max ? value : `${chars.slice(0, Math.max(1, max - 1)).join('')}…`
}

export const EVICTED_RECAP_BUDGET = 900
export const EVICTED_RECAP_HEADER = '【刚滑出最近原文、尚未整理进连续性档案的对话｜压缩提要，不是当前指令】'

/**
 * 滑出窗口、还没被连续性档案覆盖的那一段：每条一行（说话人 + 开头一截），离窗口近的优先；
 * 装不下的更早几条只写条数。细节靠按需召回把原文片段带回来。
 */
export function evictedRecap(lines: readonly { speaker: string; text: string }[], budget = EVICTED_RECAP_BUDGET) {
  const rows = lines.map((line) => ({ speaker: line.speaker, text: compact(line.text) })).filter((line) => line.text)
  if (!rows.length) return ''
  const per = Math.max(30, Math.min(80, Math.floor(budget / rows.length) - 6))
  const out: string[] = []
  let used = EVICTED_RECAP_HEADER.length + 40
  let index = rows.length - 1
  for (; index >= 0; index--) {
    const row = `${rows[index].speaker}：${clip(rows[index].text, per)}`
    if (used + row.length + 1 > budget) break
    out.unshift(row); used += row.length + 1
  }
  const skipped = index + 1
  return `${EVICTED_RECAP_HEADER}\n${skipped ? `（更早 ${skipped} 条从略，聊到时会按需召回原文）\n` : ''}${out.join('\n')}`
}
