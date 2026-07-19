import { describe, expect, it } from 'vitest'
import { archivedMemoriesForConversation, memoriesForConversation, replaceConversationMemories, restoreMemoryToRevision, selectRelevantMemories } from './memoryEngine'

describe('long-running memory selection', () => {
  it('isolates conversation memories while keeping legacy fallback', () => {
    const map = { character: [{ content: '旧角色记忆' }], conversation: [{ content: '当前剧情记忆' }] }
    expect(memoriesForConversation(map, 'conversation', 'character')[0].content).toBe('当前剧情记忆')
    expect(memoriesForConversation(map, 'missing', 'character')[0].content).toBe('旧角色记忆')
  })

  it('always keeps core memory and selects relevant older events', () => {
    const entries = [
      { id: 'core', createdAt: 1, content: '苏禾只能由用户控制。', pinned: true },
      { id: 'old-relevant', createdAt: 2, content: '顾荒在雨夜承诺会保住那枚戒指。' },
      { id: 'new-unrelated', createdAt: 3, content: '众人在餐厅吃了晚餐。' },
    ]
    const selected = selectRelevantMemories(entries, '顾荒低头看着那枚戒指，想起雨夜。', 1000)
    expect(selected.map((item) => item.id)).toContain('core')
    expect(selected.map((item) => item.id)).toContain('old-relevant')
  })

  it('isolates a rewritten branch without deleting its archived memories', () => {
    const map = { conversation: [
      { id: 'old', content: '旧分支结局', historyRevision: 0 },
      { id: 'new', content: '新分支进展', historyRevision: 1 },
    ] }
    expect(memoriesForConversation(map, 'conversation', 'character', 1).map((entry) => entry.id)).toEqual(['new'])

    const replaced = replaceConversationMemories(map, 'conversation', 'character', 1, [{ id: 'newer', content: '新分支整理', historyRevision: 1 }])
    expect(replaced.conversation.map((entry) => entry.id)).toEqual(['old', 'newer'])
  })

  it('lists archived branch memories and can copy one into the current branch', () => {
    const map = { conversation: [
      { id: 'old', title: '阶段一', content: '旧分支中仍然有效的长期事实', historyRevision: 0 },
      { id: 'new', title: '阶段二', content: '当前分支事实', historyRevision: 2 },
    ] }
    const archived = archivedMemoriesForConversation(map, 'conversation', 'character', 2)
    expect(archived.map((entry) => entry.id)).toEqual(['old'])
    expect(restoreMemoryToRevision(archived[0], 2, 'restored')).toMatchObject({
      id: 'restored', historyRevision: 2, restoredFromId: 'old', content: '旧分支中仍然有效的长期事实',
    })
  })
})
