import { describe, expect, it } from 'vitest'
import { addPeriodRange, averageCycle, averageLength, dayMark, emptyPeriodLog, markPeriodEnd, markPeriodStart, monthGrid, normalizePeriodLog, periodStats, periodTurnNote, type PeriodLogState } from './periodLog'
import { emptyPeople, matchMentionedPeople, normalizePeople, peopleTurnNote, upsertPerson, type PeopleState } from './peopleProfiles'
import { buildPersonaRequest, peopleScanTexts } from './personaWindowRuntime'
import { activeThread, emptyPersonaState, enablePersona } from './personaWindow'
import type { Character } from './characterCard'

const log = (...ranges: Array<[string, string | null]>): PeriodLogState => ({ enabled: true, entries: ranges.map(([start, end], i) => ({ id: `e${i}`, start, end })) })

describe('经期记录 (v230)', () => {
  it('averages cycle and length from recorded ranges, ignoring missed-log gaps', () => {
    const state = log(['2026-08-01', '2026-08-05'], ['2026-08-30', '2026-09-03'], ['2026-09-29', '2026-10-04'], ['2026-12-20', '2026-12-24'])
    expect(averageCycle(state.entries)).toBe(30) // 29, 30 counted (29.5 → 30); 82-day gap skipped
    expect(averageLength(state.entries)).toBe(5)
    expect(averageCycle([])).toBe(28)
    expect(averageLength([{ id: 'x', start: '2026-01-01', end: null }])).toBe(5)
  })

  it('reports the phase: in period, premenstrual, late, after period, ovulation', () => {
    const state = log(['2026-10-01', '2026-10-05'], ['2026-10-29', null])
    const during = periodStats(state, '2026-10-30')
    expect(during.phase).toBe('period')
    expect(during.periodDay).toBe(2)
    expect(during.label).toBe('经期中 · 第 2 天')
    expect(during.short).toBe('经期第2天')

    const closed = log(['2026-10-01', '2026-10-05'], ['2026-10-29', '2026-11-02'])
    expect(periodStats(closed, '2026-11-04').phase).toBe('afterPeriod')
    expect(periodStats(closed, '2026-11-12').phase).toBe('ovulation') // next 11-26, ovulation 11-12
    expect(periodStats(closed, '2026-11-24')).toMatchObject({ phase: 'premenstrual', daysUntilNext: 2 })
    expect(periodStats(closed, '2026-11-26').label).toBe('预计今天来')
    expect(periodStats(closed, '2026-11-29')).toMatchObject({ phase: 'late', daysUntilNext: -3, short: '晚了3天' })
    expect(periodStats(emptyPeriodLog(), '2026-11-29')).toMatchObject({ hasData: false, phase: 'none' })
  })

  it('marks start/end today and merges backfilled ranges', () => {
    let state = markPeriodStart(emptyPeriodLog(), '2026-11-10')
    expect(state.entries).toHaveLength(1)
    expect(markPeriodStart(state, '2026-11-11')).toBe(state) // already open
    state = markPeriodEnd(state, '2026-11-14')
    expect(state.entries[0]).toMatchObject({ start: '2026-11-10', end: '2026-11-14' })
    state = addPeriodRange(state, '2026-10-12', '2026-10-16', '2026-11-14')
    state = addPeriodRange(state, '2026-10-15', '2026-10-18', '2026-11-14') // overlaps → merged
    expect(state.entries.map((e) => [e.start, e.end])).toEqual([['2026-10-12', '2026-10-18'], ['2026-11-10', '2026-11-14']])
    expect(addPeriodRange(state, '2026-12-01', null, '2026-11-14')).toBe(state) // future start refused
  })

  it('marks calendar days and builds a Monday-first month grid', () => {
    const state = log(['2026-10-01', '2026-10-05'], ['2026-10-29', '2026-11-02'])
    const stats = periodStats(state, '2026-11-13')
    expect(dayMark(state, '2026-10-30', '2026-11-13', stats)).toBe('period')
    expect(dayMark(state, '2026-11-26', '2026-11-13', stats)).toBe('predicted')
    expect(dayMark(state, '2026-11-20', '2026-11-13', stats)).toBeNull()
    const grid = monthGrid(2026, 10) // November 2026 starts on Sunday
    expect(grid.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01'])
  })

  it('keeps the tail note short, only on notable days, and off when disabled', () => {
    const state = log(['2026-10-01', '2026-10-05'], ['2026-10-29', null])
    const note = periodTurnNote(state, '2026-10-30', '周惟惟')
    expect(note).toContain('周惟惟今天经期第 2 天')
    expect(note).toContain('不给医疗建议')
    expect(note.length).toBeLessThan(120)
    expect(periodTurnNote({ ...state, enabled: false }, '2026-10-30')).toBe('')
    expect(periodTurnNote(log(['2026-10-29', '2026-11-02']), '2026-11-12')).toBe('')
  })

  it('normalizes bad stored data', () => {
    const state = normalizePeriodLog({ enabled: false, entries: [{ start: '2026-02-30x' }, { start: '2026-03-01', end: '2026-02-01' }, 'x'] })
    expect(state.enabled).toBe(false)
    expect(state.entries).toHaveLength(1)
    expect(state.entries[0].end).toBeNull()
  })
})

const people = (): PeopleState => {
  let state = emptyPeople()
  state = upsertPerson(state, { id: 'a', name: '林小满', aliases: ['满满', '小'], relation: '大学室友', notes: '在杭州做设计。' }, 1)
  state = upsertPerson(state, { id: 'b', name: '妈妈', aliases: ['老妈'], relation: '母亲', notes: '' }, 2)
  state = upsertPerson(state, { id: 'c', name: 'Shutiao', aliases: [], relation: '朋友', notes: '' }, 3)
  return state
}

describe('人物档案召回 (v230)', () => {
  it('matches names and aliases (two chars or more, case-insensitive), newest message weighted highest', () => {
    const list = people().people
    expect(matchMentionedPeople(list, ['今天和满满吃饭了']).map((p) => p.id)).toEqual(['a'])
    expect(matchMentionedPeople(list, ['小区门口下雨'])).toEqual([]) // single-char alias 「小」 never matches
    expect(matchMentionedPeople(list, ['shutiao 说要来']).map((p) => p.id)).toEqual(['c'])
    expect(matchMentionedPeople(list, ['林小满来了', '老妈打电话了']).map((p) => p.id)).toEqual(['b', 'a'])
    expect(matchMentionedPeople(list, ['a', 'b', 'c', '妈妈'], 1).map((p) => p.id)).toEqual(['b'])
  })

  it('builds a short tail block, empty when nobody is mentioned or disabled', () => {
    const state = people()
    const note = peopleTurnNote(state, ['你还记得满满吗'])
    expect(note).toContain('◆ 林小满（也叫：满满、小） · 大学室友')
    expect(note).toContain('在杭州做设计。')
    expect(note).not.toContain('妈妈')
    expect(peopleTurnNote(state, ['今天好累'])).toBe('')
    expect(peopleTurnNote({ ...state, enabled: false }, ['满满'])).toBe('')
  })

  it('normalizes stored people and drops nameless entries', () => {
    const state = normalizePeople({ people: [{ name: '  ' }, { name: '阿杰', aliases: ['杰哥', '杰哥', 3], notes: 5 }] })
    expect(state.enabled).toBe(true)
    expect(state.people).toHaveLength(1)
    expect(state.people[0]).toMatchObject({ name: '阿杰', aliases: ['杰哥'], notes: '' })
  })
})

const card: Character = {
  id: 'yu', name: '虞山行', tagline: '', description: '', personality: '', scenario: '', greeting: '', alternateGreetings: [],
  mesExample: '', systemPrompt: '', postHistoryInstructions: '', creatorNotes: '', creator: '', characterVersion: '', tags: [], regexScripts: [],
  characterBook: { name: '', entries: [] },
}

describe('人格窗口尾巴接入 (v230)', () => {
  it('puts the period line and mentioned people into 【本轮背景】, never into the stable system prompt', () => {
    const persona = enablePersona(emptyPersonaState(), 'yu').personas[0]
    const history = [
      { id: 1, role: 'user' as const, text: '昨天林小满来找我', createdAt: 1 },
      { id: 2, role: 'assistant' as const, text: '她还好吗？', createdAt: 2 },
      { id: 3, role: 'user' as const, text: '肚子有点疼', createdAt: 3 },
    ]
    expect(peopleScanTexts(history)).toEqual(['她还好吗？', '昨天林小满来找我', '肚子有点疼'])
    const deps = {
      character: card, user: { name: '周惟惟', description: '' }, api: { baseUrl: '', apiKey: '', modelName: '' }, memoryApi: { baseUrl: '', apiKey: '', modelName: '' },
      temperature: 1, topP: 1, maxTokens: 100, streaming: false, memoryLength: 40, pastLife: () => '',
      period: () => periodTurnNote(log(['2026-10-29', null]), '2026-10-30', '周惟惟'),
      people: (texts: string[]) => peopleTurnNote(people(), texts),
    }
    const request = buildPersonaRequest(persona, history, deps, activeThread(persona))
    const system = String(request[0].content)
    const last = String(request[request.length - 1].content)
    expect(system).not.toContain('经期')
    expect(system).not.toContain('林小满')
    expect(last.startsWith('肚子有点疼')).toBe(true)
    expect(last).toContain('【本轮背景')
    expect(last).toContain('周惟惟今天经期第 2 天')
    expect(last).toContain('◆ 林小满')
  })
})
