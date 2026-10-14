import { describe, expect, it } from 'vitest'
import { buildChatPrompt } from './promptBuilder'
import type { Character } from './characterCard'
import { buildMessageQuote, clipQuoteText, prioritizeAddressed, quotePromptPrefix, quotedParticipantIds, withQuotePrefix } from './quoteReply'
import { lurkFallback, selectPhoneSpeakers } from './phoneGroup'

const character = {
  id: 'gu', name: '顾荒', tagline: '', description: '', personality: '', scenario: '', greeting: '', alternateGreetings: [], mesExample: '',
  creatorNotes: '', systemPrompt: '', postHistoryInstructions: '', beautificationProtocol: '', tags: [], creator: '', characterVersion: '', regexScripts: [],
} as unknown as Character

const prompt = (messages: Parameters<typeof buildChatPrompt>[0]['messages']) => buildChatPrompt({
  character, user: { name: '惟惟', description: '' }, messages, preset: '', globalWorldbook: '',
  memory: { entries: [], injectPosition: 'after-main-prompt', injectPrompt: '{{memories}}' }, memoryLength: 20,
})

describe('引用回复：文本与提示词', () => {
  it('引用文本去掉状态栏、合并空白并截到约 80 字', () => {
    expect(clipQuoteText('你好\n\n  世界<status>心情：好</status>')).toBe('你好 世界')
    const long = '字'.repeat(100)
    expect(clipQuoteText(long)).toBe(`${'字'.repeat(80)}…`)
    expect(buildMessageQuote({ id: 12, text: '在吗' }, '陆屿')).toEqual({ messageId: '12', author: '陆屿', text: '在吗' })
    expect(buildMessageQuote({ id: 13, text: '', images: [{}] }, '陆屿').text).toBe('[图片]')
  })

  it('前缀格式固定，空引用不加', () => {
    const quote = { messageId: '1', author: '陆屿', text: '今晚谁请客' }
    expect(quotePromptPrefix(quote)).toBe('（引用 陆屿：“今晚谁请客”）')
    expect(withQuotePrefix('我请', quote)).toBe('（引用 陆屿：“今晚谁请客”）\n我请')
    expect(withQuotePrefix('我请', undefined)).toBe('我请')
  })

  it('发给模型的用户轮带引用前缀，没引用的不变', () => {
    const result = prompt([
      { role: 'assistant', text: '今晚谁请客', characterId: 'lu' },
      { role: 'user', text: '我请', quote: { messageId: '1', author: '陆屿', text: '今晚谁请客' } },
      { role: 'user', text: '再加一句' },
    ])
    const users = result.filter((message) => message.role === 'user').map((message) => message.content)
    expect(users).toContain('（引用 陆屿：“今晚谁请客”）\n我请')
    expect(users).toContain('再加一句')
  })
})

describe('引用回复：小手机发言优先', () => {
  const participants = [{ id: 'gu', name: '顾荒' }, { id: 'lu', name: '陆屿' }, { id: 'cheng', name: '程妄' }]
  const history = [{ id: 5, role: 'assistant', characterId: 'cheng' }, { id: 6, role: 'user' }]

  it('按原消息找被引用成员，找不到再按名字；引用自己不算', () => {
    expect(quotedParticipantIds({ messageId: '5', author: '改过名', text: 'x' }, participants, history)).toEqual(['cheng'])
    expect(quotedParticipantIds({ messageId: '99', author: '陆屿', text: 'x' }, participants, history)).toEqual(['lu'])
    expect(quotedParticipantIds({ messageId: '6', author: '惟惟', text: 'x' }, participants, history)).toEqual([])
    expect(quotedParticipantIds({ messageId: '99', author: '路人', text: 'x' }, participants, history)).toEqual([])
    expect(quotedParticipantIds(undefined, participants, history)).toEqual([])
  })

  it('被引用者像 @ 一样优先：@ 模式、点名模式、旁观插话兜底、智能挑选结果', () => {
    const quoted = quotedParticipantIds({ messageId: '5', author: '程妄', text: 'x' }, participants, history)
    const mentionedIds = prioritizeAddressed([], quoted)
    const ids = participants.map((item) => item.id)
    expect(selectPhoneSpeakers({ mode: 'at', participantIds: ids, mentionedIds, namedIds: [], text: '好' })).toEqual(['cheng'])
    expect(selectPhoneSpeakers({ mode: 'free', participantIds: ids, mentionedIds, namedIds: [], text: '好', random: () => 0 })[0]).toBe('cheng')
    expect(lurkFallback(ids, mentionedIds, 'gu')).toEqual(['cheng'])
    expect(prioritizeAddressed(['gu', 'cheng'], quoted)).toEqual(['cheng', 'gu'])
    expect(prioritizeAddressed(['lu'], ['cheng', 'cheng'])).toEqual(['cheng', 'lu'])
  })
})
