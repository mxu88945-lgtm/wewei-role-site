import { describe, expect, it } from 'vitest'
import { EMPTY_POINTS, addPoints, applyMessagePoints } from './phonePoints'
import { EMPTY_SHOP, applyPardons, applyShopTags, decideOrder, giftItem, normalizeShop, spendLockTicket, takePriority } from './phoneShop'

const mates = [{ id: 'a', name: '虞山行' }, { id: 'b', name: '傅承砚' }]
const run = (points = EMPTY_POINTS, shop = EMPTY_SHOP, text = '', at = 1000, buyerId = 'a') => applyShopTags({ points, shop, buyerId, buyerName: mates.find((m) => m.id === buyerId)!.name, mates, text, at })

describe('phone shop v98', () => {
  it('wish goes to wall, refund returns points, reject keeps them', () => {
    const r = run(addPoints(EMPTY_POINTS, 'a', 100, 'x', 1), EMPTY_SHOP, '嗯。\n【购买：许愿瓶：想要一只小猫】')
    expect(r.points.balances.a).toBe(70)
    expect(r.shop.orders[0].status).toBe('pending')
    const back = decideOrder(r.points, r.shop, r.shop.orders[0].id, 'refunded', 2)
    expect(back.points.balances.a).toBe(100)
    const no = decideOrder(r.points, r.shop, r.shop.orders[0].id, 'rejected', 2)
    expect(no.points.balances.a).toBe(70)
  })
  it('cooldown and daily stock', () => {
    const rich = addPoints(addPoints(EMPTY_POINTS, 'a', 500, 'x', 1), 'b', 500, 'x', 1)
    const first = run(rich, EMPTY_SHOP, '【购买：锁屏券】')
    expect(first.shop.inventory.a.lock).toBe(1)
    const second = run(first.points, first.shop, '【购买：锁屏券】', 2000, 'b')
    expect(second.text).toContain('卖完')
    const wish2 = run(first.points, run(first.points, first.shop, '【许愿：a】').shop, '【许愿：b】', 3000)
    expect(wish2.text).toContain('冷却')
  })
  it('lock needs a ticket; priority jumps the queue; whisper not stocked', () => {
    const rich = addPoints(EMPTY_POINTS, 'a', 500, 'x', 1)
    expect(spendLockTicket(EMPTY_SHOP, 'a', 1, 30).ok).toBe(false)
    const bought = run(rich, EMPTY_SHOP, '【购买：锁屏券】\n【购买：优先翻牌券】\n【购买：悄悄话券】')
    const lock = spendLockTicket(bought.shop, 'a', 5000, 30)
    expect(lock.ok).toBe(true)
    expect(spendLockTicket({ ...lock.shop, inventory: { a: { lock: 1 } } }, 'a', 6000, 30).ok).toBe(false)
    expect(takePriority(bought.shop, ['b', 'a'], ['b'])?.speakerIds).toEqual(['a', 'b'])
    expect(bought.shop.inventory.a.whisper || 0).toBe(0)
    expect(bought.bought.map((item) => item.id)).toEqual(['lock', 'priority', 'whisper'])
  })
  it('transfer points and pardon', () => {
    const rich = addPoints(EMPTY_POINTS, 'a', 100, 'x', 1)
    const t = run(rich, EMPTY_SHOP, '【转积分 30 给 傅承砚：拿去】')
    expect(t.points.balances.b).toBe(30)
    expect(t.points.balances.a).toBe(70)
    const p = run(t.points, EMPTY_SHOP, '【购买：免罚券】')
    const deducted = applyMessagePoints(p.points, 'a', '【积分 -10：被抓包】', 1000)
    const pardoned = applyPardons(p.points, deducted.state, p.shop, 'a', deducted.text, 1000)
    expect(pardoned.points.balances.a).toBe(p.points.balances.a + 10)
    expect(pardoned.shop.inventory.a.pardon).toBe(0)
  })
  it('autonomy needs her grant with a condition, then used once', () => {
    const rich = addPoints(EMPTY_POINTS, 'a', 300, 'x', 1)
    const r = run(rich, EMPTY_SHOP, '【购买：自主权券：想在她生气时不听命令】')
    expect(run(r.points, r.shop, '【使用：自主权】').text).toContain('没有已批准')
    const ok = decideOrder(r.points, r.shop, r.shop.orders[0].id, 'granted', 2, '只在她情绪崩溃时可以强行带她走')
    const used = run(ok.points, ok.shop, '【使用：自主权：带她走】', 3)
    expect(used.shop.orders[0].status).toBe('used')
  })
  it('gifts and v97 migration', () => {
    const g = giftItem(EMPTY_SHOP, 'b', EMPTY_SHOP.items.find((item) => item.id === 'pardon')!, 1)
    expect(g.inventory.b.pardon).toBe(1)
    const old = normalizeShop([{ id: 'x', buyerId: 'a', item: '许愿瓶', cost: 60, wish: '猫', at: 1, status: 'pending' }])
    expect(old.orders[0].note).toBe('猫')
    expect(old.items.length).toBeGreaterThan(6)
  })
})
