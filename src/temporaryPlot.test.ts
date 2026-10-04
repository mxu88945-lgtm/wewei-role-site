import { describe, expect, it } from 'vitest'
import { captureTemporaryPlot, consumeTemporaryPlot, withAssistantRetryInstruction, withFinalTemporaryPlotInstruction } from './temporaryPlot'
import { createFreshConversationFrom, restartConversationInPlace, type Conversation } from './conversationLifecycle'

const conversation: Conversation = { id: 'chat', characterId: 'a', title: '对话', createdAt: 1, updatedAt: 1, messages: [{ id: 1, role: 'assistant', text: '开场' }], temporaryPlot: { id: 'draft-1', text: '他接到电话' } }

describe('one-shot backstage plot', () => {
  it('captures single-chat directions and only explicitly mentioned group speakers', () => {
    expect(captureTemporaryPlot(conversation, false)?.text).toBe('他接到电话')
    const group = { ...conversation, kind: 'group' as const }
    expect(captureTemporaryPlot(group, false)).toBeUndefined()
    expect(captureTemporaryPlot(group, true)?.text).toBe('他接到电话')
    expect(captureTemporaryPlot({ ...conversation, temporaryPlot: { id: 'empty', text: '  ' } }, true)).toBeUndefined()
  })
  it('places a private mandatory direction at the absolute request boundary', () => {
    const base = [
      { role: 'system' as const, content: '角色卡' },
      { role: 'user' as const, content: '继续。' },
      { role: 'system' as const, content: '导演与格式最终校验' },
    ]
    const directed = withFinalTemporaryPlotInstruction(base, '让他接到紧急电话', '沈衍', '惟惟')
    const finalInstruction = directed[directed.length - 1]
    expect(directed).not.toBe(base)
    expect(base).toHaveLength(3)
    expect(finalInstruction?.role).toBe('system')
    expect(finalInstruction?.content).toContain('临时剧情执行令｜仅本轮、最高执行优先级')
    expect(finalInstruction?.content).toContain('不是参考资料、可选建议或未来备忘')
    expect(finalInstruction?.content).toContain('本次回复必须')
    expect(finalInstruction?.content).toContain('只有本次被点名的「沈衍」收到')
    expect(finalInstruction?.content).toContain('未被 @ 的群聊成员不得因此获得后台知情')
    expect(finalInstruction?.content).toContain('惟惟只由真实用户控制')
    expect(finalInstruction?.content).toContain('让他接到紧急电话')
    expect(directed.filter((message) => message.role === 'user')).toEqual([{ role: 'user', content: '继续。' }])
    expect(directed.filter((message) => message.role === 'assistant')).toEqual([])
    expect(withFinalTemporaryPlotInstruction(base, '  ', '沈衍', '惟惟')).toBe(base)
  })
  it('keeps drafts until explicitly consumed after success and leaves visible history untouched', () => {
    const captured = captureTemporaryPlot(conversation, false)
    expect(conversation.temporaryPlot).toEqual(captured)
    const completed = consumeTemporaryPlot(conversation, captured, 0)
    expect(completed.temporaryPlot).toBeUndefined()
    expect(completed.messages).toBe(conversation.messages)
    expect(consumeTemporaryPlot(conversation, undefined, 0)).toBe(conversation)
  })
  it('keeps the direction last even when body, identity or plot repair is requested', () => {
    const base = withFinalTemporaryPlotInstruction([{ role: 'user', content: '继续' }], '配角打来电话', '旁白导演', '惟惟')
    const repaired = withAssistantRetryInstruction(base, '请补全正文', true)
    expect(repaired[repaired.length - 1]).toEqual(base[base.length - 1])
    expect(repaired[1].content).toBe('请补全正文')
    expect(base).toHaveLength(2)
    const ordinary = withAssistantRetryInstruction(base.slice(0, 1), '请补全正文', false)
    expect(ordinary[ordinary.length - 1].content).toBe('请补全正文')
  })
  it('lets the director initiate external events without answering for independent roles', () => {
    const directed = withFinalTemporaryPlotInstruction([], '苏念念来电', '旁白导演', '惟惟', 'once', true)
    expect(directed[0].content).toContain('停在铃声、来电显示或送达节点')
    expect(directed[0].content).toContain('不替独立角色接听')
    expect(directed[0].content).toContain('不等于禁止本轮一切新来电')
    const actor = withFinalTemporaryPlotInstruction([], '苏念念来电', '沈衍', '惟惟')
    expect(actor[0].content).not.toContain('你本轮是旁白导演')
  })
  it('preserves edits made during generation and drafts on a new history revision', () => {
    const captured = captureTemporaryPlot(conversation, false)
    const edited = { ...conversation, temporaryPlot: { id: 'draft-2', text: '同一段内容重新保存' } }
    expect(consumeTemporaryPlot(edited, captured, 0)).toBe(edited)
    const restarted = { ...conversation, historyRevision: 1 }
    expect(consumeTemporaryPlot(restarted, captured, 0)).toBe(restarted)
  })
  it('does not carry pending directions into restarted or fresh conversations', () => {
    expect(createFreshConversationFrom(conversation, '新开场').temporaryPlot).toBeUndefined()
    expect(restartConversationInPlace(conversation, '新开场').temporaryPlot).toBeUndefined()
  })
  it('keeps persistent directions until the user ends them', () => {
    const persistent: Conversation = { ...conversation, temporaryPlot: { id: 'persistent', text: '保持对峙节奏', mode: 'persistent' } }
    expect(consumeTemporaryPlot(persistent, captureTemporaryPlot(persistent, false), 0)).toBe(persistent)
    const prompt = withFinalTemporaryPlotInstruction([], persistent.temporaryPlot!.text, '沈衍', '惟惟', 'persistent')
    expect(prompt[0].content).toContain('持续幕后方向')
    expect(prompt[0].content).toContain('已完成的事件只保留结果')
  })
  it('counts a multi-speaker send only once and ends after the final success', () => {
    const counted: Conversation = { ...conversation, kind: 'group', temporaryPlot: { id: 'counted', text: '保持对峙', mode: 'counted', remainingUses: 2 } }
    const captured = captureTemporaryPlot(counted, true)
    const first = consumeTemporaryPlot(counted, captured, 0)
    expect(first.temporaryPlot?.remainingUses).toBe(1)
    expect(consumeTemporaryPlot(first, captured, 0)).toBe(first)
    expect(consumeTemporaryPlot(first, captureTemporaryPlot(first, true), 0).temporaryPlot).toBeUndefined()
  })
  it('routes only to explicitly mentioned permitted recipients', () => {
    const privatePlot: Conversation = { ...conversation, kind: 'group', temporaryPlot: { id: 'private', text: '别让导演知道', mode: 'persistent', recipientIds: ['a'] } }
    expect(captureTemporaryPlot(privatePlot, true, 'a')?.text).toBe('别让导演知道')
    expect(captureTemporaryPlot(privatePlot, false, 'a')).toBeUndefined()
    expect(captureTemporaryPlot(privatePlot, true, 'director')).toBeUndefined()
    expect(captureTemporaryPlot(privatePlot, true)).toBeUndefined()
    expect(captureTemporaryPlot({ ...privatePlot, temporaryPlot: { ...privatePlot.temporaryPlot!, recipientIds: [] } }, true, 'a')).toBeUndefined()
  })
  it('does not overwrite a counted duration changed during generation', () => {
    const counted: Conversation = { ...conversation, temporaryPlot: { id: 'counted', text: '保持对峙', mode: 'counted', remainingUses: 2 } }
    const edited = { ...counted, temporaryPlot: { ...counted.temporaryPlot!, id: 'edited', remainingUses: 8 } }
    expect(consumeTemporaryPlot(edited, captureTemporaryPlot(counted, false), 0)).toBe(edited)
  })
})
