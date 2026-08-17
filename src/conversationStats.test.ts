import { describe, expect, it } from 'vitest'
import { countConversationStats } from './conversationStats'

describe('conversation stats', () => {
  it('counts each user send as one conversation round', () => {
    expect(countConversationStats([
      { role: 'assistant' },
      { role: 'user' },
      { role: 'assistant' },
      { role: 'user' },
      { role: 'assistant' },
    ])).toEqual({ rounds: 2, replies: 3, total: 5 })
  })

  it('does not inflate rounds when several characters reply in a group chat', () => {
    expect(countConversationStats([
      { role: 'user' },
      { role: 'assistant' },
      { role: 'assistant' },
    ])).toEqual({ rounds: 1, replies: 2, total: 3 })
  })
})
