import { describe, expect, it } from 'vitest'
import { buildReplyHelperMessages, cleanReplyHelperDraft } from './replyHelper'

describe('AI reply helper', () => {
  it('builds a user-only draft prompt without hidden project data', () => {
    const messages = buildReplyHelperMessages({
      userName: '江黎姿',
      userDescription: '独立清醒，不轻易原谅。',
      conversationTitle: '汐与海',
      currentDraft: '先问他消息来源',
      recentMessages: [{ author: '陆景澄', text: '我查到了一条公开报道。' }],
      project: {
        title: '落水真相', worldBackground: '现代商战', currentTime: '第四天晚间', currentLocation: '车内', relationshipStage: '察觉偏爱', presentCharacters: ['江黎姿', '陆景澄'],
        publicEvidence: [{ title: '公开报道', detail: '媒体已刊登联姻消息' }],
      },
    })
    const prompt = messages.map((message) => message.content).join('\n')
    expect(prompt).toContain('只替用户起草')
    expect(prompt).toContain('不得替其他角色')
    expect(prompt).toContain('不擅自替用户确认恋爱、原谅、复合')
    expect(prompt).toContain('公开报道：媒体已刊登联姻消息')
    expect(prompt).toContain('先问他消息来源')
  })

  it('removes assistant wrappers before filling the composer', () => {
    expect(cleanReplyHelperDraft('```text\n建议回复：我想先看看消息来源。\n```')).toBe('我想先看看消息来源。')
  })
})
