import { describe, expect, it } from 'vitest'
import { EMPTY_POINTS, applyMessagePoints, buildPointsNote, dayKey } from './phonePoints'

describe('phone points', () => {
  const at = new Date(2026, 9, 14, 14).getTime()
  it('checks in once a day', () => {
    const first = applyMessagePoints(EMPTY_POINTS, 'a', '早', at)
    expect(first.state.balances.a).toBe(10)
    expect(first.text).toContain('今日签到 +10')
    const second = applyMessagePoints(first.state, 'a', '又来', at + 1000)
    expect(second.state.balances.a).toBe(10)
    expect(second.text).toBe('又来')
  })
  it('caps self claims and allows penalties', () => {
    const state = { ...EMPTY_POINTS, lastCheckin: { a: dayKey(at) } }
    const up = applyMessagePoints(state, 'a', '我错了\n【积分 +30：主动认错】', at)
    expect(up.state.balances.a).toBe(5)
    expect(up.text).toContain('⚖️ 积分 +5｜主动认错')
    const down = applyMessagePoints(up.state, 'a', '【积分 -20：私聊争宠被转发】', at)
    expect(down.state.balances.a).toBe(-15)
  })
  it('redeems only with enough points', () => {
    const rich = { balances: { a: 45 }, lastCheckin: { a: dayKey(at) }, log: [] }
    const ok = applyMessagePoints(rich, 'a', '【兑换：论坛置顶】', at)
    expect(ok.state.balances.a).toBe(5)
    expect(ok.redeemed).toEqual(['论坛置顶'])
    const fail = applyMessagePoints(ok.state, 'a', '【兑换：剧情减刑申请】', at)
    expect(fail.text).toContain('积分不够')
    expect(fail.state.balances.a).toBe(5)
  })
  it('lists the ranking for the model', () => {
    expect(buildPointsNote({ ...EMPTY_POINTS, balances: { a: 3, b: 9 } }, [{ id: 'a', name: '沈衍' }, { id: 'b', name: '傅承砚' }], '周')).toContain('傅承砚 9，沈衍 3')
  })
})
