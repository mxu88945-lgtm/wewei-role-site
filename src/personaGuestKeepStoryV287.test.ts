import { describe, expect, it } from 'vitest'
import { buildGroupSystemBlock, normalizeGuests, resolveGuest, updateGuest, type PersonaGuest } from './personaGroup'

const card = { id: 'c1', name: '小Eli', description: '三岁的小男孩', personality: '黏人', scenario: '在孤儿院长大' }
const base: PersonaGuest = { id: 'guest-a', source: 'card', characterId: 'c1', name: '小Eli', memories: [], createdAt: 1, updatedAt: 1 } as PersonaGuest

describe('v287 角色卡客人带上原卡剧情开关', () => {
  it('默认借人不借戏，不带开局场景', () => {
    const g = resolveGuest(base, [card])
    expect(g.keepStory).toBeUndefined()
    expect(g.world).toBe('')
    const block = buildGroupSystemBlock({ mode: 'mention', guests: [g] }, { char: '谢聿衡', user: '惟惟' })
    expect(block).toContain('借人不借戏')
  })
  it('勾上后带原卡场景，规则改为原卡作数', () => {
    const g = resolveGuest({ ...base, keepStory: true }, [card])
    expect(g.keepStory).toBe(true)
    expect(g.world).toContain('孤儿院')
    const block = buildGroupSystemBlock({ mode: 'mention', guests: [g] }, { char: '谢聿衡', user: '惟惟' })
    expect(block).not.toContain('借人不借戏')
    expect(block).toContain('小Eli带着原卡的身份')
  })
  it('混合时各按各的', () => {
    const a = resolveGuest({ ...base, keepStory: true }, [card])
    const b = resolveGuest({ ...base, id: 'guest-b', name: '阿七', characterId: 'c2' }, [{ ...card, id: 'c2', name: '阿七' }])
    const block = buildGroupSystemBlock({ mode: 'mention', guests: [a, b] }, { char: '谢聿衡', user: '惟惟' })
    expect(block).toContain('客人（阿七）是“借人不借戏”')
  })
  it('存取与关闭', () => {
    expect(normalizeGuests([{ ...base, keepStory: true }], () => null)[0].keepStory).toBe(true)
    const persona = { guests: [{ ...base, keepStory: true }] } as never
    expect((updateGuest(persona, 'guest-a', { keepStory: false }) as { guests: PersonaGuest[] }).guests[0].keepStory).toBeUndefined()
  })
})

import { groupMentionNames, isMentionOnlyText, stripGroupMentions } from './personaGroup'
describe('v288 气泡隐藏 @名字', () => {
  const names = groupMentionNames('谢聿衡', [{ name: '小Eli' }])!
  it('去掉 @名字，纯 @ 整条隐藏', () => {
    expect(stripGroupMentions('@谢聿衡 你看他', names)).toBe('你看他')
    expect(isMentionOnlyText('@谢聿衡', names)).toBe(true)
    expect(isMentionOnlyText('@谢聿衡 嗯', names)).toBe(false)
    expect(stripGroupMentions('邮箱 a@b.com', names)).toBe('邮箱 a@b.com')
    expect(groupMentionNames('谢聿衡', [])).toBeNull()
  })
})
