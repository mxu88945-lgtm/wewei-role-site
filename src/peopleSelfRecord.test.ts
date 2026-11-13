import { describe, expect, it } from 'vitest'
import { applyPersonTag, applyPersonTags, emptyPeople, normalizePeople, parsePersonTags, peopleTurnNote, PEOPLE_TAG_PROMPT, removePersonEvent, stripPersonTags, undoPersonTags, upsertPerson, type PeopleState, type PersonTagContext } from './peopleProfiles'
import { personaReplyText } from './personaWindowPresentation'
import { buildPersonaRequest } from './personaWindowRuntime'
import { activeThread, emptyPersonaState, enablePersona } from './personaWindow'
import type { Character } from './characterCard'

const base = (): PeopleState => upsertPerson(emptyPeople(), { id: 'p1', name: '林小满', aliases: ['满满'], relation: '大学室友', notes: '在杭州做设计' }, 1)
const ctx = (userTexts: string[], extra: Partial<PersonTagContext> = {}): PersonTagContext => ({ userTexts, source: 't1:9', today: '2026-11-13', now: 100, ...extra })

describe('人物标签解析与隐藏 (v232)', () => {
  it('parses half- and full-width brackets, colons and bars; at most two per reply', () => {
    const tags = parsePersonTags('好呀\n[人物:林小满|她下个月搬去上海]\n【人物：阿杰｜我表哥，在深圳】\n［人物:小雨|第三条］')
    expect(tags).toEqual([{ name: '林小满', content: '她下个月搬去上海' }, { name: '阿杰', content: '我表哥，在深圳' }])
    expect(parsePersonTags('[人物:林小满|她下个月搬去上海][人物:林小满|她下个月搬去上海]')).toHaveLength(1)
    expect(parsePersonTags('[人物:林小满]')).toEqual([])
  })

  it('hides complete, malformed and half-streamed tags everywhere personaReplyText is used', () => {
    expect(stripPersonTags('嗯。\n[人物:林小满|搬家了]')).toBe('嗯。')
    expect(personaReplyText('嗯，替你高兴。\n【人物：阿杰｜我表哥】\n')).toBe('嗯，替你高兴。')
    expect(personaReplyText('等一下\n[人物:林小')).toBe('等一下')
    expect(personaReplyText('等一下\n【人')).toBe('等一下')
    expect(personaReplyText('坏掉的 [人物:只有名字] 也藏')).not.toContain('人物')
    expect(personaReplyText('人物很多的小说')).toBe('人物很多的小说')
  })
})

describe('人物标签写入 (v232)', () => {
  it('creates a new person with the content as notes when the name is unknown and she mentioned it', () => {
    const { state, result } = applyPersonTag(base(), { name: '阿杰', content: '我表哥，在深圳上班' }, ctx(['我表哥阿杰今天来了']))
    expect(result).toBe('created')
    const jie = state.people.find((p) => p.name === '阿杰')
    expect(jie).toMatchObject({ notes: '我表哥，在深圳上班', events: [], createdFrom: 't1:9' })
  })

  it('appends a dated event to a known person (name or alias), deduplicated', () => {
    const first = applyPersonTag(base(), { name: '满满', content: '下个月搬去上海' }, ctx(['满满说她下个月搬去上海']))
    expect(first.result).toBe('event')
    expect(first.name).toBe('林小满')
    expect(first.state.people[0].events).toEqual([{ id: expect.any(String), date: '2026-11-13', text: '下个月搬去上海', createdAt: 100, source: 't1:9' }])
    const again = applyPersonTag(first.state, { name: '林小满', content: '下个月 搬去上海。' }, ctx(['林小满下个月搬去上海']))
    expect(again.result).toBe('duplicate')
    expect(applyPersonTag(base(), { name: '林小满', content: '在杭州做设计' }, ctx(['林小满']))).toMatchObject({ result: 'duplicate' })
  })

  it('only writes names she said in her latest two messages, and never the character or herself', () => {
    expect(applyPersonTag(base(), { name: '阿杰', content: '表哥' }, ctx(['今天好累', '想睡觉'])).result).toBe('unmentioned')
    expect(applyPersonTag(base(), { name: '阿杰', content: '表哥' }, ctx(['阿杰来了', '今天好累', '想睡觉'])).result).toBe('unmentioned')
    expect(applyPersonTag(base(), { name: '虞山行', content: '她的恋人' }, ctx(['虞山行你在吗'], { exclude: ['虞山行', '周惟惟'] })).result).toBe('excluded')
  })

  it('fills empty notes from a 背景： tag instead of adding an event', () => {
    const blank = upsertPerson(emptyPeople(), { id: 'p2', name: '阿杰', aliases: [], relation: '', notes: '' }, 1)
    const applied = applyPersonTag(blank, { name: '阿杰', content: '背景：我表哥，在深圳' }, ctx(['阿杰']))
    expect(applied.result).toBe('background')
    expect(applied.state.people[0]).toMatchObject({ notes: '我表哥，在深圳', events: [] })
  })

  it('applies up to two tags, reports saved names, and undo on regenerate removes them', () => {
    const { state, saved } = applyPersonTags(base(), [{ name: '林小满', content: '换了新工作' }, { name: '阿杰', content: '我表哥' }, { name: '小雨', content: '第三个' }], ctx(['林小满换工作了，阿杰也来了，小雨']))
    expect(saved).toEqual(['林小满', '阿杰'])
    expect(state.people.map((p) => p.name)).toEqual(['林小满', '阿杰'])
    const undone = undoPersonTags(state, 't1:9')
    expect(undone.people.map((p) => p.name)).toEqual(['林小满'])
    expect(undone.people[0].events).toEqual([])
    expect(undoPersonTags(state, 'other')).toBe(state)
  })

  it('a person she saved by hand is no longer taken back by regenerate; editing keeps events', () => {
    const { state } = applyPersonTags(base(), [{ name: '阿杰', content: '我表哥' }], ctx(['阿杰']))
    const jie = state.people.find((p) => p.name === '阿杰')!
    const withEvent = applyPersonTag(state, { name: '阿杰', content: '最近在学吉他' }, ctx(['阿杰在学吉他'], { source: 't1:11' })).state
    const edited = upsertPerson(withEvent, { id: jie.id, name: '阿杰', aliases: ['杰哥'], relation: '表哥', notes: '在深圳' }, 200)
    const saved = edited.people.find((p) => p.id === jie.id)!
    expect(saved.createdFrom).toBeUndefined()
    expect(saved.events.map((e) => e.text)).toEqual(['最近在学吉他'])
    expect(undoPersonTags(edited, 't1:9').people.some((p) => p.id === jie.id)).toBe(true)
    expect(removePersonEvent(edited, jie.id, saved.events[0].id).people.find((p) => p.id === jie.id)!.events).toEqual([])
  })
})

describe('人物事件：兼容旧数据与召回 (v232)', () => {
  it('reads v230 data without events or selfRecord', () => {
    const state = normalizePeople({ enabled: true, people: [{ id: 'a', name: '阿杰', aliases: [], relation: '', notes: 'x', updatedAt: 1 }] })
    expect(state.selfRecord).toBe(true)
    expect(state.people[0].events).toEqual([])
    expect(normalizePeople({ selfRecord: false }).selfRecord).toBe(false)
    const fixed = normalizePeople({ people: [{ name: '阿杰', events: [{ text: '  ' }, { text: '学吉他', date: 'bad', createdAt: 0 }, 5] }] })
    expect(fixed.people[0].events).toHaveLength(1)
    expect(fixed.people[0].events[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('brings the latest three events with dates into the recall block, capped in length', () => {
    let state = base()
    ;['十月搬家', '换了新工作', '养了只猫', '开始学游泳'].forEach((text, i) => {
      state = applyPersonTag(state, { name: '林小满', content: text }, ctx(['林小满'], { today: `2026-11-0${i + 1}`, now: i })).state
    })
    const note = peopleTurnNote(state, ['林小满最近怎样'], '2026-11-13')
    expect(note).toContain('11月2日：换了新工作')
    expect(note).toContain('11月4日：开始学游泳')
    expect(note).not.toContain('十月搬家')
    const long = upsertPerson(emptyPeople(), { id: 'z', name: '阿杰', aliases: [], relation: '', notes: '长'.repeat(600) }, 1)
    expect(Array.from(peopleTurnNote(long, ['阿杰'], '2026-11-13')).length).toBeLessThan(1400)
    expect(peopleTurnNote(state, ['林小满'], '2027-01-01')).toContain('2026年11月4日')
  })
})

const card: Character = {
  id: 'yu', name: '虞山行', tagline: '', description: '', personality: '', scenario: '', greeting: '', alternateGreetings: [],
  mesExample: '', systemPrompt: '', postHistoryInstructions: '', creatorNotes: '', creator: '', characterVersion: '', tags: [], regexScripts: [],
  characterBook: { name: '', entries: [] },
}

describe('人物标签说明进稳定前缀 (v232)', () => {
  const persona = enablePersona(emptyPersonaState(), 'yu').personas[0]
  const deps = (selfRecord: boolean) => ({
    character: card, user: { name: '周惟惟', description: '' }, api: { baseUrl: '', apiKey: '', modelName: '' }, memoryApi: { baseUrl: '', apiKey: '', modelName: '' },
    temperature: 1, topP: 1, maxTokens: 100, streaming: false, memoryLength: 40, pastLife: () => '',
    peopleSelfRecord: () => selfRecord,
  })
  it('puts the instruction in the first system only when the switch is on, identical every turn', () => {
    const one = [{ id: 1, role: 'user' as const, text: '林小满搬家了', createdAt: 1 }]
    const two = [...one, { id: 2, role: 'assistant' as const, text: '真的？', createdAt: 2 }, { id: 3, role: 'user' as const, text: '嗯，去上海', createdAt: 3 }]
    const a = String(buildPersonaRequest(persona, one, deps(true), activeThread(persona))[0].content)
    const b = String(buildPersonaRequest(persona, two, deps(true), activeThread(persona))[0].content)
    expect(a).toContain('【人物档案｜你可以帮周惟惟记住她身边的人】')
    expect(a).toBe(b)
    expect(PEOPLE_TAG_PROMPT).toContain('[人物:名字|一句话]')
    const off = buildPersonaRequest(persona, one, deps(false), activeThread(persona))
    expect(String(off[0].content)).not.toContain('人物档案｜')
  })
})
