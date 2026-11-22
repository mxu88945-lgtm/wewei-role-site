import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pullRoleWakeInbox, readRoleWakeConfig, roleWakeRecentSummary, syncRoleWake, writeRoleWakeConfig } from './roleWake'

const store = new Map<string, string>()
const fakeStorage = { getItem: (key: string) => store.get(key) || null, setItem: (key: string, value: string) => { store.set(key, value) }, removeItem: (key: string) => { store.delete(key) }, key: () => null, get length() { return store.size } } as unknown as Storage

describe('role-wake client', () => {
  beforeEach(() => { store.clear(); vi.stubGlobal('localStorage', fakeStorage); vi.restoreAllMocks() })
  it('defaults to disabled and stores config outside weijing backup namespace', () => {
    expect(readRoleWakeConfig()).toMatchObject({ enabled: false, url: '', key: '' })
    writeRoleWakeConfig({ enabled: true, url: 'https://wake.example.com/', key: 'secret' })
    expect(readRoleWakeConfig()).toMatchObject({ enabled: true, url: 'https://wake.example.com', key: 'secret' })
    expect([...store.keys()].every((key) => !key.startsWith('weijing.'))).toBe(true)
  })
  it('syncs bounded summaries without sending a message transcript', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    writeRoleWakeConfig({ enabled: true, url: 'https://wake.example.com', key: 'secret' })
    await syncRoleWake({ roleId: 'r1', roleName: '角色', personaSummary: 'p'.repeat(9000), recentSummary: 'r'.repeat(3000), lastChatAt: 1 })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.personaSummary.length).toBe(6000)
    expect(body.recentSummary.length).toBe(1800)
    expect(body.messages).toBeUndefined()
  })
  it('deduplicates inbox ids on a repeated response', async () => {
    writeRoleWakeConfig({ enabled: true, url: 'https://wake.example.com', key: 'secret' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'a', text: '你好' }, { id: 'a', text: '你好' }, { id: 'b', text: '想你' }] }) }))
    expect((await pullRoleWakeInbox('r1')).map((item) => item.id)).toEqual(['a', 'b'])
    expect(await pullRoleWakeInbox('r1')).toEqual([])
  })
  it('creates a short recent summary', () => {
    expect(roleWakeRecentSummary([{ role: 'user', text: '  你好   世界  ' }, { role: 'assistant', text: '嗯' }])).toBe('她：你好 世界\n他：嗯')
  })
})
