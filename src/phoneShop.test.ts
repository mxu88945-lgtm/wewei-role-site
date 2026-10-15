import { describe, expect, it } from 'vitest'
import { EMPTY_POINTS, addPoints } from './phonePoints'
import { applyShopTags, settleShopOrder } from './phoneShop'

describe('phone shop', () => {
  it('buys items and wishes, refunds on reject', () => {
    const points = addPoints(EMPTY_POINTS, 'a', 100, 'x', 1)
    const first = applyShopTags(points, [], 'a', '好吧。\n【购买：许愿瓶：想要一只小猫】\n【买：加餐券】', 2)
    expect(first.points.balances.a).toBe(15)
    expect(first.orders.map((item) => item.item)).toEqual(['许愿瓶', '加餐券'])
    expect(first.text).toContain('🫙 投了一个许愿瓶 -60｜想要一只小猫')
    const fail = applyShopTags(first.points, first.orders, 'a', '【购买：单独约会】', 3)
    expect(fail.changed).toBe(false)
    expect(fail.text).toContain('积分不够')
    const wish = first.orders[0]
    const rejected = settleShopOrder(first.points, first.orders, wish.id, false, 4)
    expect(rejected.points.balances.a).toBe(75)
    expect(rejected.orders[0].status).toBe('rejected')
  })
  it('old 兑换 tag still works through the shop', () => {
    const points = addPoints(EMPTY_POINTS, 'a', 40, 'x', 1)
    const result = applyShopTags(points, [], 'a', '【许愿：明天下雨】', 2)
    expect(result.changed).toBe(false)
  })
})
