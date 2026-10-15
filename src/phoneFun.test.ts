import { describe, expect, it } from 'vitest'
import { PAT_LINE, findRedPacket, parseRedPacketLine, redPacketText, activeRedPackets, applyPatTags, applyRedPacketTags, buildRedPacketNote, createRedPacket, lateNightKey, splitRedPacket, userPatText } from './phoneFun'
import { EMPTY_POINTS, addPoints } from './phonePoints'

const members = [{ id: 'a', name: '沈衍' }, { id: 'b', name: '谢聿衡' }]

describe('pat', () => {
  it('turns tags into visible lines and summons members with @', () => {
    expect(applyPatTags('烦\n【拍一拍：谢聿衡】', members[0], members, '惟惟')).toBe('烦\n👋 沈衍 拍了拍 @谢聿衡')
    expect(applyPatTags('【拍一拍：惟惟】', members[0], members, '惟惟')).toBe('👋 沈衍 拍了拍 惟惟')
    expect(applyPatTags('【拍一拍：路人】', members[0], members, '惟惟')).toBe('')
    expect(PAT_LINE.test(userPatText('惟惟', '沈衍'))).toBe(true)
  })
})

describe('red packets', () => {
  it('splits so every share is at least 1 and sums to the total', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      let x = seed / 20
      const shares = splitRedPacket(50, 6, () => { x = (x * 9301 + 0.49297) % 1; return x })
      expect(shares).toHaveLength(6)
      expect(shares.reduce((a, b) => a + b, 0)).toBe(50)
      expect(Math.min(...shares)).toBeGreaterThanOrEqual(1)
    }
  })
  it('lets characters send with their own points and grab once', () => {
    const points = addPoints(EMPTY_POINTS, 'a', 40, 'seed', 1)
    const sent = applyRedPacketTags('拿去\n【发红包 30积分 2个：别吵了】', { conversationId: 'g', speakerId: 'a', speakerName: '沈衍', points, packets: [], now: 10, random: () => 0.5 })
    expect(sent.text).toBe('拿去\n🧧 沈衍 发了一个积分红包：30 积分 · 2 个｜别吵了')
    expect(sent.points.balances.a).toBe(10)
    const self = applyRedPacketTags('【抢红包】', { conversationId: 'g', speakerId: 'a', speakerName: '沈衍', points: sent.points, packets: sent.packets, now: 11 })
    expect(self.text).toBe('🧧 手慢了，红包已经被抢完')
    const grab = applyRedPacketTags('谢了\n【抢红包】', { conversationId: 'g', speakerId: 'b', speakerName: '谢聿衡', points: sent.points, packets: sent.packets, now: 12 })
    expect(grab.text).toMatch(/^谢了\n🧧 抢到沈衍的红包 \+\d+ 积分$/)
    expect(activeRedPackets(grab.packets, 'g', 13)[0].grabs).toHaveLength(1)
    const again = applyRedPacketTags('【抢红包】', { conversationId: 'g', speakerId: 'b', speakerName: '谢聿衡', points: grab.points, packets: grab.packets, now: 14 })
    expect(again.text).toBe('🧧 手慢了，红包已经被抢完')
  })
  it('auto-grabs every open packet on speaking, accepts a bare 抢红包 line, and respects 【不抢】', () => {
    const p1 = createRedPacket({ conversationId: 'g', fromId: 'user', fromName: '惟惟', total: 20, count: 3, at: 1 })
    const p2 = createRedPacket({ conversationId: 'g', fromId: 'user', fromName: '惟惟', total: 20, count: 3, at: 2 })
    const auto = applyRedPacketTags('抢红包\n周导破费了', { conversationId: 'g', speakerId: 'a', speakerName: '沈衍', points: EMPTY_POINTS, packets: [p1, p2], now: 3, autoGrab: true })
    expect(auto.text).toMatch(/^周导破费了\n🧧 抢到惟惟的 2 个红包，共 \+\d+ 积分（第1个 \+\d+，第2个 \+\d+）$/)
    const refuse = applyRedPacketTags('不稀罕\n【不抢】', { conversationId: 'g', speakerId: 'b', speakerName: '谢聿衡', points: EMPTY_POINTS, packets: [p1, p2], now: 3, autoGrab: true })
    expect(refuse.text).toBe('不稀罕')
    expect(refuse.changed).toBe(false)
  })
  it('dm note only appears while her packet is waiting', () => {
    const p1 = createRedPacket({ conversationId: 'd', fromId: 'user', fromName: '惟惟', total: 66, count: 1, note: '买咖啡', at: 1 })
    expect(buildRedPacketNote([p1], 'd', 'a', 2, true)).toContain('「买咖啡」，共 66 积分')
    const got = applyRedPacketTags('收了', { conversationId: 'd', speakerId: 'a', speakerName: '沈衍', points: EMPTY_POINTS, packets: [p1], now: 2, autoGrab: true })
    expect(got.points.balances.a).toBe(66)
    expect(buildRedPacketNote(got.packets, 'd', 'a', 3, true)).toBe('')
  })
  it('refuses when points are short and names the luckiest when emptied', () => {
    const poor = applyRedPacketTags('【发红包 30积分 2个】', { conversationId: 'g', speakerId: 'a', speakerName: '沈衍', points: EMPTY_POINTS, packets: [], now: 1 })
    expect(poor.text).toContain('积分不够')
    const packet = createRedPacket({ conversationId: 'g', fromId: 'user', fromName: '惟惟', total: 10, count: 2, at: 1, random: () => 0.1 })
    const first = applyRedPacketTags('【抢红包】', { conversationId: 'g', speakerId: 'a', speakerName: '沈衍', points: EMPTY_POINTS, packets: [packet], now: 2 })
    const second = applyRedPacketTags('【抢红包】', { conversationId: 'g', speakerId: 'b', speakerName: '谢聿衡', points: first.points, packets: first.packets, now: 3 })
    expect(second.text).toContain('🏆 惟惟的红包抢完了，手气最佳')
    expect(buildRedPacketNote(second.packets, 'g', 'a', 4)).not.toContain('没抢完的红包：')
    expect(buildRedPacketNote([packet], 'g', 'a', 4)).toContain('你还没抢')
  })
})

describe('late night', () => {
  it('only 23:00–00:59, with midnight counted as the evening before', () => {
    expect(lateNightKey(new Date(2026, 9, 15, 23, 30).getTime())).toBe('2026-10-15')
    expect(lateNightKey(new Date(2026, 9, 16, 0, 20).getTime())).toBe('2026-10-15')
    expect(lateNightKey(new Date(2026, 9, 16, 1, 0).getTime())).toBe('')
  })
})

describe('red packet card', () => {
  it('parses the packet line and finds the packet nearest in time', () => {
    const a = createRedPacket({ conversationId: 'g', fromId: 'user', fromName: '惟惟', total: 50, count: 3, note: '恭喜发财', at: 100 })
    const b = createRedPacket({ conversationId: 'g', fromId: 'user', fromName: '惟惟', total: 50, count: 3, note: '恭喜发财', at: 9000 })
    const info = parseRedPacketLine(`好\n${redPacketText(b)}`)!
    expect(info).toMatchObject({ fromName: '惟惟', total: 50, count: 3, note: '恭喜发财' })
    expect(findRedPacket([a, b], 'g', info, 8990)?.id).toBe(b.id)
    expect(parseRedPacketLine('没有红包')).toBeNull()
  })
})

import { canDayDm as canDay, nextDayDmState as nextDay, dayDmKey as dayKeyDm } from './phoneFun'
describe('daytime dm', () => {
  it('only 9-22, max 3 a day, 3h apart', () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 15, h, m).getTime()
    expect(dayKeyDm(at(8))).toBe('')
    expect(canDay(null, at(10))).toBe(true)
    let s = nextDay(null, at(10))
    expect(canDay(s, at(12))).toBe(false)
    expect(canDay(s, at(13))).toBe(true)
    s = nextDay(nextDay(s, at(13)), at(16))
    expect(s.count).toBe(3)
    expect(canDay(s, at(20))).toBe(false)
    expect(canDay(s, new Date(2026, 9, 16, 9).getTime())).toBe(true)
  })
})

describe('targeted transfer line', () => {
  it('round-trips through text', async () => {
    const { transferText, parseTransferLine } = await import('./phoneFun')
    const info = parseTransferLine(`${transferText('惟惟', '顾荒', 66, '买烟钱')}`)
    expect(info).toMatchObject({ fromName: '惟惟', toName: '顾荒', amount: 66, note: '买烟钱' })
    expect(parseTransferLine(transferText('惟惟', '顾荒', 5))?.note).toBe('')
    expect(parseTransferLine('💸 周惟惟 转账给： 200 积分｜还是我 daddy 贴心。')).toMatchObject({ toName: '', amount: 200, note: '还是我 daddy 贴心。' })
  })
})
