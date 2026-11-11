import { describe, expect, it } from 'vitest'
import { resolveChatScrollTarget, resolveRelayoutScrollTop } from './chatScroll'

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

describe('relayout nudge after returning to chat (v203)', () => {
  it('keeps the restored reading position instead of a stale 0', () => {
    expect(resolveRelayoutScrollTop({ restorePending: false, snapshot: { top: 1800, stickToBottom: false }, liveTop: 1800, maxScrollTop: 6000 })).toBe(1800)
  })
  it('applies the saved snapshot while the restore is still pending', () => {
    expect(resolveRelayoutScrollTop({ restorePending: true, snapshot: { top: 1800, stickToBottom: false }, liveTop: 0, maxScrollTop: 6000 })).toBe(1800)
  })
  it('stays on the newest message when she was at the bottom', () => {
    expect(resolveRelayoutScrollTop({ restorePending: false, snapshot: { top: 10, stickToBottom: true }, liveTop: 0, maxScrollTop: 6000 })).toBe(6000)
  })
})
