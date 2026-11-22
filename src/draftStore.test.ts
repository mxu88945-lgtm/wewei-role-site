import { beforeEach, describe, expect, it } from 'vitest'
import { draftScopeKey, readScopedDraft, saveScopedDraft } from './draftStore'

const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  })
})

describe('scoped composer drafts', () => {
  it('uses distinct keys for chat and persona scopes', () => {
    expect(draftScopeKey('chat', 'conversation-1')).not.toBe(draftScopeKey('persona', 'conversation-1'))
  })

  it('saves and reads only the requested scope', () => {
    saveScopedDraft('composer:chat:one', '主聊天草稿')
    saveScopedDraft('composer:chat:two', '另一段草稿')
    expect(readScopedDraft('composer:chat:one')).toBe('主聊天草稿')
    expect(readScopedDraft('composer:chat:two')).toBe('另一段草稿')
  })

  it('clears one scope without touching another', () => {
    saveScopedDraft('composer:chat:one', '保留')
    saveScopedDraft('composer:chat:two', '清除')
    saveScopedDraft('composer:chat:two', '')
    expect(readScopedDraft('composer:chat:one')).toBe('保留')
    expect(readScopedDraft('composer:chat:two')).toBe('')
  })
})
