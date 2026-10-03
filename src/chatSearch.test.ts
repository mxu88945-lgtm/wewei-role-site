import { describe, expect, it } from 'vitest'
import { searchChatMessages } from './chatSearch'
import type { Message } from './conversationLifecycle'
const messages: Message[] = [{ id: 1, role: 'user', text: '傅承砚接电话' }, { id: 2, role: 'assistant', text: '他回到餐桌。<gts_status>隐藏内部备注</gts_status>' }]
describe('plot search and bookmarks', () => {
  it('finds exact phrases in visible text without indexing backstage status', () => {
    expect(searchChatMessages(messages, '电话', {}, false).map((item) => item.message.id)).toEqual([1])
    expect(searchChatMessages(messages, '内部备注', {}, false)).toEqual([])
  })
  it('searches notes and restricts the list to bookmarks', () => {
    const bookmarks = { 2: { note: '修罗场名场面', createdAt: 1 } }
    expect(searchChatMessages(messages, '修罗场', bookmarks, false).map((item) => item.message.id)).toEqual([2])
    expect(searchChatMessages(messages, '', bookmarks, true).map((item) => item.message.id)).toEqual([2])
  })
})
