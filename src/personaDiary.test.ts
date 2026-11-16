import { describe, expect, it } from 'vitest'
import { addDiaryEntries, diaryTurnLine, localDay, normalizeDiary, parseDiaryTags, stripDiaryTags } from './personaDiary'
import { personaReplyText } from './personaWindowPresentation'

describe('persona diary', () => {
  it('parses entries and the lock flag', () => {
    const text = '好，睡吧。\n[日记:雨夜|她今天说累，我没多问。]\n[日记:不给看|其实想她了|锁]'
    expect(parseDiaryTags(text)).toEqual([
      { title: '雨夜', text: '她今天说累，我没多问。', locked: false },
      { title: '不给看', text: '其实想她了', locked: true },
    ])
  })
  it('keeps a | inside the body when it is not the lock flag', () => {
    expect(parseDiaryTags('[日记:清单|一|二]')[0]).toEqual({ title: '清单', text: '一|二', locked: false })
  })
  it('hides tags from the visible reply, including a half-streamed one', () => {
    expect(stripDiaryTags('晚安[日记:雨夜|写到一半')).toBe('晚安')
    expect(personaReplyText('晚安。\n[日记:雨夜|她今天说累。]').trim()).toBe('晚安。')
  })
  it('rewrites the same title on the same day', () => {
    const now = new Date(2026, 10, 17, 22).getTime()
    const first = addDiaryEntries([], [{ title: '雨夜', text: 'a', locked: false }], now)
    const second = addDiaryEntries(first, [{ title: '雨夜', text: 'b', locked: true }], now + 1000)
    expect(second).toHaveLength(1)
    expect(second[0]).toMatchObject({ text: 'b', locked: true, day: localDay(now), id: first[0].id })
    expect(normalizeDiary(second)).toEqual(second)
  })
  it('nudges only at night when nothing was written today', () => {
    const night = new Date(2026, 10, 17, 22).getTime(), noon = new Date(2026, 10, 17, 12).getTime()
    expect(diaryTurnLine([], '', night)).toContain('还没写日记')
    expect(diaryTurnLine([], '', noon)).toBe('')
    expect(diaryTurnLine([], '', night, 1)).toBe('')
    const written = addDiaryEntries([], [{ title: 't', text: 'x', locked: false }], night)
    expect(diaryTurnLine(written, '', night)).toBe('')
    expect(diaryTurnLine(written, '你的日记写了啥', noon)).toContain('《t》')
  })
})
