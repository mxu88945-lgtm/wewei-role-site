import { describe, expect, it } from 'vitest'
import { buildDmGroupPeek, phoneDeliveryInstruction, phoneDmRules } from './phoneGroup'

describe('phone DM delivery isolation', () => {
  it('never gives an empty-send DM the group continuation instruction', () => {
    const dm = phoneDeliveryInstruction('虞山行', '惟惟', true, true)
    expect(dm).toContain('唯一收件人：惟惟')
    expect(dm).toContain('她没有发来新消息')
    expect(dm).not.toContain('在群里接着聊')
    expect(phoneDeliveryInstruction('虞山行', '惟惟', false, true)).toContain('在群里接着聊')
  })
  it('keeps scheduled and custom nudges inside the DM delivery boundary', () => {
    for (const nudge of ['白天主动问候', '半夜问睡了吗', '回应她的许愿']) {
      const instruction = phoneDeliveryInstruction('段冥洲', '惟惟', true, true, nudge)
      expect(instruction).toContain(nudge)
      expect(instruction).toContain('群友不在此窗口')
      expect(instruction).toContain('不能把那里的最后一句当作本轮待回复消息')
      expect(instruction).toContain('不要输出群聊草稿')
    }
    expect(phoneDeliveryInstruction('段冥洲', '惟惟', true)).toContain('最新私聊消息')
    expect(phoneDmRules('段冥洲', '惟惟')).toContain('提到群友时用第三人称')
  })
  it('retains shared memories while explicitly framing group lines as other-window history', () => {
    const peek = buildDmGroupPeek([
      { title: '大群', participantIds: ['a', 'b'], phone: {}, messages: [{ role: 'assistant', characterId: 'b', text: '都少算计两句，让她早点睡' }, { role: 'user', text: '我刚吃了粥' }] },
      { title: '另一个群', participantIds: ['b'], phone: {}, messages: [{ role: 'user', text: '不可见内容' }] },
    ], 'a', (message) => message.role === 'user' ? '惟惟' : '群友乙')
    expect(peek).toContain('群友乙：都少算计两句')
    expect(peek).toContain('我刚吃了粥')
    expect(peek).toContain('不是当前对话')
    expect(peek).toContain('回到你和她的私聊窗口')
    expect(peek).not.toContain('不可见内容')
  })
})
