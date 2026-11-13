/**
 * v233 双向礼物：在 v231 基础上补齐「她送 TA」——礼物图鉴（20 件，复用小手机图鉴的条目和配色）、
 * 她自制的礼物、礼物往来；TA 可用 [送礼:ID或名称|附言] 从图鉴/礼物架送，或继续 [自制礼物:…]。
 * 数据只存在人格窗口里（persona.customGifts + 消息上的 gift），不碰 weijing.phoneGifts。
 *
 * v231 人格窗口「自制礼物」（参照顾祁砚 src/gifts.js）：
 * TA 可以在回复最后写 [自制礼物:emoji|礼物名|一句描述|附言]，应用把它变成礼物卡挂在这条消息下，
 * 并放进这个人格的自制礼物架（persona.customGifts，所有窗口共用）。
 * - 标记在显示、历史、记忆、摘要里都去掉；流式时末尾写到一半的标记先藏起来。
 * - 可选第 5 段颜色「#aabbcc,#ddeeff」；颜色必须是合法 6 位 hex，否则按礼物名挑一组预设色。
 * - 字段少（只有 emoji|名字）也能解析，旧数据缺字段时按默认补齐。
 */
import { PHONE_GIFT_CATALOG, type PhoneGiftItem } from './phoneGifts'

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
/** v233：[送礼:ID或名称|附言]。 */
const SEND_TAG = new RegExp(`[${OPEN}]\\s*送礼\\s*[:：]\\s*([^|｜${CLOSE}\\n]+?)\\s*(?:[|｜]([^${CLOSE}\\n]*))?[${CLOSE}]`, 'g')
const LOOSE_SEND_TAG = new RegExp(`[${OPEN}]\\s*送礼\\s*[:：][^${CLOSE}\\n]*[${CLOSE}]`, 'g')
/** 流式末尾写到一半：「[」「[自」…「[自制礼物:🎁|名」「[送礼:wa」。 */
const PARTIAL_TAG = new RegExp(`[${OPEN}]\\s*(?:自(?:制(?:礼(?:物(?:\\s*[:：][^${CLOSE}\\n]{0,400})?)?)?)?|送(?:礼(?:\\s*[:：][^${CLOSE}\\n]{0,400})?)?)?$`)
/** 发给模型的历史里给礼物留的一句应用记录；显示时同样去掉。 */
const GIFT_RECORD_LINE = /（应用记录：你送出了(?:自制)?礼物「[^」\n]*」[^）\n]*）/g
/** 发给模型的她送礼事件；万一被模型照抄回来也不显示。 */
const GIFT_EVENT_LINE = /^[ \t]*🎁\s*礼物事件｜.*(?:\n[ \t]*附言：.*)?$/gm

/** 应用记录只给模型看：TA 之前那条回复里送出了什么。 */
export function personaGiftRecordLine(gift: { name: string; custom?: boolean; made?: boolean; maker?: string; direction?: string }) {
  const handmade = gift.made || gift.custom === true || (gift.custom === undefined && gift.maker === 'role')
  return `（应用记录：你送出了${handmade ? '自制' : ''}礼物「${gift.name}」）`
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
    .replace(SEND_TAG, '')
    .replace(LOOSE_SEND_TAG, '')
    .replace(GIFT_RECORD_LINE, '')
    .replace(GIFT_EVENT_LINE, '')
    .replace(PARTIAL_TAG, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

/* ───────────── v233 双向礼物 ───────────── */

export type PersonaGiftCategory = 'food' | 'flowers' | 'daily' | 'keepsake' | 'date' | 'handmade'
export type PersonaGiftCatalogItem = { id: string; name: string; subtitle: string; icon: string; category: PersonaGiftCategory; colors: [string, string] }
export type PersonaGiftDirection = 'user-to-role' | 'role-to-user'

/** 消息上的一次礼物往来（她送的挂在她的消息上，TA 送的挂在 TA 的回复上）。 */
export type PersonaGiftEvent = {
  /** 图鉴 id 或礼物架上那份的 id。 */
  giftId: string
  name: string
  subtitle: string
  icon: string
  colors: [string, string]
  note?: string
  createdAt: number
  direction: PersonaGiftDirection
  /** 礼物架上的（自制）而不是图鉴里的。 */
  custom: boolean
  maker?: 'user' | 'role'
  /** TA 在这条回复里刚亲手做的（重新生成时连礼物架上那份一起收回）。 */
  made?: boolean
}

export const PERSONA_GIFT_CATEGORIES: Array<{ id: 'all' | 'custom' | PersonaGiftCategory; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'custom', label: '自制' },
  { id: 'food', label: '吃的' },
  { id: 'flowers', label: '花束' },
  { id: 'daily', label: '日常' },
  { id: 'keepsake', label: '珍藏' },
  { id: 'date', label: '约会' },
  { id: 'handmade', label: '手作' },
]

/** 与顾祁砚同一份 20 件清单；条目、文案和配色直接取小手机礼物图鉴（同一套卡片色调）。 */
const CATALOG_PICK: Array<[string, PersonaGiftCategory]> = [
  ['warm-soup', 'food'], ['coffee', 'food'], ['cake', 'food'], ['dinner', 'food'],
  ['daisy', 'flowers'], ['tulip', 'flowers'], ['rose', 'flowers'],
  ['scarf', 'daily'], ['mug', 'daily'], ['perfume', 'daily'],
  ['bracelet', 'keepsake'], ['watch', 'keepsake'], ['ring', 'keepsake'],
  ['movie', 'date'], ['aquarium', 'date'], ['night-drive', 'date'],
  ['note', 'handmade'], ['origami', 'handmade'], ['photo-book', 'handmade'], ['letter', 'handmade'],
]
const fromPhone = (item: PhoneGiftItem, category: PersonaGiftCategory): PersonaGiftCatalogItem => ({ id: item.id, name: item.name, subtitle: item.subtitle, icon: item.icon, category, colors: [item.colors[0], item.colors[1]] })
export const PERSONA_GIFT_CATALOG: PersonaGiftCatalogItem[] = CATALOG_PICK.flatMap(([id, category]) => {
  const item = PHONE_GIFT_CATALOG.find((entry) => entry.id === id)
  return item ? [fromPhone(item, category)] : []
})
/** 顾祁砚那边叫 album，这边是 photo-book；两个都认。 */
const CATALOG_ALIAS: Record<string, string> = { album: 'photo-book' }

/** 自制礼物可选的 7 组颜色（同顾祁砚 GIFT_COLOR_PRESETS）。 */
export const PERSONA_GIFT_MAKER_COLORS: Array<[string, string]> = [
  ['#ffe4e8', '#dfa0aa'], ['#fff2da', '#e2b36f'], ['#e8f0f1', '#7ea1a8'],
  ['#efe6f6', '#a58bc2'], ['#edf3ee', '#8ea99c'], ['#f2d6dc', '#a94555'], ['#e7e9eb', '#7f8b98'],
]

export function findCatalogGift(idOrName: string): PersonaGiftCatalogItem | undefined {
  const key = clean(idOrName, 80)
  if (!key) return undefined
  const id = CATALOG_ALIAS[key.toLowerCase()] || key.toLowerCase()
  return PERSONA_GIFT_CATALOG.find((item) => item.id === id || item.name === key)
}

/** 新做一份自制礼物（她做的 maker=user）。名字空返回 null。 */
export function makePersonaGift(input: { icon?: string; name?: string; subtitle?: string; colors?: unknown; maker?: 'user' | 'role' }, now = Date.now()): PersonaGift | null {
  return normalizePersonaGift({ ...input, maker: input.maker || 'user', createdAt: now, id: `made-${now.toString(36)}${Math.random().toString(36).slice(2, 6)}` }, now)
}

/** 把图鉴条目或礼物架上的一份变成一次往来。 */
export function personaGiftEvent(item: PersonaGiftCatalogItem | PersonaGift, direction: PersonaGiftDirection, note = '', now = Date.now(), made = false): PersonaGiftEvent {
  const custom = 'maker' in item
  const cleanNote = clean(note, 240)
  return {
    giftId: item.id, name: item.name, subtitle: item.subtitle, icon: item.icon, colors: [item.colors[0], item.colors[1]],
    ...(cleanNote ? { note: cleanNote } : {}),
    createdAt: now, direction, custom,
    ...(custom ? { maker: (item as PersonaGift).maker } : {}),
    ...(made ? { made: true } : {}),
  }
}

/**
 * 消息上的礼物。向后兼容 v231：TA 回复上的旧 gift（自制礼物架条目，没有 direction）→ TA 送她的、刚亲手做的。
 * 她的消息上只认明确写了 user-to-role 的。
 */
export function normalizePersonaGiftEvent(raw: unknown, role: 'user' | 'assistant', now = Date.now()): PersonaGiftEvent | null {
  if (!isRecord(raw)) return null
  const expected: PersonaGiftDirection = role === 'user' ? 'user-to-role' : 'role-to-user'
  if (raw.direction !== undefined && raw.direction !== expected) return null
  if (role === 'user' && raw.direction !== expected) return null
  const legacy = raw.direction === undefined
  const known = typeof raw.giftId === 'string' ? findCatalogGift(raw.giftId) : undefined
  const name = clean(raw.name, 24) || known?.name || ''
  if (!name) return null
  const createdAt = Number.isFinite(Number(raw.createdAt)) && Number(raw.createdAt) > 0 ? Number(raw.createdAt) : now
  const custom = legacy ? true : raw.custom === true || (!known && raw.custom !== false)
  const maker = raw.maker === 'user' || raw.maker === 'role' ? raw.maker : legacy ? 'role' : undefined
  const note = clean(raw.note, 240)
  return {
    giftId: clean(legacy ? raw.id : raw.giftId, 80) || known?.id || `made-${createdAt.toString(36)}`,
    name,
    subtitle: clean(raw.subtitle, 60) || known?.subtitle || (custom ? (maker === 'user' ? '我亲手做的' : 'TA 亲手做的') : '只此一份'),
    icon: clean(raw.icon, 16) ? giftIcon(raw.icon) : known?.icon || '🎁',
    colors: safeGiftColors(raw.colors) || known?.colors || hashGiftColors(name),
    ...(note ? { note } : {}),
    createdAt,
    direction: expected,
    custom,
    ...(custom && maker ? { maker } : {}),
    ...(legacy || raw.made === true ? { made: true } : {}),
  }
}

/**
 * v233：TA 这轮送的礼物（每轮最多一份）。先认 [自制礼物:…]（made 是要放进礼物架的新礼物），
 * 再认 [送礼:ID或名称|附言]——图鉴 id/名称，或礼物架上的 id/名称。认不出的送礼标记忽略（照样不显示）。
 */
export function extractPersonaAssistantGift(text: string, shelf: PersonaGift[] | undefined, now = Date.now()): { gift: PersonaGiftEvent | null; made: PersonaGift | null } {
  const made = parsePersonaGiftTag(text, now)
  if (made) return { made, gift: personaGiftEvent(made, 'role-to-user', made.note, now, true) }
  const list = normalizePersonaGifts(shelf)
  for (const match of (text || '').matchAll(SEND_TAG)) {
    const key = clean(match[1], 80)
    const item = findCatalogGift(key) || [...list].reverse().find((entry) => entry.id === key || entry.name === key)
    if (item) return { made: null, gift: personaGiftEvent(item, 'role-to-user', match[2] || '', now) }
  }
  return { gift: null, made: null }
}

/** 她送礼时发给模型的那段文字（不进显示）。 */
export function personaGiftPromptText(gift: PersonaGiftEvent, userName: string, roleName: string) {
  const [sender, recipient] = gift.direction === 'user-to-role' ? [userName || '用户', roleName || '你'] : [roleName || 'TA', userName || '用户']
  const handmade = gift.custom ? `，${gift.maker === 'role' ? '你亲手做的' : `${userName || '用户'}亲手做的`}` : ''
  return `🎁 礼物事件｜${sender}送给${recipient}「${gift.name}」（${gift.subtitle}${handmade}）${gift.note ? `\n附言：${gift.note}` : ''}`
}

/** 记忆检索 / 摘要里用的一句（没有任何标记）。 */
export function personaGiftMemoryLine(gift: PersonaGiftEvent) {
  return `（送出礼物${gift.icon}「${gift.name}」${gift.note ? `，附言：${gift.note}` : ''}）`
}

/** 这个人格所有窗口里的礼物往来，按时间排；thread 传进来时用它替换同 id 的窗口（本轮还没写进状态的消息）。 */
export function personaGiftHistory(threads: Array<{ id: string; messages: Array<{ role: string; gift?: PersonaGiftEvent }> }>, current?: { id: string; messages: Array<{ role: string; gift?: PersonaGiftEvent }> }): PersonaGiftEvent[] {
  const all = current ? [...threads.filter((item) => item.id !== current.id), current] : threads
  return all.flatMap((thread) => thread.messages.flatMap((message) => message.gift ? [message.gift] : [])).sort((a, b) => a.createdAt - b.createdAt)
}

const giftDay = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }
export const PERSONA_GIFT_PROMPT_HISTORY = 12

/**
 * 稳定前缀里的说明：只在礼物架或礼物往来变化时变，平时每轮一样，缓存照样命中。
 * enabled=false（关了「让 TA 送礼物」）时只留「她送的礼物卡是真事」和往来记录，不教 TA 送。
 */
const giftRow = (item: PersonaGiftEvent) => {
  const who = item.direction === 'user-to-role' ? '{{user}}送你' : '你送{{user}}'
  return `- ${giftDay(item.createdAt)}：${who}${item.icon}「${item.name}」${item.note ? `，附言“${item.note}”` : ''}`
}
/** v236：常驻只留最近两次往来，更早的聊到礼物时再附上。 */
export const PERSONA_GIFT_STABLE_HISTORY = 2
const GIFT_TOPIC = /礼物|送你|送我|送的|收到|🎁|回礼|礼物架/

/** v236：她这一轮（或他上一条）聊到礼物、或点到某件礼物的名字时，附上更早的往来；否则空串。 */
export function personaGiftRecallNote(history: PersonaGiftEvent[], scan: string): string {
  const older = history.slice(-PERSONA_GIFT_PROMPT_HISTORY, -PERSONA_GIFT_STABLE_HISTORY)
  if (!older.length || !scan.trim()) return ''
  if (!GIFT_TOPIC.test(scan) && !older.some((item) => item.name.length >= 2 && scan.includes(item.name))) return ''
  return `【更早的礼物往来｜聊到礼物才附上】\n${older.map(giftRow).join('\n')}`
}

export function buildPersonaGiftPrompt(shelf: PersonaGift[] | undefined, history: PersonaGiftEvent[] = [], options: { enabled?: boolean; historyLimit?: number } = {}): string {
  const enabled = options.enabled !== false
  const list = normalizePersonaGifts(shelf)
  const recent = list.slice(-PERSONA_GIFT_PROMPT_SHELF)
  const rows = history.slice(-Math.min(PERSONA_GIFT_PROMPT_HISTORY, options.historyLimit ?? PERSONA_GIFT_PROMPT_HISTORY)).map(giftRow)
  const past = rows.length ? `你们最近的礼物往来：\n${rows.join('\n')}\n只在相关时自然记起，不要逐条复述，不要提“系统、记录、礼物账本”。` : ''
  const receive = '{{user}}可以把礼物卡送给你（消息里写作「🎁 礼物事件｜…」）：那是已经真实发生的事，按你的人设自然接住，不要像客服复述商品资料。'
  if (!enabled) return ['【礼物往来】', receive, past].filter(Boolean).join('\n')
  return [
    '【双向礼物｜你们之间可以互送礼物】',
    receive,
    '当你自己确实想送{{user}}一份礼物时（偶尔，不是每轮），可以在回复最后单独一行写 [送礼:礼物ID|你的附言]，应用会把它变成由你送出的礼物卡。',
    `图鉴里的礼物：${PERSONA_GIFT_CATALOG.map((item) => `${item.id}=${item.name}`).join('、')}。`,
    recent.length ? `你们的礼物架（也可以 [送礼:名称|附言] 送出）：${recent.map((item) => `${item.icon}${item.name}${item.maker === 'role' ? '（你做的）' : '（{{user}}做的）'}`).join('、')}。` : '',
    '图鉴里没有你想送的，也可以亲手做一份：在回复最后单独一行写 [自制礼物:一个emoji|礼物名|一句描述|你的附言]，礼物名 12 字内，它会放进你们的礼物架。',
    recent.some((item) => item.maker === 'role') ? '你做过的别重复做同一份。' : '',
    '每轮最多送一份；不要为了展示硬送，也不要说送了却不写标记。这一行不会显示给{{user}}，正文里不用解释它。',
    past,
  ].filter(Boolean).join('\n')
}

export type PersonaGiftTab = (typeof PERSONA_GIFT_CATEGORIES)[number]['id']

/** 礼物架（新的在前）。 */
export const giftShelfFor = (shelf: PersonaGift[] | undefined) => normalizePersonaGifts(shelf).reverse()

/** 图鉴网格：全部=礼物架+图鉴，自制=礼物架，其余按分类。 */
export function giftTiles(tab: PersonaGiftTab, mine: PersonaGift[]): Array<PersonaGiftCatalogItem | PersonaGift> {
  if (tab === 'all') return [...mine, ...PERSONA_GIFT_CATALOG]
  if (tab === 'custom') return mine
  return PERSONA_GIFT_CATALOG.filter((item) => item.category === tab)
}

/** 礼物卡上那行小字：自制且是送礼人自己做的 →「亲手做给」，否则「送给」。 */
export function giftCardLabel(gift: PersonaGiftEvent, from: string, to: string) {
  const own = gift.custom && gift.maker === (gift.direction === 'user-to-role' ? 'user' : 'role')
  return `${from} ${own ? '亲手做给' : '送给'} ${to}`
}

/** 「看看 TA 会送我什么」发出的那句话。 */
export const PERSONA_GIFT_REQUEST_TEXT = '我想看看你会送我什么。别问我，按你现在的心意从礼物图鉴里挑一份送给我，或者亲手做一份。'
