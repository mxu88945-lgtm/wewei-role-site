import { describe, expect, it } from 'vitest'
import { latestMessageId, phoneUnreadCount, unreadLabel } from './phoneUnread'
import type { Message } from './conversationLifecycle'

const msgs: Message[] = [
  { id: 10, role: 'assistant', text: '旧的' },
  { id: 20, role: 'user', text: '我说' },
  { id: 30, role: 'assistant', text: '新消息', characterId: 'a' },
  { id: 31, role: 'assistant', text: '剧情更新', phoneNotice: true },
  { id: 32, role: 'assistant', text: '正在回应…' },
  { id: 33, role: 'assistant', text: '又一条', characterId: 'b' },
]

describe('phone unread', () => {
  it('counts character messages after readId only', () => {
    expect(phoneUnreadCount({ phone: { bindings: {}, readId: 20 }, messages: msgs })).toBe(2)
    expect(phoneUnreadCount({ phone: { bindings: {}, readId: 33 }, messages: msgs })).toBe(0)
  })
  it('treats legacy conversations without readId as read', () => {
    expect(phoneUnreadCount({ phone: { bindings: {} }, messages: msgs })).toBe(0)
    expect(phoneUnreadCount({ messages: msgs })).toBe(0)
  })
  it('finds latest id and caps the label', () => {
    expect(latestMessageId({ messages: msgs })).toBe(33)
    expect(unreadLabel(5)).toBe('5')
    expect(unreadLabel(120)).toBe('99+')
  })
})
