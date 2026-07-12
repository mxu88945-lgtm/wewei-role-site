import { describe, expect, it } from 'vitest'
import { memoriesForConversation, selectRelevantMemories } from './memoryEngine'

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
})
