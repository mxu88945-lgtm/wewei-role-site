/**
 * v231 人格窗口「自制礼物」（参照顾祁砚 src/gifts.js）：
 * TA 可以在回复最后写 [自制礼物:emoji|礼物名|一句描述|附言]，应用把它变成礼物卡挂在这条消息下，
 * 并放进这个人格的自制礼物架（persona.customGifts，所有窗口共用）。
 * - 标记在显示、历史、记忆、摘要里都去掉；流式时末尾写到一半的标记先藏起来。
 * - 可选第 5 段颜色「#aabbcc,#ddeeff」；颜色必须是合法 6 位 hex，否则按礼物名挑一组预设色。
 * - 字段少（只有 emoji|名字）也能解析，旧数据缺字段时按默认补齐。
 */
import { PHONE_GIFT_CATALOG } from './phoneGifts'

export type PersonaGift = {
  id: string
  name: string
  subtitle: string
  icon: string
  colors: [string, string]
  note?: string
  createdAt: number
  maker: 'role' | 'user'
}

export const PERSONA_GIFT_SHELF_MAX = 60
export const PERSONA_GIFT_PROMPT_SHELF = 12

/** 复用小手机礼物图鉴的配色（同一套卡片色调）。 */
export const PERSONA_GIFT_COLOR_PRESETS: Array<[string, string]> = PHONE_GIFT_CATALOG.map((item) => item.colors)

const HEX = /^#[0-9a-f]{6}$/i
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const clean = (value: unknown, max: number) => (typeof value === 'string' ? value : value == null ? '' : String(value)).replace(/[[\]【】［］|\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)

export function hashGiftColors(name: string): [string, string] {
  let h = 0
  for (const ch of String(name)) h = (h * 31 + (ch.codePointAt(0) || 0)) >>> 0
  const pick = PERSONA_GIFT_COLOR_PRESETS[h % PERSONA_GIFT_COLOR_PRESETS.length]
  return [pick[0], pick[1]]
}

/** 只接受两个合法 6 位 hex；数组或「#a,#b」字符串都行，其余返回 null。 */
export function safeGiftColors(value: unknown): [string, string] | null {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，\s]+/).filter(Boolean) : null
  if (!list || list.length !== 2) return null
  const [a, b] = list.map((item) => String(item).trim())
  return HEX.test(a) && HEX.test(b) ? [a.toLowerCase(), b.toLowerCase()] : null
}

const giftIcon = (value: unknown) => [...clean(value, 16)].slice(0, 2).join('') || '🎁'

export function normalizePersonaGift(raw: unknown, now = Date.now()): PersonaGift | null {
  if (!isRecord(raw)) return null
  const name = clean(raw.name, 24)
  if (!name) return null
  const maker = raw.maker === 'user' ? 'user' : 'role'
  const createdAt = Number.isFinite(Number(raw.createdAt)) && Number(raw.createdAt) > 0 ? Number(raw.createdAt) : now
  const note = clean(raw.note, 240)
  return {
    id: clean(raw.id, 80) || `made-${createdAt.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name,
    subtitle: clean(raw.subtitle, 60) || (maker === 'role' ? 'TA 亲手做的' : '我亲手做的'),
    icon: giftIcon(raw.icon),
    colors: safeGiftColors(raw.colors) || hashGiftColors(name),
    ...(note ? { note } : {}),
    createdAt,
    maker,
  }
}

/** 自制礼物架：去掉坏数据，同名只留最新一份，最多 60 份。 */
export function normalizePersonaGifts(value: unknown): PersonaGift[] {
  if (!Array.isArray(value)) return []
  const out: PersonaGift[] = []
  for (const raw of value) {
    const item = normalizePersonaGift(raw)
    if (!item) continue
    const at = out.findIndex((entry) => entry.id === item.id || entry.name === item.name)
    if (at >= 0) out.splice(at, 1)
    out.push(item)
  }
  return out.slice(-PERSONA_GIFT_SHELF_MAX)
}

export function addPersonaGift(shelf: PersonaGift[] | undefined, gift: PersonaGift): PersonaGift[] {
  return normalizePersonaGifts([...(shelf || []), gift])
}

export function removePersonaGift(shelf: PersonaGift[] | undefined, id: string): PersonaGift[] {
  return (shelf || []).filter((item) => item.id !== id)
}

const OPEN = '[【［'
const CLOSE = '\\]】］'
/** [自制礼物:🎁|名字|描述|附言|#a,#b]，括号/冒号全半角都行；名字必填，其余可省。 */
const GIFT_TAG = new RegExp(`[${OPEN}]\\s*自制礼物\\s*[:：]\\s*([^|｜${CLOSE}\\n]*)[|｜]([^|｜${CLOSE}\\n]+)(?:[|｜]([^|｜${CLOSE}\\n]*))?(?:[|｜]([^|｜${CLOSE}\\n]*))?(?:[|｜]([^${CLOSE}\\n]*))?\\s*[${CLOSE}]`, 'g')
/** 不合规的完整标记（比如少了竖线）也不让它露出来。 */
const LOOSE_TAG = new RegExp(`[${OPEN}]\\s*自制礼物\\s*[:：][^${CLOSE}\\n]*[${CLOSE}]`, 'g')
/** 流式末尾写到一半：「[」「[自」…「[自制礼物:🎁|名」。 */
const PARTIAL_TAG = new RegExp(`[${OPEN}]\\s*(?:自(?:制(?:礼(?:物(?:\\s*[:：][^${CLOSE}\\n]{0,400})?)?)?)?)?$`)
/** 发给模型的历史里给礼物留的一句应用记录；显示时同样去掉。 */
const GIFT_RECORD_LINE = /（应用记录：你送出了自制礼物「[^」\n]*」[^）\n]*）/g

export function personaGiftRecordLine(gift: PersonaGift) {
  return `（应用记录：你送出了自制礼物「${gift.name}」）`
}

/** 第一份合规的自制礼物（每轮最多一份）；没有为 null。 */
export function parsePersonaGiftTag(text: string, now = Date.now()): PersonaGift | null {
  for (const match of (text || '').matchAll(GIFT_TAG)) {
    const [, icon, name, subtitle, note, colors] = match
    const gift = normalizePersonaGift({ icon, name, subtitle, note, colors, maker: 'role', createdAt: now })
    if (gift) return gift
  }
  return null
}

export function stripPersonaGiftTag(text: string): string {
  if (!text) return text
  return text
    .replace(GIFT_TAG, '')
    .replace(LOOSE_TAG, '')
    .replace(GIFT_RECORD_LINE, '')
    .replace(PARTIAL_TAG, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

/**
 * 稳定前缀里的说明：只在礼物架变化（他做了新礼物/她删了一份）时变，平时每轮一样，缓存照样命中。
 */
export function buildPersonaGiftPrompt(shelf: PersonaGift[] | undefined): string {
  const recent = normalizePersonaGifts(shelf).slice(-PERSONA_GIFT_PROMPT_SHELF)
  return [
    '【自制礼物｜你可以亲手做一份礼物】',
    '当你真的想送{{user}}一份独一无二的东西时（偶尔，不是每轮），可以在回复最后单独一行写 [自制礼物:一个emoji|礼物名|一句描述|你的附言]，礼物名 12 字内。应用会把它变成由你送出的礼物卡，并放进你做过的礼物里。每轮最多一份；不要为了展示硬送，也不要说送了却不写标记。这一行不会显示给{{user}}，正文里不用解释它。',
    recent.length ? `你做过的礼物：${recent.map((item) => `${item.icon}${item.name}`).join('、')}。别重复做同一份。` : '',
  ].filter(Boolean).join('\n')
}
