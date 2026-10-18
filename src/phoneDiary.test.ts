import { describe, expect, it } from 'vitest'
import { EMPTY_POINTS, addPoints } from './phonePoints'
import { applyPhoneDiaryTags, buildPhoneDiaryNote, currentMood, parseDailyMoods, setOnlineMood, unlockedDiaryImageContext, type PhoneDiaryState } from './phoneDiary'

const state = (): PhoneDiaryState => ({ entries: [{ id: 'd1', title: '今天', body: '秦放把我笑死了。', createdAt: 1, updatedAt: 1, unlockedBy: [] }], moods: {} })

describe('phone diary and moods', () => {
  it('never exposes a locked diary body to the speaker', () => {
    const note = buildPhoneDiaryNote(state(), addPoints(EMPTY_POINTS, 'qin', 10, 'seed', 1), { id: 'qin', name: '秦放' }, [{ id: 'qin', name: '秦放' }], '惟惟', 2)
    expect(note).toContain('《今天》')
    expect(note).not.toContain('秦放把我笑死了')
  })

  it('charges one character five points and unlocks only for him', () => {
    const result = applyPhoneDiaryTags(state(), addPoints(EMPTY_POINTS, 'qin', 10, 'seed', 1), 'qin', '我要看。\n【解锁日记：d1】', 2)
    expect(result.points.balances.qin).toBe(5)
    expect(result.state.entries[0].unlockedBy).toEqual(['qin'])
    expect(result.text).toContain('花 5 积分解锁')
    const note = buildPhoneDiaryNote(result.state, result.points, { id: 'qin', name: '秦放' }, [], '惟惟', 2)
    expect(note).toContain('秦放把我笑死了')
  })

  it('keeps moods scoped to the current local day', () => {
    const updated = setOnlineMood(state(), 'qin', '😏 看热闹不嫌事大', new Date(2026, 9, 18, 12).getTime())
    expect(currentMood(updated, 'qin', new Date(2026, 9, 18, 23).getTime())?.text).toContain('看热闹')
    expect(currentMood(updated, 'qin', new Date(2026, 9, 19, 1).getTime())).toBeUndefined()
  })

  it('parses generated daily moods', () => {
    expect(parseDailyMoods('```json\n{"moods":[{"id":"qin","text":"😏 围观"}]}\n```')).toEqual([{ id: 'qin', text: '😏 围观' }])
  })

  it('only exposes uploaded pixels after this character unlocked the diary', () => {
    const pictured = state()
    pictured.entries[0].images = [{ id: 'p', dataUrl: 'data:image/jpeg;base64,AA', width: 10, height: 10 }]
    expect(unlockedDiaryImageContext(pictured, 'qin')).toBeUndefined()
    pictured.entries[0].unlockedBy = ['qin']
    expect(unlockedDiaryImageContext(pictured, 'qin')?.images[0].id).toBe('p')
    expect(unlockedDiaryImageContext(pictured, 'xia')).toBeUndefined()
  })
})
