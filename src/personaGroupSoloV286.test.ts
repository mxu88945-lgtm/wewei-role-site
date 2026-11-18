import { describe, expect, it } from 'vitest'
import { buildGroupSoloTail, groupTurnOrder, isGroupSkip, splitGroupReply, updateGuest, normalizeGuests } from './personaGroup'

const speakers = [{ id: 'persona-1', name: '谢聿衡', main: true }, { id: 'guest-a', name: '阿七', main: false }, { id: 'guest-b', name: '林栖', main: false }]

describe('v286 每人单独请求', () => {
  it('order: @ targets as-is; natural puts guests she named first, then host, then the rest', () => {
    expect(groupTurnOrder({ speakers, targets: ['guest-b', 'persona-1'] })).toEqual(['guest-b', 'persona-1'])
    expect(groupTurnOrder({ speakers, targets: null }, '林栖你怎么看')).toEqual(['guest-b', 'persona-1', 'guest-a'])
    expect(groupTurnOrder({ speakers, targets: null }, '大家好')).toEqual(['persona-1', 'guest-a', 'guest-b'])
  })
  it('skip tag and solo tail', () => {
    expect(isGroupSkip('[不接话]')).toBe(true)
    expect(isGroupSkip('【阿七】\n［不接话］')).toBe(true)
    expect(isGroupSkip('不接话也行')).toBe(false)
    const tail = buildGroupSoloTail({ speakers }, 'guest-a', [{ name: '谢聿衡', text: '嗯。' }], true)
    expect(tail).toContain('轮到 阿七')
    expect(tail).toContain('【谢聿衡】\n嗯。')
    expect(tail).toContain('[不接话]')
    expect(buildGroupSoloTail({ speakers }, 'persona-1', [], false)).not.toContain('[不接话]')
  })
  it('keeps only the speaker own segment', () => {
    const out = splitGroupReply('【阿七】\n来啦！\n【谢聿衡】\n闭嘴。', { speakers, targets: ['guest-a'], cap: 1 })
    expect(out).toEqual([{ speakerId: 'guest-a', raw: '来啦！' }])
  })
  it('guest api fields normalize and clear', () => {
    const [guest] = normalizeGuests([{ id: 'guest-a', name: '阿七', apiChannelId: 'ch-2', modelName: 'gpt-x', memories: [] }], () => null)
    expect(guest.apiChannelId).toBe('ch-2')
    expect(guest.modelName).toBe('gpt-x')
    const persona = { guests: [guest] } as never
    const cleared = updateGuest(persona, 'guest-a', { apiChannelId: '', modelName: '' }) as unknown as { guests: Record<string, unknown>[] }
    expect('apiChannelId' in cleared.guests[0]).toBe(false)
    expect('modelName' in cleared.guests[0]).toBe(false)
  })
})
