import { describe, expect, it } from 'vitest'
import { isMemoryScanCurrent } from './memoryScan'
import type { Conversation } from './conversationLifecycle'
const source: Conversation = { id: 'chat', title: '剧情', characterId: 'a', createdAt: 1, updatedAt: 1, messages: [{ id: 1, role: 'user', text: '事实' }, { id: 2, role: 'assistant', text: '回应', characterId: 'a' }] }
describe('memory scan source verification', () => {
  it('accepts new appended turns without overwriting their summary cursor', () => {
    expect(isMemoryScanCurrent({ ...source, messages: [...source.messages, { id: 3, role: 'user', text: '新剧情' }] }, source, source.messages)).toBe(true)
  })
  it('rejects old results after rewrite, restart, deletion or changed attribution', () => {
    expect(isMemoryScanCurrent(undefined, source, source.messages)).toBe(false)
    expect(isMemoryScanCurrent({ ...source, historyRevision: 1 }, source, source.messages)).toBe(false)
    expect(isMemoryScanCurrent({ ...source, messages: source.messages.slice(0, 1) }, source, source.messages)).toBe(false)
    expect(isMemoryScanCurrent({ ...source, messages: source.messages.map((message) => ({ ...message, text: '修改' })) }, source, source.messages)).toBe(false)
    expect(isMemoryScanCurrent({ ...source, messages: source.messages.map((message) => ({ ...message, characterId: 'b' })) }, source, source.messages)).toBe(false)
  })
})

import { hasCompleteCoreMemoryPayload, planMemoryScan } from './memoryScan'
it('limits incremental scans without marking unprocessed turns as summarized', () => {
  const messages = Array.from({ length: 140 }, (_, i) => ({ id: i, role: 'user' as const, text: '正文' }))
  const first = planMemoryScan(messages, 10)
  expect(first.pendingMessages).toHaveLength(100)
  expect(first.end).toBe(110)
  expect(first.hasMore).toBe(true)
  const next = planMemoryScan(messages, first.end)
  expect(next.pendingMessages[0].id).toBe(110)
  expect(next.pendingMessages).toHaveLength(30)
  expect(next.hasMore).toBe(false)
  const limited = planMemoryScan(messages, 0, 8)
  expect(limited.end).toBe(4)
})
it('recognizes a valid empty core-memory result without requiring a second model request', () => {
  expect(hasCompleteCoreMemoryPayload('{"memories":[]}')).toBe(true)
  expect(hasCompleteCoreMemoryPayload('{"memories":[{"content":"事实"}]}')).toBe(true)
  expect(hasCompleteCoreMemoryPayload('')).toBe(false)
  expect(hasCompleteCoreMemoryPayload('{"memories":')).toBe(false)
})
