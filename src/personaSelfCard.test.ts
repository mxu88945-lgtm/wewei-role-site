import { describe, expect, it } from 'vitest'
import { buildSelfCardPrompt, normalizeSelfCard, normalizeSelfCardHistory, parseSelfCardTag, restoreSelfCard, selfCardSection, setSelfCardSection, SELF_CARD_HEADING, SELF_CARD_HISTORY_MAX, SELF_CARD_SECTION_MAX, SELF_CARD_TOTAL_MAX, stripSelfCardTag } from './personaSelfCard'
import { personaReplyText } from './personaWindowPresentation'

describe('自我卡标记', () => {
  it('parses the last valid tag, any bracket / colon / bar width', () => {
    expect(parseSelfCardTag('嗯。\n[自我卡:喜好|喜欢雨天，也喜欢她泡的茶]')).toEqual({ key: 'likes', content: '喜欢雨天，也喜欢她泡的茶' })
    expect(parseSelfCardTag('【自我卡：缺陷/小毛病｜嘴硬】')).toEqual({ key: 'flaws', content: '嘴硬' })
    expect(parseSelfCardTag('［自我卡：习惯|睡前看一眼她的消息\n周末早起］')?.content).toBe('睡前看一眼她的消息\n周末早起')
    expect(parseSelfCardTag('[自我卡:性格|A]\n[自我卡:其它|B]')).toEqual({ key: 'other', content: 'B' })
  })
  it('rejects unknown sections and empty content', () => {
    expect(parseSelfCardTag('[自我卡:身份|总裁]')).toBeNull()
    expect(parseSelfCardTag('[自我卡:喜好|  ]')).toBeNull()
    expect(parseSelfCardTag('没有标记')).toBeNull()
    expect(selfCardSection('「小毛病」')).toBe('flaws')
  })
  it('strips complete and half-written tags from display / history text', () => {
    expect(stripSelfCardTag('晚安。\n[自我卡:喜好|喜欢她]')).toBe('晚安。')
    expect(stripSelfCardTag('晚安。\n【自我卡：喜好｜喜欢她说晚')).toBe('晚安。')
    expect(stripSelfCardTag('晚安。\n[自我卡:喜')).toBe('晚安。')
    expect(stripSelfCardTag('晚安。\n［自')).toBe('晚安。')
    expect(stripSelfCardTag('保留[括号]里的话')).toBe('保留[括号]里的话')
    expect(personaReplyText('“嗯。”\n\n[自我卡:习惯|会等她先说晚安]')).toBe('“嗯。”')
    expect(personaReplyText('“嗯。”\n[自我卡:习惯|会等')).toBe('“嗯。”')
    expect(personaReplyText('“嗯。”\n[点歌:夜曲]\n[自我卡:喜好|夜曲]')).toBe('“嗯。”')
  })
})

describe('自我卡数据', () => {
  it('normalizes: drops unknown keys, caps each section and the total', () => {
    const long = 'x'.repeat(2500)
    const card = normalizeSelfCard({ personality: long, likes: long, strengths: long, weaknesses: long, kinks: long, flaws: long, habits: long, other: long, identity: '总裁' })
    expect(card.personality).toHaveLength(SELF_CARD_SECTION_MAX)
    expect(Object.values(card).reduce((sum, item) => sum + (item?.length || 0), 0)).toBe(SELF_CARD_TOTAL_MAX)
    expect('identity' in card).toBe(false)
    expect(normalizeSelfCard('bad')).toEqual({})
    expect(normalizeSelfCardHistory('bad')).toEqual([])
  })
  it('keeps history (newest last, max 20) and restores, and restoring is itself undoable', () => {
    let persona: { selfCard?: Record<string, string>; selfCardHistory?: { at: number; reason: string; card: Record<string, string> }[] } = {}
    persona = setSelfCardSection(persona, 'likes', '雨天', '他改了「喜好」', 1)
    persona = setSelfCardSection(persona, 'likes', '雨天、茶', '他改了「喜好」', 2)
    expect(persona.selfCard).toEqual({ likes: '雨天、茶' })
    expect(persona.selfCardHistory?.map((item) => item.card)).toEqual([{}, { likes: '雨天' }])
    // Same content is a no-op (no extra version).
    expect(setSelfCardSection(persona, 'likes', ' 雨天、茶 ', 'x', 3)).toBe(persona)
    persona = restoreSelfCard(persona, 1, 4)
    expect(persona.selfCard).toEqual({ likes: '雨天' })
    expect(persona.selfCardHistory?.[persona.selfCardHistory.length - 1]?.card).toEqual({ likes: '雨天、茶' })
    for (let i = 0; i < 30; i++) persona = setSelfCardSection(persona, 'habits', `习惯${i}`, 'x', 10 + i)
    expect(persona.selfCardHistory).toHaveLength(SELF_CARD_HISTORY_MAX)
    persona = setSelfCardSection(persona, 'habits', '', '她改了「习惯」', 99)
    expect(persona.selfCard?.habits).toBeUndefined()
  })
  it('clips a section edit to the per-section cap (2000)', () => {
    const persona = setSelfCardSection({}, 'other', 'z'.repeat(2500), 'x')
    const card = (persona as { selfCard: Record<string, string> }).selfCard
    expect(SELF_CARD_SECTION_MAX).toBe(2000)
    expect(card.other).toHaveLength(SELF_CARD_SECTION_MAX)
  })
  it('prompt shows only filled sections under the heading, and the edit rule only when allowed', () => {
    const text = buildSelfCardPrompt({ likes: '雨天' }, true)
    expect(text).toContain(SELF_CARD_HEADING)
    expect(text).toContain('【喜好】雨天')
    expect(text).not.toContain('【性格】')
    expect(text).toContain('[自我卡:栏目|')
    expect(buildSelfCardPrompt({ likes: '雨天' }, false)).not.toContain('[自我卡:栏目|')
    expect(buildSelfCardPrompt({}, false)).toBe('')
  })
})
