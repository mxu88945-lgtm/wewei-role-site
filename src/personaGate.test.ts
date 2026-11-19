import { describe, expect, it } from 'vitest'
import { buildGuardPrompt, extractGuardTags, finalGuardCommands, freshBreaches, parseGateKey, stripGuardTags, type GateReport } from './personaGate'
import { personaReplyText } from './personaWindowPresentation'

const now = Date.parse('2026-11-19T12:00:00Z')
const report = (patch: Partial<GateReport> = {}): GateReport => ({ lock: null, curfew: { on: true, start: '23:30', end: '07:00' }, curfewNow: false, curfewStart: null, limit: { on: true, max: 10 }, counts: {}, opens: [], breaches: [], ...patch })

describe('v298 他管着你：标记解析', () => {
  it('读出锁屏/解锁/宵禁并剥掉', () => {
    const { clean, commands } = extractGuardTags('去吃饭。\n【锁屏 30分钟：去吃饭】\n【宵禁 22:30】')
    expect(clean).toBe('去吃饭。')
    expect(commands).toEqual([{ kind: 'lock', minutes: 30, reason: '去吃饭' }, { kind: 'curfew', start: '22:30' }])
    expect(extractGuardTags('好了，放你。【解锁】').commands).toEqual([{ kind: 'unlock' }])
  })
  it('分钟夹在 5–180，半角括号、没理由、全角冒号都认', () => {
    expect(extractGuardTags('[锁屏 2分钟]').commands).toEqual([{ kind: 'lock', minutes: 5, reason: '' }])
    expect(extractGuardTags('【锁屏 999 分钟，睡觉】').commands).toEqual([{ kind: 'lock', minutes: 180, reason: '睡觉' }])
    expect(extractGuardTags('【宵禁 9：05】').commands).toEqual([{ kind: 'curfew', start: '09:05' }])
    expect(extractGuardTags('【宵禁 25:00】').commands).toEqual([])
  })
  it('普通括号文字不误伤', () => {
    expect(stripGuardTags('【解释】他说【锁屏】这个词')).toBe('【解释】他说【锁屏】这个词')
    expect(extractGuardTags('【锁屏】').commands).toEqual([])
  })
  it('流式半截先藏起来', () => {
    expect(stripGuardTags('乖。\n【锁屏 3')).toBe('乖。')
    expect(stripGuardTags('乖。\n【宵')).toBe('乖。')
    expect(stripGuardTags('乖。\n【')).toBe('乖。')
    expect(personaReplyText('乖。\n【锁屏 30分钟：去')).toBe('乖。')
  })
  it('显示/历史用的 personaReplyText 剥掉完整标记', () => {
    expect(personaReplyText('把手机放下。\n【锁屏 45分钟：去写作业】')).toBe('把手机放下。')
    expect(personaReplyText('睡吧【宵禁 22:00】')).toBe('睡吧')
  })
  it('同类只认最后一条', () => {
    expect(finalGuardCommands([{ kind: 'lock', minutes: 10, reason: '' }, { kind: 'unlock' }, { kind: 'curfew', start: '22:00' }])).toEqual([{ kind: 'unlock' }, { kind: 'curfew', start: '22:00' }])
  })
})

describe('v298 他管着你：钥匙', () => {
  it('从链接里取 k=，或接受光秃秃的钥匙', () => {
    expect(parseGateKey('https://burne-gate.lyy0305123.workers.dev/open?k=bw0123456789abcdef&app=抖音')).toBe('bw0123456789abcdef')
    expect(parseGateKey('  bw0123456789abcdef_-  ')).toBe('bw0123456789abcdef_-')
    expect(parseGateKey('short')).toBe('')
    expect(parseGateKey('https://x.dev/?k=abc')).toBe('')
  })
})

describe('v298 他管着你：本轮背景', () => {
  it('只说自己的锁和自己的告状，别人的一律不提', () => {
    const own = buildGuardPrompt({ name: '谢聿衡', user: '惟惟', report: report({ lock: { until: now + 20 * 60000, startedAt: now, reason: '吃饭', by: '谢聿衡' } }), toldUntil: 0, now })
    expect(own).toContain('你给她的锁屏还有 20 分钟')
    const other = buildGuardPrompt({ name: '谢聿衡', user: '惟惟', report: report({ lock: { until: now + 10 * 60000, startedAt: now, reason: '', by: '' }, curfewNow: true, curfewStart: '23:30', counts: { 抖音: 3 } }), toldUntil: 0, now })
    expect(other).not.toContain('伯恩')
    expect(other).not.toMatch(/共用|自己的锁|别人/)
    expect(other).toContain('宵禁时间')
    expect(other).toContain('抖音 3 次')
    const breaches = [
      { at: now - 5 * 60000, kind: 'lock' as const, app: '抖音', minutes: 12, reason: '睡觉', by: '谢聿衡' },
      { at: now - 6 * 60000, kind: 'lock' as const, app: '抖音', minutes: 8, reason: '', by: '' },
      { at: now - 4 * 3600e3, kind: 'curfew' as const, app: '抖音', minutes: 10, reason: '', by: '' },
    ]
    const told = buildGuardPrompt({ name: '谢聿衡', user: '惟惟', report: report({ breaches }), toldUntil: 0, now })
    expect(told).toContain('解开了你给她的锁屏')
    expect(told).not.toContain('伯恩')
    expect(told.match(/【告状】/g)).toHaveLength(1)
    expect(freshBreaches(report({ breaches }), now - 5.5 * 60000, now)).toHaveLength(1)
  })
})
