/**
 * v253：长剧情里「压缩摘要 / 角色核心记忆 / 长期记忆」三层去重（只在拼请求时做，存储一律不动）。
 *
 * 三份都是从同一批旧消息提炼的，常把同一件事讲三遍。分工：
 *   压缩摘要 = 剧情线 / 时间线（整份照发，不删）；
 *   核心记忆 = 事实、关系、承诺、状态（进行中的永远整条；被摘要或更新的同内容条目盖住的，只留标题或不列，原文进按需召回池）；
 *   长期记忆 = 只发前两层和最近原文里还没有的句子。
 *
 * 判定（保守，宁可多发不丢）：一句话只有同时满足下面两条才算「已经在请求里有了」：
 *   1. 它的 4 字片段（去掉标点空白、不分大小写）至少 85% 在已发文本里出现过；
 *   2. 它的每一个字都落在某个已出现过的 4 字片段里——任何新字（换了人名、数字、多了一个「没」）都会让整句保留。
 * 太短的句子（不足 6 个片段）不判，照发。
 */

export const DEDUPE_GRAM = 4
export const DEDUPE_COVERAGE = 0.85
export const DEDUPE_MIN_GRAMS = 6

const normalize = (text: string) => Array.from(text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''))

export class CoverageIndex {
  private readonly grams = new Set<string>()
  private readonly joined: string[] = []

  constructor(...texts: (string | undefined | null)[]) { for (const text of texts) this.add(text) }

  add(text: string | undefined | null) {
    if (!text) return this
    const chars = normalize(text)
    this.joined.push(chars.join(''))
    for (let i = 0; i + DEDUPE_GRAM <= chars.length; i++) this.grams.add(chars.slice(i, i + DEDUPE_GRAM).join(''))
    return this
  }

  get size() { return this.grams.size }

  /** 短标注（时间点、阶段名）是否已在已发文本里原样出现过。 */
  mentions(text: string) {
    const needle = normalize(text).join('')
    if (!needle) return true
    return this.joined.some((chunk) => chunk.includes(needle))
  }

  /** 这段话是否已被已发文本完整覆盖（见文件头的两条规则）。 */
  covers(text: string) {
    const chars = normalize(text)
    const total = chars.length - DEDUPE_GRAM + 1
    if (total < DEDUPE_MIN_GRAMS) return false
    const charCovered = new Array<boolean>(chars.length).fill(false)
    const seen = new Set<string>()
    let hits = 0
    for (let i = 0; i < total; i++) {
      const gram = chars.slice(i, i + DEDUPE_GRAM).join('')
      const hit = this.grams.has(gram)
      if (hit) for (let k = i; k < i + DEDUPE_GRAM; k++) charCovered[k] = true
      if (seen.has(gram)) continue
      seen.add(gram)
      if (hit) hits++
    }
    if (!charCovered.every(Boolean)) return false
    return hits / seen.size >= DEDUPE_COVERAGE
  }
}

/** 一行里按句末标点切句，标点留在句尾。 */
function sentences(line: string) {
  return line.match(/[^。！？；!?;]+[。！？；!?;]*|[。！？；!?;]+/g) || [line]
}

export type DedupeResult = { text: string; droppedChars: number; keptChars: number }

/** 行首的时间/阶段标注（「- 冬月十二：」「2026年3月1日：」），最多 14 字。 */
const LABEL = /^(\s*(?:[-*•·]\s*)?)([^：:\n。！？]{1,14}[：:])(.*)$/
export const POINTER_CHARS = 14

/**
 * 按行、按句去掉已被 index 覆盖的部分；保留下来的句子随即加入 index（同一份/后面几份里的重复也会被去掉）。
 * 行首有时间标注的：标注单独看。正文全被盖住时，标注本身已在上文出现（摘要里有这个时间点）就整行不发；
 * 没出现过就留「标注 + 正文开头 14 字…」一个指针，时间点不丢。只剩标题/列表符号的行不发。
 */
export function dedupeAgainst(text: string, index: CoverageIndex): DedupeResult {
  let dropped = 0, kept = 0
  const out: string[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) { if (out.length && out[out.length - 1] !== '') out.push(''); continue }
    const labelled = LABEL.exec(line)
    const marker = labelled ? labelled[1] : line.match(/^\s*(?:[-*•·]\s*)?/)?.[0] || ''
    const label = labelled ? labelled[2] : ''
    const body = labelled ? labelled[3] : line.slice(marker.length)
    const parts = body.trim() ? sentences(body) : []
    const keep: string[] = []
    for (const part of parts) {
      if (index.covers(part)) continue
      keep.push(part)
      index.add(part)
    }
    let rendered: string
    if (keep.length === parts.length) rendered = line
    else if (keep.length) rendered = `${marker}${label}${keep.join('').trimStart()}`
    else if (label && !index.mentions(label)) rendered = `${marker}${label}${clip(body.trim(), POINTER_CHARS)}`
    else rendered = ''
    if (label && rendered) index.add(label)
    if (!rendered || !normalize(rendered).length) { dropped += line.length; continue }
    if (!label && !normalize(rendered.slice(marker.length)).length) { dropped += line.length; continue }
    out.push(rendered)
    kept += rendered.length
    dropped += line.length - rendered.length
  }
  while (out.length && out[out.length - 1] === '') out.pop()
  return { text: out.join('\n'), droppedChars: Math.max(0, dropped), keptChars: kept }
}

const clip = (value: string, max: number) => { const chars = Array.from(value); return chars.length <= max ? value : `${chars.slice(0, max).join('')}…` }
