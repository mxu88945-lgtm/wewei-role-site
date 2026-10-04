import { describe, expect, it } from 'vitest'
import { appendReplyAlternative, captureConversationContext, contextAtMessage, forkConversationAtMessage, projectContextFromSnapshot, restoreConversationContext, selectReplyAlternative, storeContextSnapshot } from './conversationBranches'
import type { Conversation } from './conversationLifecycle'
import { createBlankCharacter, createCharacterMemoryEntry } from './characterCard'
import { buildChatPrompt } from './promptBuilder'

const source: Conversation = {
  id: 'parent', characterId: 'a', title: '原剧情', createdAt: 1, updatedAt: 3,
  messages: [{ id: 1, role: 'assistant', text: '开场', characterId: 'a' }, { id: 2, role: 'user', text: '你接电话吧' }, { id: 3, role: 'assistant', text: '他接起了电话。', characterId: 'a' }],
  historyRevision: 2, contextSummary: '此前已发生的事', contextSummaryRevision: 2, compressedUntil: 1,
  memorySummarizedCount: 2, relationshipStages: { a: 3 },
  characterMemories: { a: [createCharacterMemoryEntry({ title: '早期事实', content: '已经抵达老宅' })] },
  participantApiIds: { a: 'channel-a' }, participantModelNames: { a: 'model-a' },
  temporaryPlot: { id: 'plot', text: '私下安排', mode: 'persistent' },
  bookmarks: { '1': { note: '开场', createdAt: 1 }, '3': { note: '来电', createdAt: 3 } },
}
const memories = [{ id: 'm1', content: '旧事', historyRevision: 2, sourceCount: 2 }]

describe('reply alternatives', () => {
  it('preserves original versions, identity, finish reasons and selected snapshot', () => {
    const original = { ...source.messages[2], contextSnapshotId: 'old-state', finishReason: 'length' }
    const next = appendReplyAlternative(original, { ...original, id: 99, text: '他挂断了电话。', finishReason: 'stop', contextSnapshotId: 'new-state' })
    expect(next.id).toBe(original.id)
    expect(next.characterId).toBe('a')
    expect(next.selectedAlternative).toBe(1)
    const selected = selectReplyAlternative(next, 0)
    expect(selected.text).toBe(original.text)
    expect(selected.finishReason).toBe('length')
    expect(selected.contextSnapshotId).toBe('old-state')
    expect(next.text).toBe('他挂断了电话。')
    expect(selectReplyAlternative(next, -1)).toBe(next)
    expect(selectReplyAlternative(next, 1.5)).toBe(next)
  })
  it('keeps manual edits when switching away or generating another version', () => {
    const first = appendReplyAlternative(source.messages[2], { ...source.messages[2], text: '第二版' })
    const edited = { ...first, text: '手动修过的第二版' }
    const selected = selectReplyAlternative(edited, 0)
    expect(selectReplyAlternative(selected, 1).text).toBe('手动修过的第二版')
    expect(appendReplyAlternative(edited, { ...edited, text: '第三版' }).alternatives?.[1].text).toBe('手动修过的第二版')
  })
  it('sends only the selected version to the model, never the alternatives', () => {
    const next = appendReplyAlternative(source.messages[2], { ...source.messages[2], text: '另一版独有的事实' })
    const selected = selectReplyAlternative(next, 0)
    const character = createBlankCharacter({ name: '沈衍', tagline: '', description: '', greeting: '', tags: '' })
    const prompt = buildChatPrompt({ character, user: { name: '惟惟', description: '' }, messages: [selected], preset: '', globalWorldbook: '', memoryLength: 30, memory: { entries: [], injectPosition: 'none', injectPrompt: '' } })
    expect(JSON.stringify(prompt)).toContain('他接起了电话')
    expect(JSON.stringify(prompt)).not.toContain('另一版独有的事实')
  })
})

describe('conversation context snapshots and branches', () => {
  it('injects only one actor’s frozen project context, subordinate to new dialogue', () => {
    const rendered = projectContextFromSnapshot({ a: '角色已知事实', director: '导演专属隐藏真相' }, 'a')
    expect(rendered).toContain('角色已知事实')
    expect(rendered).not.toContain('导演专属隐藏真相')
    expect(rendered).toContain('分线中用户和角色新写出的明确事实')
    expect(projectContextFromSnapshot({ director: '私密信息' }, 'a')).toBe('')
  })
  it('deep-copies memory state and ignores invalid compression summaries', () => {
    const captured = captureConversationContext(source, memories, { a: '角色可知场记', director: '导演私有场记' })
    captured.characterMemories!.a[0].content = '修改后的事实'
    captured.memories[0].content = '修改后的记忆'
    expect(source.characterMemories!.a[0].content).toBe('已经抵达老宅')
    expect(memories[0].content).toBe('旧事')
    expect(captureConversationContext({ ...source, contextSummaryRevision: 1 }, []).contextSummary).toBeUndefined()
  })
  it('deduplicates identical snapshots but preserves different actor-private contexts', () => {
    const context = captureConversationContext(source, memories, { a: 'a私有' })
    const first = storeContextSnapshot(source, context, 'snapshot-1')
    const second = storeContextSnapshot(first.conversation, context, 'snapshot-2')
    expect(second.snapshotId).toBe('snapshot-1')
    expect(second.conversation).toBe(first.conversation)
    const changed = storeContextSnapshot(first.conversation, { ...context, projectContext: { a: '不同场记' } }, 'snapshot-3')
    expect(Object.keys(changed.conversation.contextSnapshots!)).toHaveLength(2)
  })
  it('restores an old branch without future memories, stages or project information', () => {
    const old = captureConversationContext({ ...source, relationshipStages: { a: 1 }, contextSummary: '当时摘要' }, [{ content: '只在当时知道的事' }], { a: '当时场记', director: '当时秘密' })
    const parent = { ...source, messages: source.messages.map((item) => ({ ...item, contextSnapshotId: item.id === 1 ? 'early' : 'future' })), contextSnapshots: { early: old, future: captureConversationContext(source, [{ content: '未来真相' }]) } }
    const branch = forkConversationAtMessage(parent, 1, captureConversationContext(source, [{ content: '未来真相' }]), 'fork', '另一条线')
    expect(branch.conversation.messages).toHaveLength(1)
    expect(branch.memories.map((item) => item.content)).toEqual(['只在当时知道的事'])
    expect(branch.memories[0].historyRevision).toBe(0)
    expect(branch.conversation.relationshipStages?.a).toBe(1)
    expect(branch.conversation.projectContextSnapshot).toEqual({ a: '当时场记', director: '当时秘密' })
    expect(branch.conversation.contextSummary).toBe('当时摘要')
    expect(branch.conversation.contextSummaryRevision).toBe(0)
    expect(Object.keys(branch.conversation.contextSnapshots!)).toEqual(['early'])
    expect(branch.conversation.temporaryPlot).toBeUndefined()
    expect(Object.keys(branch.conversation.bookmarks!)).toEqual(['1'])
    expect(parent.messages).toHaveLength(3)
    expect(parent.historyRevision).toBe(2)
  })
  it('forks the latest point with current independent memory and API state', () => {
    const branch = forkConversationAtMessage(source, 3, captureConversationContext(source, memories), 'fork', '副本')
    expect(branch.hasSnapshot).toBe(true)
    expect(branch.conversation.fork?.parentId).toBe(source.id)
    expect(branch.conversation.participantApiIds).toEqual(source.participantApiIds)
    expect(branch.conversation.participantModelNames).toEqual(source.participantModelNames)
    branch.conversation.characterMemories!.a[0].content = '分线修改'
    branch.memories[0].content = '分线记忆'
    expect(source.characterMemories!.a[0].content).toBe('已经抵达老宅')
    expect(memories[0].content).toBe('旧事')
  })
  it('does not import current memories into legacy historical messages', () => {
    const branch = forkConversationAtMessage(source, 1, captureConversationContext(source, memories), 'fork', '旧位置')
    expect(branch.hasSnapshot).toBe(false)
    expect(branch.memories).toEqual([])
    expect(branch.conversation.characterMemories).toEqual({})
    expect(branch.conversation.contextSummary).toBeUndefined()
    expect(branch.conversation.relationshipStages).toBeUndefined()
    expect(branch.conversation.projectContextSnapshot).toEqual({})
    expect(() => forkConversationAtMessage(source, 999, captureConversationContext(source, memories), 'fork', '无效')).toThrow()
  })
  it('version changes restore the matching context and invalidate future summaries', () => {
    const restored = restoreConversationContext(source, source.messages.slice(0, 2), undefined)
    expect(restored.historyRevision).toBe(3)
    expect(restored.contextSummary).toBeUndefined()
    expect(restored.characterMemories).toEqual({})
    expect(restored.memorySummarizedCount).toBe(0)
    expect(contextAtMessage(source, source.messages[0])).toBeUndefined()
  })
})
