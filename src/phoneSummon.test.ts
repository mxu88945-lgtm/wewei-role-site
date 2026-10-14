import { describe, expect, it } from 'vitest'
import { findAtMentionIds, parsePhoneQuit, queueSummons } from './phoneGroup'

const people = [{ id: 'y', name: '虞山行' }, { id: 'f', name: '傅承砚' }, { id: 's', name: '沈衍' }]
describe('phone summons', () => {
  it('finds @ mentions in order, skipping self', () => {
    expect(findAtMentionIds('@承砚 你说呢？@沈衍', people, 'y')).toEqual(['f', 's'])
    expect(findAtMentionIds('傅承砚你闭嘴', people, 'y')).toEqual([])
    expect(findAtMentionIds('@虞山行', people, 'y')).toEqual([])
  })
  it('puts summoned speakers right after the caller', () => {
    expect(queueSummons(['y', 's'], 0, ['f'], 3)).toEqual({ queue: ['y', 'f', 's'], used: 1 })
    expect(queueSummons(['y', 's', 'f'], 0, ['f'], 3).queue).toEqual(['y', 'f', 's'])
    expect(queueSummons(['y'], 0, ['f', 's'], 1)).toEqual({ queue: ['y', 'f'], used: 1 })
  })
  it('turns the quit tag into a notice', () => {
    expect(parsePhoneQuit('够了。\n【退群：跟你们没法聊】', '傅承砚')).toEqual({ text: '够了。\n🚪 傅承砚退出了群聊：跟你们没法聊', reason: '跟你们没法聊' })
    expect(parsePhoneQuit('没事', '傅承砚')).toBeNull()
  })
})
