import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { collectBackupData, parseBackup, restoreBackupData, type BackupFile } from './backupStore'
import { durableGet, durableSet, durableSnapshot, replaceDurableSnapshot } from './persistentStore'

class MemoryStorage implements Storage {
  data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, value) }
}
const file = (data: Record<string, string>): BackupFile => ({ format: 'weijing-backup', version: 1, createdAt: '', data })
let storage: MemoryStorage
beforeEach(async () => { storage = new MemoryStorage(); await replaceDurableSnapshot({}) })

describe('complete two-store backup and restore', () => {
  it('exports database-only plots and memories, newer database copies and pending live edits', async () => {
    storage.setItem('weijing.conversations', '["stale"]')
    storage.setItem('weijing.apiChannels', '[{"id":"api"}]')
    storage.setItem('unrelated', 'keep')
    const pending = durableSet('weijing.conversations', [{ id: 'real-chat', bookmarks: { 1: { note: '名场面' } } }])
    await durableSet('weijing.memoryEntries', { 'real-chat': [{ content: '已确认事实' }] })
    const data = await collectBackupData({ 'weijing.plotTemplates': [{ title: '电话', text: '来电' }] }, storage)
    await pending
    expect(JSON.parse(data['weijing.conversations'])[0].id).toBe('real-chat')
    expect(JSON.parse(data['weijing.memoryEntries'])['real-chat'][0].content).toBe('已确认事实')
    expect(JSON.parse(data['weijing.plotTemplates'])[0].title).toBe('电话')
    expect(data['weijing.apiChannels']).toBe('[{"id":"api"}]')
    expect(data).not.toHaveProperty('unrelated')
  })
  it('restores both stores without old database facts returning and handles legacy raw colors', async () => {
    await durableSet('weijing.memoryEntries', { old: [{ content: '旧数据' }] })
    await durableSet('weijing.conversations', [{ id: 'old' }])
    storage.setItem('unrelated', 'keep')
    storage.setItem('weijing.oldSetting', 'true')
    await restoreBackupData(file({ 'weijing.conversations': '[{"id":"restored"}]', 'weijing.memoryEntries': '{"restored":[{"content":"恢复记忆"}]}', 'weijing.pwaThemeColor': '#ffeeff', 'weijing.activeConversation': '"restored"' }), storage)
    expect(await durableGet('weijing.conversations')).toEqual([{ id: 'restored' }])
    expect(await durableGet('weijing.memoryEntries')).toEqual({ restored: [{ content: '恢复记忆' }] })
    expect(storage.getItem('weijing.oldSetting')).toBeNull()
    expect(storage.getItem('weijing.conversations')).toBeNull()
    expect(storage.getItem('weijing.pwaThemeColor')).toBe('#ffeeff')
    expect(storage.getItem('unrelated')).toBe('keep')
    const roundtrip = await collectBackupData({}, storage)
    expect(JSON.parse(roundtrip['weijing.conversations'])[0].id).toBe('restored')
  })
  it('rejects malformed backups before touching any data', async () => {
    await durableSet('weijing.conversations', [{ id: 'keep' }])
    expect(() => parseBackup(file({ 'weijing.conversations': '{}' }))).toThrow()
    expect(() => parseBackup(file({ 'weijing.memoryEntries': 'oops' }))).toThrow()
    expect(() => parseBackup(file({ outsider: '"no"' }))).toThrow()
    expect(await durableGet('weijing.conversations')).toEqual([{ id: 'keep' }])
  })
  it('rolls back a database restore on a failed write, including the queued clear', async () => {
    await durableSet('weijing.conversations', [{ id: 'keep' }])
    await expect(replaceDurableSnapshot({ 'weijing.conversations': () => undefined })).rejects.toThrow()
    expect(await durableGet('weijing.conversations')).toEqual([{ id: 'keep' }])
  })
  it('rolls back local settings on quota failure while preserving the database', async () => {
    await durableSet('weijing.conversations', [{ id: 'keep' }])
    storage.setItem('weijing.activeConversation', '"keep"')
    const original = storage.setItem.bind(storage)
    storage.setItem = (key, value) => { if (key === 'weijing.reject') throw new Error('quota'); original(key, value) }
    await expect(restoreBackupData(file({ 'weijing.conversations': '[{"id":"new"}]', 'weijing.reject': 'true' }), storage)).rejects.toThrow('quota')
    expect(storage.getItem('weijing.activeConversation')).toBe('"keep"')
    expect(await durableGet('weijing.conversations')).toEqual([{ id: 'keep' }])
  })
  it('commits serialized writes before reporting durability and exports empty collections faithfully', async () => {
    await Promise.all([durableSet('weijing.conversations', [{ id: 'first' }]), durableSet('weijing.conversations', [])])
    expect((await durableSnapshot())['weijing.conversations']).toEqual([])
    await restoreBackupData(file({ 'weijing.conversations': '[]', 'weijing.characters': '[]' }), storage)
    expect(await durableGet('weijing.conversations')).toEqual([])
  })
})
