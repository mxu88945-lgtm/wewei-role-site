import { describe, expect, it } from 'vitest'
import { captureTemporaryPlot, consumeTemporaryPlot } from './temporaryPlot'
import { createFreshConversationFrom, restartConversationInPlace, type Conversation } from './conversationLifecycle'

const conversation: Conversation = { id: 'chat', characterId: 'a', title: '对话', createdAt: 1, updatedAt: 1, messages: [{ id: 1, role: 'assistant', text: '开场' }], temporaryPlot: { id: 'draft-1', text: '他接到电话' } }

describe('one-shot backstage plot', () => {
  it('captures single-chat directions and only explicitly mentioned group speakers', () => {
    expect(captureTemporaryPlot(conversation, false)?.text).toBe('他接到电话')
    const group = { ...conversation, kind: 'group' as const }
    expect(captureTemporaryPlot(group, false)).toBeUndefined()
    expect(captureTemporaryPlot(group, true)?.text).toBe('他接到电话')
    expect(captureTemporaryPlot({ ...conversation, temporaryPlot: { id: 'empty', text: '  ' } }, true)).toBeUndefined()
  })
  it('keeps drafts until explicitly consumed after success and leaves visible history untouched', () => {
    const captured = captureTemporaryPlot(conversation, false)
    expect(conversation.temporaryPlot).toEqual(captured)
    const completed = consumeTemporaryPlot(conversation, captured, 0)
    expect(completed.temporaryPlot).toBeUndefined()
    expect(completed.messages).toBe(conversation.messages)
    expect(consumeTemporaryPlot(conversation, undefined, 0)).toBe(conversation)
  })
  it('preserves edits made during generation and drafts on a new history revision', () => {
    const captured = captureTemporaryPlot(conversation, false)
    const edited = { ...conversation, temporaryPlot: { id: 'draft-2', text: '同一段内容重新保存' } }
    expect(consumeTemporaryPlot(edited, captured, 0)).toBe(edited)
    const restarted = { ...conversation, historyRevision: 1 }
    expect(consumeTemporaryPlot(restarted, captured, 0)).toBe(restarted)
  })
  it('does not carry pending directions into restarted or fresh conversations', () => {
    expect(createFreshConversationFrom(conversation, '新开场').temporaryPlot).toBeUndefined()
    expect(restartConversationInPlace(conversation, '新开场').temporaryPlot).toBeUndefined()
  })
})
