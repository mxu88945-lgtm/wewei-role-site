import { describe, expect, it } from 'vitest'
import { buildGroupSystemBlock, parseGuestKicks } from './personaGroup'
import { personaReplyText } from './personaWindowPresentation'
import { normalizePersonaState } from './personaWindow'

const guests = [{ id: 'guest-a', name: '墨墨' }, { id: 'guest-b', name: '阿七' }]

describe('v258 请出客人', () => {
  it('parses only present guests, once each', () => {
    expect(parseGuestKicks('出去。\n[请出:墨墨]\n[请出：墨墨][请出:路人]', guests).map((g) => g.id)).toEqual(['guest-a'])
    expect(parseGuestKicks('[请出:@阿七]', guests).map((g) => g.id)).toEqual(['guest-b'])
  })
  it('the tag never shows', () => {
    expect(personaReplyText('慢走，不送。\n[请出:墨墨]')).not.toContain('请出')
    expect(personaReplyText('慢走。[请')).not.toContain('[请')
  })
  it('rule only appears when the switch is on', () => {
    const plan = { mode: 'natural' as const, guests: [{ id: 'guest-a', name: '墨墨', main: false, persona: '', world: '', memories: [] }] }
    expect(buildGroupSystemBlock(plan, { char: '谢聿衡', user: '惟惟' })).not.toContain('[请出:')
    expect(buildGroupSystemBlock(plan, { char: '谢聿衡', user: '惟惟' }, new Set(), new Map(), true)).toContain('[请出:客人名字]')
  })
  it('switch persists, default off', () => {
    const state = normalizePersonaState({ personas: [{ id: 'p1', characterId: 'c1', hostKickEnabled: true, threads: [] }, { id: 'p2', characterId: 'c2', threads: [] }] })
    expect(state.personas.find((p) => p.id === 'p1')?.hostKickEnabled).toBe(true)
    expect(state.personas.find((p) => p.id === 'p2')?.hostKickEnabled).toBeUndefined()
  })
})

describe('v259 幕后手记只属于主人格', () => {
  it('group rule fences backstage from guests', () => {
    const plan = { mode: 'natural' as const, guests: [{ id: 'guest-a', name: '顾墨', main: false, persona: '', world: '', memories: [] }] }
    expect(buildGroupSystemBlock(plan, { char: '谢聿衡', user: '惟惟' })).toContain('〔幕后手记与戏外私聊〕只是谢聿衡本人')
  })
})

describe('v260 客人在场时不带幕后手记', () => {
  it('drops backstage chunks only when guests are present', async () => {
    const { withoutBackstageWhenGuests } = await import('./personaWindowRuntime')
    const chunks = [
      { key: 'a', label: '幕后手记与戏外私聊', title: '幕后手记与戏外私聊', kind: '幕后手记', bound: false, names: [], text: 'x' },
      { key: 'b', label: '剧场｜夜', title: '夜', kind: '长剧情', bound: false, names: [], text: 'y' },
    ]
    expect(withoutBackstageWhenGuests(chunks, true).map((c) => c.key)).toEqual(['b'])
    expect(withoutBackstageWhenGuests(chunks, false)).toHaveLength(2)
  })
})
