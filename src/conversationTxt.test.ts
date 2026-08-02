import { describe, expect, it } from 'vitest'
import { parseConversationTxt } from './conversationTxt'

describe('conversation TXT import', () => {
  it('parses the app export format without changing rich message text', () => {
    const parsed = parseConversationTxt(`与顾荒的对话
角色：顾荒
用户：苏禾
导出时间：2026/8/2 09:57:59

顾荒
<scene>时间：次日 00:20</scene>
“看够了吗？”

--------------------

苏禾
她很漂亮。`)

    expect(parsed.title).toBe('与顾荒的对话')
    expect(parsed.participantNames).toEqual(['顾荒'])
    expect(parsed.userName).toBe('苏禾')
    expect(parsed.messages).toEqual([
      { author: '顾荒', text: '<scene>时间：次日 00:20</scene>\n“看够了吗？”' },
      { author: '苏禾', text: '她很漂亮。' },
    ])
  })

  it('rejects text that is not an exported conversation', () => {
    expect(() => parseConversationTxt('普通笔记')).toThrow('没有找到')
  })
})
