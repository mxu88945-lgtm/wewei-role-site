/**
 * v230 人物档案（移植自伯恩 src/lib/people.ts / peopleRecall.ts 的核心部分）。
 * 她现实生活里的人：名字、别名、和她的关系、备注。最近的对话提到谁（名字或别名），
 * 就把谁的档案接进人格窗口的【本轮背景】。纯函数；存储在 peopleStore.ts（weijing.people，会进备份）。
 */

export const PEOPLE_KEY = 'weijing.people'

export type Person = {
  id: string
  name: string
  aliases: string[]
  /** 和她的关系，一句话（妈妈、大学室友、同事……） */
  relation: string
  notes: string
  updatedAt: number
}

export type PeopleState = {
  /** 提到时让 TA 想起（注入尾巴）。 */
  enabled: boolean
  people: Person[]
}

export const PERSON_NOTES_LIMIT = 600
const NOTE_CLIP = 240
const MAX_RECALLED = 3

export function emptyPeople(): PeopleState {
  return { enabled: true, people: [] }
}

export const newPersonId = () => `person-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : ''

export function parseAliases(raw: string): string[] {
  return Array.from(new Set(raw.split(/[,，、/\s]+/u).map((item) => item.trim()).filter(Boolean))).slice(0, 12)
}

export function normalizePeople(raw: unknown): PeopleState {
  if (!raw || typeof raw !== 'object') return emptyPeople()
  const value = raw as { enabled?: unknown; people?: unknown }
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
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
    }]
  }) : []
  return { enabled: value.enabled !== false, people }
}

export function upsertPerson(state: PeopleState, person: Omit<Person, 'updatedAt'>, now = Date.now()): PeopleState {
  const clean: Person = { ...person, name: person.name.trim().slice(0, 40), relation: person.relation.trim().slice(0, 60), notes: person.notes.slice(0, PERSON_NOTES_LIMIT), aliases: parseAliases(person.aliases.join(',')), updatedAt: now }
  if (!clean.name) return state
  const exists = state.people.some((item) => item.id === clean.id)
  return { ...state, people: exists ? state.people.map((item) => item.id === clean.id ? clean : item) : [...state.people, clean] }
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

const clip = (value: string, max: number) => {
  const flat = value.replace(/\s+\n/g, '\n').trim()
  return Array.from(flat).length > max ? `${Array.from(flat).slice(0, max).join('')}…` : flat
}

export function personBlock(person: Person): string {
  const alias = person.aliases.length ? `（也叫：${person.aliases.join('、')}）` : ''
  return [
    `◆ ${person.name}${alias}${person.relation ? ` · ${person.relation}` : ''}`,
    person.notes.trim() ? clip(person.notes, NOTE_CLIP) : '',
  ].filter(Boolean).join('\n')
}

/** 人格窗口尾巴里的一段；没人被提到、或开关关着时返回空串。 */
export function peopleTurnNote(state: PeopleState, texts: string[]): string {
  if (!state.enabled) return ''
  const matched = matchMentionedPeople(state.people, texts)
  if (!matched.length) return ''
  return `【她生活里的人｜刚提到，现实中的人，不是角色】\n${matched.map(personBlock).join('\n')}\n事情归谁就是谁的，别安到她或你自己身上；自然接上就好，不要提「档案」。`
}
