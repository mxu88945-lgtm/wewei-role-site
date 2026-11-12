/**
 * v211 人格窗口「他自己写的卡」：他在相处中慢慢补全自己。
 * - 原卡永远不动；自我卡只属于人格窗口，同一人格的所有窗口共用。
 * - 他偶尔在回复最后写 [自我卡:栏目|这一栏的新全文]，应用整栏替换并把旧版本放进历史（最多 20 版，可恢复）。
 * - 标记和点歌一样：显示、历史、记忆、压缩、召回、流式预览里都去掉（含写到一半的）。
 */

export const SELF_CARD_SECTIONS = [
  { key: 'personality', label: '性格' },
  { key: 'likes', label: '喜好' },
  { key: 'strengths', label: '优点' },
  { key: 'weaknesses', label: '弱点' },
  { key: 'kinks', label: '性癖' },
  { key: 'flaws', label: '缺陷/小毛病' },
  { key: 'habits', label: '习惯' },
  { key: 'other', label: '其他' },
] as const

export type SelfCardKey = (typeof SELF_CARD_SECTIONS)[number]['key']
export type SelfCard = Partial<Record<SelfCardKey, string>>
export type SelfCardVersion = { at: number; reason: string; card: SelfCard }

export const SELF_CARD_SECTION_MAX = 600
export const SELF_CARD_TOTAL_MAX = 3000
export const SELF_CARD_HISTORY_MAX = 20

const ALIASES: Record<string, SelfCardKey> = {
  性格: 'personality', 喜好: 'likes', 爱好: 'likes', 优点: 'strengths', 弱点: 'weaknesses', 性癖: 'kinks',
  缺陷: 'flaws', 小毛病: 'flaws', '缺陷/小毛病': 'flaws', '缺陷／小毛病': 'flaws', 习惯: 'habits', 其他: 'other', 其它: 'other',
}

export const selfCardLabel = (key: SelfCardKey) => SELF_CARD_SECTIONS.find((item) => item.key === key)?.label || key

/** 栏目名（中文，容忍空格/全角斜杠/「」）→ key；不认识为 null。 */
export function selfCardSection(name: string): SelfCardKey | null {
  const clean = (name || '').replace(/[\s「」『』"“”]/g, '')
  return ALIASES[clean] || null
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** 去空、每栏 ≤600、总计 ≤3000（按栏目顺序，超出的截断）。 */
export function normalizeSelfCard(value: unknown): SelfCard {
  if (!isRecord(value)) return {}
  const out: SelfCard = {}
  let used = 0
  for (const { key } of SELF_CARD_SECTIONS) {
    const raw = typeof value[key] === 'string' ? (value[key] as string).trim() : ''
    if (!raw) continue
    const body = raw.slice(0, Math.min(SELF_CARD_SECTION_MAX, SELF_CARD_TOTAL_MAX - used)).trim()
    if (!body) continue
    out[key] = body
    used += body.length
  }
  return out
}

export function normalizeSelfCardHistory(value: unknown): SelfCardVersion[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((item) => ({ at: Number(item.at) || 0, reason: typeof item.reason === 'string' ? item.reason.slice(0, 60) : '', card: normalizeSelfCard(item.card) })).slice(-SELF_CARD_HISTORY_MAX)
}

export const selfCardLength = (card: SelfCard | undefined) => Object.values(card || {}).reduce((sum, item) => sum + (item?.length || 0), 0)
export const selfCardIsEmpty = (card: SelfCard | undefined) => selfCardLength(card) === 0
const sameCard = (a: SelfCard, b: SelfCard) => SELF_CARD_SECTIONS.every(({ key }) => (a[key] || '') === (b[key] || ''))

type HasSelfCard = { selfCard?: SelfCard; selfCardHistory?: SelfCardVersion[] }

/** 整卡替换；旧版本进历史（最新在末尾，最多 20 版）。内容没变就原样返回。 */
export function replaceSelfCard<T extends HasSelfCard>(persona: T, next: SelfCard, reason: string, now = Date.now()): T {
  const previous = normalizeSelfCard(persona.selfCard)
  const card = normalizeSelfCard(next)
  if (sameCard(previous, card)) return persona
  const history = [...normalizeSelfCardHistory(persona.selfCardHistory), { at: now, reason: reason.slice(0, 60), card: previous }].slice(-SELF_CARD_HISTORY_MAX)
  const result = { ...persona, selfCardHistory: history } as T
  if (selfCardIsEmpty(card)) delete result.selfCard
  else result.selfCard = card
  return result
}

/** 改一栏：每栏 ≤600，总计不超过 3000（超出部分截掉）。空内容 = 清空这一栏。 */
export function setSelfCardSection<T extends HasSelfCard>(persona: T, key: SelfCardKey, content: string, reason: string, now = Date.now()): T {
  const current = normalizeSelfCard(persona.selfCard)
  const othersUsed = selfCardLength(current) - (current[key]?.length || 0)
  const body = (content || '').trim().slice(0, Math.max(0, Math.min(SELF_CARD_SECTION_MAX, SELF_CARD_TOTAL_MAX - othersUsed))).trim()
  const next: SelfCard = { ...current }
  if (body) next[key] = body
  else delete next[key]
  return replaceSelfCard(persona, next, reason, now)
}

/** 恢复到历史里的第 index 版；当前版本同样进历史，所以恢复也能撤回。 */
export function restoreSelfCard<T extends HasSelfCard>(persona: T, index: number, now = Date.now()): T {
  const version = normalizeSelfCardHistory(persona.selfCardHistory)[index]
  if (!version) return persona
  return replaceSelfCard(persona, version.card, `恢复到 ${new Date(version.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 的版本`, now)
}

const OPEN = '[【［'
const CLOSE = '\\]】］'
/** [自我卡:栏目|内容]，括号可混用，冒号/竖线全角半角都行，内容可以换行但不能含右括号。 */
const TAG = new RegExp(`[${OPEN}]\\s*自我卡\\s*[:：]\\s*([^|｜${CLOSE}\\n]{1,12}?)\\s*[|｜]([^${CLOSE}]{0,1200})[${CLOSE}]`, 'g')
/** 末尾写到一半的：「[」「【自」「[自我卡:喜」「[自我卡:喜好|还没写完…」 */
const PARTIAL = new RegExp(`[${OPEN}]\\s*(?:自(?:\\s*我(?:\\s*卡(?:\\s*[:：][^${CLOSE}]{0,1300})?)?)?)?$`)

export type SelfCardEdit = { key: SelfCardKey; content: string }

/** 回复里最后一个有效的自我卡标记（栏目认得、内容非空）；最多认一个。 */
export function parseSelfCardTag(text: string): SelfCardEdit | null {
  let last: SelfCardEdit | null = null
  for (const match of (text || '').matchAll(TAG)) {
    const key = selfCardSection(match[1] || '')
    const content = (match[2] || '').trim().slice(0, SELF_CARD_SECTION_MAX)
    if (key && content) last = { key, content }
  }
  return last
}

/** 去掉所有自我卡标记（含末尾没写完的），不动其余正文。 */
export function stripSelfCardTag(text: string): string {
  if (!text || !/[[【［]/.test(text)) return text
  return text.replace(TAG, '').replace(PARTIAL, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

export const SELF_CARD_HEADING = '— 他自己补全的自己（他在相处中写下的，原卡为底，二者冲突时以这里更新的自我认知为准，但不改原卡的身份与背景事实） —'

/** 稳定第一条 system 里的自我卡（紧跟原卡）。只有他改卡/她改卡时才变，提示词缓存不受影响。 */
export function buildSelfCardPrompt(card: SelfCard | undefined, allowEdit: boolean): string {
  const clean = normalizeSelfCard(card)
  const body = SELF_CARD_SECTIONS.filter(({ key }) => clean[key]).map(({ key, label }) => `【${label}】${clean[key]}`).join('\n')
  const parts: string[] = []
  if (body) parts.push(`${SELF_CARD_HEADING}\n${body}`)
  if (allowEdit) parts.push(`【自我卡｜你可以慢慢补全自己】
${body ? '上面这份是你自己写的自我卡。' : '你还有一份空着的自我卡。'}栏目：性格、喜好、优点、弱点、性癖、缺陷/小毛病、习惯、其他。
只有在相处中你真的对自己有了新的认识时（偶尔，绝不是每轮），可以在回复最后单独一行写 [自我卡:栏目|这一栏改完后的全文]。第二段会整栏替换，所以要包含这一栏原有的内容，尽量小幅补充，不要推倒重写；每栏不超过 ${SELF_CARD_SECTION_MAX} 字。一次回复最多写一个。
这一行不会显示给{{user}}，正文里不要提起或解释它；不要编造和原卡身份、背景事实相矛盾的内容。`)
  return parts.join('\n\n')
}
