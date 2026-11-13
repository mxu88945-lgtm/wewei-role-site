/**
 * v230 人物档案（移植自伯恩 src/lib/people.ts / peopleRecall.ts 的核心部分）。
 * 她现实生活里的人：名字、别名、和她的关系、备注。最近的对话提到谁（名字或别名），
 * 就把谁的档案接进人格窗口的【本轮背景】。纯函数；存储在 peopleStore.ts（weijing.people，会进备份）。
 */

export const PEOPLE_KEY = 'weijing.people'

/** v232：TA 记下的带日期的新事件（旧数据没有 events，读出来是 []）。 */
export type PersonEvent = {
  id: string
  /** 本地日期 YYYY-MM-DD */
  date: string
  text: string
  createdAt: number
  /** 写入它的那条回复（`threadId:messageId`）；重新生成时据此收回。手动的没有。 */
  source?: string
}

export type Person = {
  id: string
  name: string
  aliases: string[]
  /** 和她的关系，一句话（妈妈、大学室友、同事……） */
  relation: string
  notes: string
  /** v232：按日期的新事件，旧到新。 */
  events: PersonEvent[]
  /** v232：由 TA 的标签新建时记下来源回复；她手动保存过就不再有。 */
  createdFrom?: string
  updatedAt: number
}

export type PeopleState = {
  /** 提到时让 TA 想起（注入尾巴）。 */
  enabled: boolean
  /** v232：让 TA 自己记（回复末尾的 [人物:…] 标签），默认开。 */
  selfRecord: boolean
  people: Person[]
}

export const PERSON_NOTES_LIMIT = 600
export const PERSON_EVENT_LIMIT = 60
export const PERSON_EVENT_TEXT_LIMIT = 200
export const PERSON_TAGS_PER_REPLY = 2
const NOTE_CLIP = 240
const MAX_RECALLED = 3
/** 召回时每人带最近几条事件、每条截多长；整段尾巴的总长上限。 */
const RECALL_EVENTS = 3
const RECALL_EVENT_CLIP = 80
const RECALL_TOTAL_LIMIT = 1200

export function emptyPeople(): PeopleState {
  return { enabled: true, selfRecord: true, people: [] }
}

export const newPersonEventId = () => `pev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
export const newPersonId = () => `person-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : ''

export function parseAliases(raw: string): string[] {
  return Array.from(new Set(raw.split(/[,，、/\s]+/u).map((item) => item.trim()).filter(Boolean))).slice(0, 12)
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

function normalizeEvents(raw: unknown): PersonEvent[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item): PersonEvent[] => {
    if (!item || typeof item !== 'object') return []
    const e = item as Record<string, unknown>
    const body = text(e.text, PERSON_EVENT_TEXT_LIMIT).trim()
    if (!body) return []
    const createdAt = typeof e.createdAt === 'number' && Number.isFinite(e.createdAt) ? e.createdAt : 0
    const date = typeof e.date === 'string' && DATE.test(e.date) ? e.date : dayOf(createdAt || Date.now())
    const source = text(e.source, 120)
    return [{ id: typeof e.id === 'string' && e.id ? e.id : newPersonEventId(), date, text: body, createdAt, ...(source ? { source } : {}) }]
  }).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).slice(-PERSON_EVENT_LIMIT)
}

export function normalizePeople(raw: unknown): PeopleState {
  if (!raw || typeof raw !== 'object') return emptyPeople()
  const value = raw as { enabled?: unknown; selfRecord?: unknown; people?: unknown }
  const people = Array.isArray(value.people) ? value.people.flatMap((item): Person[] => {
    if (!item || typeof item !== 'object') return []
    const p = item as Record<string, unknown>
    const name = text(p.name, 40).trim()
    if (!name) return []
    return [{
      id: typeof p.id === 'string' && p.id ? p.id : newPersonId(),
      name,
      aliases: Array.isArray(p.aliases) ? parseAliases(p.aliases.filter((a): a is string => typeof a === 'string').join(',')) : [],
      relation: text(p.relation, 60).trim(),
      notes: text(p.notes, PERSON_NOTES_LIMIT),
      events: normalizeEvents(p.events),
      ...(text(p.createdFrom, 120) ? { createdFrom: text(p.createdFrom, 120) } : {}),
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
    }]
  }) : []
  return { enabled: value.enabled !== false, selfRecord: value.selfRecord !== false, people }
}

/** 编辑页保存：名字、别名、关系、备注由她改；事件保留原样（不传 events 时）。她保存过的人不再被「重新生成」收回。 */
export function upsertPerson(state: PeopleState, person: Omit<Person, 'updatedAt' | 'events' | 'createdFrom'> & { events?: PersonEvent[] }, now = Date.now()): PeopleState {
  const previous = state.people.find((item) => item.id === person.id)
  const clean: Person = { id: person.id, name: person.name.trim().slice(0, 40), relation: person.relation.trim().slice(0, 60), notes: person.notes.slice(0, PERSON_NOTES_LIMIT), aliases: parseAliases(person.aliases.join(',')), events: person.events ?? previous?.events ?? [], updatedAt: now }
  if (!clean.name) return state
  return { ...state, people: previous ? state.people.map((item) => item.id === clean.id ? clean : item) : [...state.people, clean] }
}

export function removePersonEvent(state: PeopleState, personId: string, eventId: string, now = Date.now()): PeopleState {
  return { ...state, people: state.people.map((item) => item.id === personId && item.events.some((event) => event.id === eventId) ? { ...item, events: item.events.filter((event) => event.id !== eventId), updatedAt: now } : item) }
}

export function removePerson(state: PeopleState, id: string): PeopleState {
  return { ...state, people: state.people.filter((item) => item.id !== id) }
}

/** 名字和别名里能拿来匹配的：至少两个字（单字太容易误命中，如「妈」「哥」常出现在别的词里）。 */
export function matchNames(person: Person): string[] {
  return [person.name, ...person.aliases].map((name) => name.trim()).filter((name) => Array.from(name).length >= 2)
}

const contains = (haystack: string, needle: string) => haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase())

/**
 * 最近的对话里提到的人（最新在后）。最新一条命中权重最高，往前依次递减；一次最多 3 人。
 * texts 通常是：她最近两句 + TA 最近一句。
 */
export function matchMentionedPeople(people: Person[], texts: string[], max = MAX_RECALLED): Person[] {
  const recent = texts.filter((item) => item && item.trim()).slice(-3)
  if (!recent.length) return []
  const scored: Array<{ person: Person; score: number; order: number }> = []
  people.forEach((person, order) => {
    const names = matchNames(person)
    if (!names.length) return
    let score = 0
    recent.forEach((item, index) => {
      if (names.some((name) => contains(item, name))) score += index === recent.length - 1 ? 10 : 4 + index
    })
    if (score) scored.push({ person, score, order })
  })
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, max).map((item) => item.person)
}

function dayOf(at: number) {
  const date = new Date(at)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const clip = (value: string, max: number) => {
  const flat = value.replace(/\s+\n/g, '\n').trim()
  return Array.from(flat).length > max ? `${Array.from(flat).slice(0, max).join('')}…` : flat
}

/** 「11月13日」；不是今年的带年份。 */
export function eventDateLabel(date: string, today = dayOf(Date.now())): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return ''
  return `${match[1] !== today.slice(0, 4) ? `${match[1]}年` : ''}${Number(match[2])}月${Number(match[3])}日`
}

export function personBlock(person: Person, today = dayOf(Date.now())): string {
  const alias = person.aliases.length ? `（也叫：${person.aliases.join('、')}）` : ''
  const events = (person.events || []).slice(-RECALL_EVENTS).map((event) => `· ${eventDateLabel(event.date, today)}：${clip(event.text, RECALL_EVENT_CLIP)}`)
  return [
    `◆ ${person.name}${alias}${person.relation ? ` · ${person.relation}` : ''}`,
    person.notes.trim() ? clip(person.notes, NOTE_CLIP) : '',
    events.length ? `最近：\n${events.join('\n')}` : '',
  ].filter(Boolean).join('\n')
}

/** 人格窗口尾巴里的一段；没人被提到、或开关关着时返回空串。 */
export function peopleTurnNote(state: PeopleState, texts: string[], today = dayOf(Date.now())): string {
  if (!state.enabled) return ''
  const matched = matchMentionedPeople(state.people, texts)
  if (!matched.length) return ''
  const blocks: string[] = []
  let used = 0
  for (const person of matched) {
    const block = personBlock(person, today)
    const length = Array.from(block).length
    if (blocks.length && used + length > RECALL_TOTAL_LIMIT) break
    blocks.push(length > RECALL_TOTAL_LIMIT ? clip(block, RECALL_TOTAL_LIMIT) : block)
    used += length
  }
  return `【她生活里的人｜刚提到，现实中的人，不是角色】\n${blocks.join('\n')}\n事情归谁就是谁的，别安到她或你自己身上；日期只用上面写明的；自然接上就好，不要提「档案」。`
}

// ---------- v232 TA 自己建档、自己补充 ----------
// 参照伯恩 src/lib/people.ts（extractPersonTags / applyPersonTag）与顾祁砚 v354（只有她最近两条消息里
// 出现过这个名字才写入，只记她亲口说的事实）。

/** 第一条 system 稳定前缀里的说明：固定文字，只随「让 TA 自己记」开关变，缓存照样命中。 */
export const PEOPLE_TAG_PROMPT = [
  '【人物档案｜你可以帮{{user}}记住她身边的人】',
  '当{{user}}提到她现实生活里的某个人，并说了关于这个人的新事实或新发生的事（和她的关系、背景、近况、两人之间发生了什么）时，可以在回复最后单独一行写 [人物:名字|一句话]，例如 [人物:林小满|大学室友，现在在杭州做设计]。没记过的人写一句背景，记过的人写一句新近况（应用会自动标日期、去重）。',
  '只记{{user}}亲口说的事实，不记你自己的说法、猜测或剧情，也不记你自己和{{user}}本人；名字用{{user}}说的那个。每轮最多两条，没有新事实就不写。这一行不会显示给{{user}}，正文里不用提它。',
].join('\n')

export type PersonTag = { name: string; content: string }

const OPEN = '[【［'
const CLOSE = '\\]】］'
const PERSON_TAG = new RegExp(`[${OPEN}]\\s*人物\\s*[:：]\\s*([^|｜${CLOSE}\\n]+?)\\s*[|｜]\\s*([^${CLOSE}\\n]+?)\\s*[${CLOSE}]`, 'g')
/** 不合规的完整标记（少了竖线等）也不让它露出来。 */
const LOOSE_PERSON_TAG = new RegExp(`[${OPEN}]\\s*人物\\s*[:：][^${CLOSE}\\n]*[${CLOSE}]`, 'g')
/** 流式末尾写到一半：「[人」「[人物:林小」「【人物：林小满|大学」。 */
const PARTIAL_PERSON_TAG = new RegExp(`[${OPEN}]\\s*人(?:物(?:\\s*[:：][^${CLOSE}\\n]{0,400})?)?$`)

/** 名字里去掉括号、竖线、冒号和换行，最多 20 字。 */
export function cleanPersonName(value: string): string {
  return value.replace(/[[\]【】［］|｜:：\n\r]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20)
}

/** 回复里合规的 [人物:名字|内容]（去重，最多两条）。 */
export function parsePersonTags(value: string, max = PERSON_TAGS_PER_REPLY): PersonTag[] {
  const tags: PersonTag[] = []
  for (const match of (value || '').matchAll(PERSON_TAG)) {
    const name = cleanPersonName(match[1] || '')
    const content = (match[2] || '').replace(/[|｜]/g, '，').replace(/\s+/g, ' ').trim().slice(0, PERSON_EVENT_TEXT_LIMIT)
    if (!name || Array.from(content).length < 2 || tags.some((tag) => tag.name === name && tag.content === content)) continue
    tags.push({ name, content })
    if (tags.length >= max) break
  }
  return tags
}

export function stripPersonTags(value: string): string {
  if (!value) return value
  return value
    .replace(PERSON_TAG, '')
    .replace(LOOSE_PERSON_TAG, '')
    .replace(PARTIAL_PERSON_TAG, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

/** 名字或别名（不分大小写、忽略空白）完全相同的人。 */
export function findPersonByName(people: Person[], name: string): Person | undefined {
  const key = cleanPersonName(name).replace(/\s+/g, '').toLocaleLowerCase()
  if (!key) return undefined
  return people.find((person) => [person.name, ...person.aliases].some((item) => item.replace(/\s+/g, '').toLocaleLowerCase() === key))
}

const factKey = (value: string) => value.toLocaleLowerCase().replace(/[\s，。,.!！?？、；;：:“”"'‘’（）()【】[\]…~～-]+/gu, '')

/** 同一句话（忽略空白标点）或互相包含（6 字以上）就算重复。 */
export function personFactDuplicate(person: Person, content: string): boolean {
  const key = factKey(content)
  if (!key) return true
  return [person.notes, ...person.events.map((event) => event.text)].some((existing) => {
    const other = factKey(existing)
    if (!other) return false
    if (other === key) return true
    return Math.min(other.length, key.length) >= 6 && (other.includes(key) || key.includes(other))
  })
}

export type PersonTagContext = {
  /** 她最近两条消息（只有出现过这个名字/别名才写入）。 */
  userTexts: string[]
  /** 这条回复的来源 `threadId:messageId`。 */
  source: string
  /** 今天，本地 YYYY-MM-DD。 */
  today: string
  /** 不记的名字：TA 自己、她本人。 */
  exclude?: string[]
  now?: number
}

export type PersonTagResult = 'created' | 'event' | 'background' | 'duplicate' | 'unmentioned' | 'excluded' | 'invalid'

/**
 * 合并一条标签。名字/别名没命中 → 新建，内容作为备注；命中 → 带日期的新事件（去重）。
 * 「背景：…」开头且备注还空着时填进备注。她最近两条消息里没出现这个名字 → 不写。
 */
export function applyPersonTag(state: PeopleState, tag: PersonTag, context: PersonTagContext): { state: PeopleState; result: PersonTagResult; name: string } {
  const now = context.now ?? Date.now()
  const name = cleanPersonName(tag.name)
  if (!name) return { state, result: 'invalid', name }
  const nameKey = name.toLocaleLowerCase()
  if ((context.exclude || []).some((item) => item.trim() && item.trim().toLocaleLowerCase() === nameKey)) return { state, result: 'excluded', name }
  const existing = findPersonByName(state.people, name)
  const recent = context.userTexts.filter(Boolean).slice(-2).join('\n').toLocaleLowerCase()
  const candidates = existing ? [existing.name, ...existing.aliases, name] : [name]
  if (!candidates.some((item) => item.trim() && recent.includes(item.trim().toLocaleLowerCase()))) return { state, result: 'unmentioned', name }
  const backgroundOnly = /^背景\s*[:：]/.test(tag.content)
  const content = tag.content.replace(/^(?:背景|事件)\s*[:：]\s*/, '').trim().slice(0, PERSON_EVENT_TEXT_LIMIT)
  if (Array.from(content).length < 2) return { state, result: 'invalid', name }
  if (!existing) {
    const person: Person = { id: newPersonId(), name, aliases: [], relation: '', notes: content.slice(0, PERSON_NOTES_LIMIT), events: [], createdFrom: context.source, updatedAt: now }
    return { state: { ...state, people: [...state.people, person] }, result: 'created', name }
  }
  if (personFactDuplicate(existing, content)) return { state, result: 'duplicate', name: existing.name }
  if (backgroundOnly && !existing.notes.trim()) {
    return { state: { ...state, people: state.people.map((item) => item.id === existing.id ? { ...item, notes: content.slice(0, PERSON_NOTES_LIMIT), updatedAt: now } : item) }, result: 'background', name: existing.name }
  }
  const event: PersonEvent = { id: newPersonEventId(), date: context.today, text: content, createdAt: now, source: context.source }
  return {
    state: { ...state, people: state.people.map((item) => item.id === existing.id ? { ...item, events: [...item.events, event].slice(-PERSON_EVENT_LIMIT), updatedAt: now } : item) },
    result: 'event',
    name: existing.name,
  }
}

/** 一条回复里的所有标签依次合并；返回新状态和真正写进去的人名（去重）。 */
export function applyPersonTags(state: PeopleState, tags: PersonTag[], context: PersonTagContext): { state: PeopleState; saved: string[] } {
  let next = state
  const saved: string[] = []
  for (const tag of tags.slice(0, PERSON_TAGS_PER_REPLY)) {
    const applied = applyPersonTag(next, tag, context)
    next = applied.state
    if (['created', 'event', 'background'].includes(applied.result) && !saved.includes(applied.name)) saved.push(applied.name)
  }
  return { state: next, saved }
}

/** 重新生成：收回被换掉的那条回复写进来的事件，以及由它新建、她还没手动保存过的人。 */
export function undoPersonTags(state: PeopleState, source: string): PeopleState {
  if (!source) return state
  const touched = state.people.some((person) => person.createdFrom === source || person.events.some((event) => event.source === source))
  if (!touched) return state
  return {
    ...state,
    people: state.people
      .filter((person) => person.createdFrom !== source)
      .map((person) => person.events.some((event) => event.source === source) ? { ...person, events: person.events.filter((event) => event.source !== source) } : person),
  }
}
