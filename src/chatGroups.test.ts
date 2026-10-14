import { describe, expect, it } from 'vitest'
import type { Conversation } from './conversationLifecycle'
import { assignChatGroup, chatGroupNames, groupConversations, setChatGroupMembers } from './chatGroups'

const chat = (id: string, updatedAt: number, chatGroup?: string) => ({ id, characterId: 'c', title: id, messages: [], createdAt: 0, updatedAt, chatGroup }) as Conversation

describe('chat groups', () => {
  it('orders groups by their newest chat and puts ungrouped last', () => {
    const list = [chat('a', 9), chat('b', 8, '谢篇'), chat('c', 7, '顾篇'), chat('d', 6, '谢篇')]
    const sections = groupConversations(list)
    expect(sections.map((s) => s.name)).toEqual(['谢篇', '顾篇', '未分组'])
    expect(sections[0].items.map((c) => c.id)).toEqual(['b', 'd'])
    expect(chatGroupNames(list)).toEqual(['谢篇', '顾篇'].sort((x, y) => x.localeCompare(y, 'zh-Hans-CN')))
  })

  it('assigns, edits members and renames without touching updatedAt', () => {
    const list = assignChatGroup([chat('a', 1), chat('b', 2), chat('c', 3)], ['a', 'b'], '谢篇')
    expect(list.map((c) => c.chatGroup)).toEqual(['谢篇', '谢篇', undefined])
    const edited = setChatGroupMembers(list, '谢篇', '谢聿衡篇', ['b', 'c'])
    expect(edited.map((c) => c.chatGroup)).toEqual([undefined, '谢聿衡篇', '谢聿衡篇'])
    expect(edited.map((c) => c.updatedAt)).toEqual([1, 2, 3])
  })
})
