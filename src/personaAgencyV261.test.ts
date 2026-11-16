import { describe, expect, it } from 'vitest'
import { addPrivateNotes, afterReplyBody, agencyPrompt, currentBody, parseBodyTag, parseDuration, parsePauseTag, parseRoomTags, parseShareTitles, hasResumeTag, canAskNote } from './personaAgency'
import { personaReplyText } from './personaWindowPresentation'
import { normalizePersonaState } from './personaWindow'

describe('v261 TA 的小天地', () => {
  it('parses pause durations and clamps them', () => {
    expect(parseDuration('30分钟')).toBe(30 * 60_000)
    expect(parseDuration('2小时')).toBe(2 * 3600_000)
    expect(parseDuration('半小时')).toBe(30 * 60_000)
    expect(parseDuration('三天')).toBe(24 * 3600_000)
    const pause = parsePauseTag('我先冷静一下。\n[暂停:2小时|我想一个人静静]', 1000)
    expect(pause).toEqual({ until: 1000 + 2 * 3600_000, reason: '我想一个人静静', at: 1000 })
    expect(hasResumeTag('好，回来吧。[继续]')).toBe(true)
  })
  it('room notes: write, rewrite by title, share', () => {
    const notes = parseRoomTags('嗯。\n[隐私室:那天的雨|其实我在楼下等了很久。\n没敢上去。]')
    expect(notes).toEqual([{ title: '那天的雨', text: '其实我在楼下等了很久。\n没敢上去。' }])
    const room = addPrivateNotes(addPrivateNotes([], notes, 1), [{ title: '那天的雨', text: '改过' }], 2)
    expect(room).toHaveLength(1)
    expect(room[0].text).toBe('改过')
    expect(parseShareTitles('给你看。[分享:《那天的雨》]')).toEqual(['那天的雨'])
    expect(canAskNote({ ...room[0], declinedAt: Date.now() })).toBe(false)
  })
  it('tags never show in the bubble', () => {
    const shown = personaReplyText('先这样。\n[隐私室:秘密|第一行\n第二行]\n[状态:精力 40|困意 70|有点累]\n[继续]\n[暂停:1小时|冷静]\n[分享:秘密]')
    expect(shown).toBe('先这样。')
  })
  it('body state recovers with time and tires with chat', () => {
    const noon = new Date(2026, 10, 16, 12).getTime()
    const tired = { energy: 30, sleepy: 15, note: '', at: noon }
    expect(currentBody(tired, noon + 2 * 3600_000).energy).toBe(50)
    expect(afterReplyBody(tired, null, noon).energy).toBe(28.5)
    expect(afterReplyBody(tired, parseBodyTag('[状态:精力 70|困意 20|洗了个澡]'), noon)).toMatchObject({ energy: 70, sleepy: 20, note: '洗了个澡' })
    const night = new Date(2026, 10, 16, 3).getTime()
    expect(currentBody({ energy: 80, sleepy: 15, note: '', at: night - 4 * 3600_000 }, night).sleepy).toBe(75)
  })
  it('prompt only for switches that are on; fields persist', () => {
    expect(agencyPrompt({})).toBe('')
    expect(agencyPrompt({ pause: true })).toContain('[暂停:')
    const state = normalizePersonaState({ personas: [{ id: 'p1', characterId: 'c1', pauseEnabled: true, privateRoomEnabled: true, bodyStateEnabled: true, privateRoom: [{ id: 'r', title: 't', text: 'x', at: 1 }], bodyState: { energy: 50, sleepy: 10, note: '', at: 1 }, threads: [{ id: 't1', title: 'a', createdAt: 1, updatedAt: 1, messages: [], pause: { until: 9, reason: 'r', at: 1 } }] }] })
    const p = state.personas[0]
    expect(p.pauseEnabled && p.privateRoomEnabled && p.bodyStateEnabled).toBe(true)
    expect(p.privateRoom).toHaveLength(1)
    expect(p.threads[0].pause?.until).toBe(9)
  })
})
