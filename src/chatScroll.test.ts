import { describe, expect, it } from 'vitest'
import { resolveChatScrollTarget } from './chatScroll'

describe('chat scroll restoration', () => {
  it('opens an unseen conversation at its newest message', () => {
    expect(resolveChatScrollTarget(undefined, 4200)).toBe(4200)
  })

  it('keeps a conversation pinned to the newest message', () => {
    expect(resolveChatScrollTarget({ top: 900, stickToBottom: true }, 4200)).toBe(4200)
  })

  it('restores a deliberate reading position within the current extent', () => {
    expect(resolveChatScrollTarget({ top: 900, stickToBottom: false }, 4200)).toBe(900)
    expect(resolveChatScrollTarget({ top: 9000, stickToBottom: false }, 4200)).toBe(4200)
  })
})
