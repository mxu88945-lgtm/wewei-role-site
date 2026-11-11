import { describe, expect, it } from 'vitest'
import { PHONE_IDENTITY_KEY, readPhoneIdentity, resolvePhoneIdentity, writePhoneIdentity } from './phoneIdentity'

const lib = [
  { id: 'story-a', name: '宁梦曦', description: '剧情身份' },
  { id: 'persona-default', name: '周惟惟', description: '基础', avatar: 'base.png' },
]

describe('resolvePhoneIdentity', () => {
  it('uses the phone identity when a name is set, borrowing blank fields from the base', () => {
    const r = resolvePhoneIdentity({ name: ' 惟惟 ', description: '' }, lib)
    expect(r.name).toBe('惟惟')
    expect(r.description).toBe('基础')
    expect(r.avatar).toBe('base.png')
  })
  it('falls back to persona-default, never the story identity', () => {
    expect(resolvePhoneIdentity({ name: '', description: 'x' }, lib).id).toBe('persona-default')
    expect(resolvePhoneIdentity(undefined, lib).id).toBe('persona-default')
  })
  it('falls back to the first identity, then the built-in default', () => {
    expect(resolvePhoneIdentity(undefined, [lib[0]]).id).toBe('story-a')
    expect(resolvePhoneIdentity(undefined, []).name).toBeTruthy()
  })
  it('round-trips through storage under a weijing.* key so backup picks it up', () => {
    const m = new Map<string, string>()
    const storage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
    writePhoneIdentity({ name: '惟惟', description: 'd' }, storage)
    expect(PHONE_IDENTITY_KEY.startsWith('weijing.')).toBe(true)
    expect(readPhoneIdentity(storage).name).toBe('惟惟')
    writePhoneIdentity({ name: '', description: '' }, storage)
    expect(m.has(PHONE_IDENTITY_KEY)).toBe(false)
  })
})
