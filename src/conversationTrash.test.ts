import { describe, expect, it } from 'vitest'
import { createConversationTrashEntry, restoreConversationTrashEntry } from './conversationTrash'
import type { Conversation } from './conversationLifecycle'

const source: Conversation = {
  id: 'chat-1', characterId: 'actor', title: '一段旧剧情', createdAt: 1, updatedAt: 3,
  messages: [{ id: 1, role: 'assistant', text: '开场', characterId: 'actor' }, { id: 2, role: 'user', text: '继续' }],
  contextSummary: '已经发生的事', personaId: 'persona-a', historyRevision: 2,
}

describe('conversation trash snapshots', () => {
  it('deep-copies the conversation, memories and project bindings', () => {
    const memories = [{ id: 'memory-1', content: '已经确认的事实' }]
    const input = structuredClone(source)
    const projectIds = ['project-1']
    const entry = createConversationTrashEntry(input, memories, projectIds, 10)

    input.messages[0].text = '外部改动'
    memories[0].content = '外部改动'
    projectIds.length = 0

    expect(entry.id).toBe('chat-1:10')
    expect(entry.conversation.messages[0].text).toBe('开场')
    expect(entry.memories[0].content).toBe('已经确认的事实')
    expect(entry.storyProjectIds).toEqual(['project-1'])
  })

  it('returns fresh copies when restoring so the trash entry remains recoverable', () => {
    const entry = createConversationTrashEntry(source, [{ id: 'memory-1' }], [], 20)
    const restored = restoreConversationTrashEntry(entry)
    restored.conversation.messages[0].text = '恢复后编辑'
    restored.memories[0].id = 'changed'

    expect(entry.conversation.messages[0].text).toBe('开场')
    expect(entry.memories[0].id).toBe('memory-1')
  })
})
