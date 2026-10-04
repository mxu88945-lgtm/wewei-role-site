import { durableSnapshot, replaceDurableSnapshot } from './persistentStore'

export const DURABLE_KEYS = new Set(['weijing.characters', 'weijing.conversations', 'weijing.identities', 'weijing.identity', 'weijing.memoryConfigs', 'weijing.memoryEntries', 'weijing.chatBackground', 'weijing.chatWallpapers', 'weijing.globalMemoryApi', 'weijing.storyProjects', 'weijing.plotTemplates'])
export type BackupFile = { format: 'weijing-backup'; version: 1; createdAt: string; data: Record<string, string> }

export function collectLocalData(storage: Storage = localStorage) {
  const data: Record<string, string> = {}
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (key?.startsWith('weijing.')) {
      const value = storage.getItem(key)
      if (value !== null) data[key] = value
    }
  }
  return data
}

export async function collectBackupData(live: Record<string, unknown> = {}, storage: Storage = localStorage) {
  const data = collectLocalData(storage)
  // Failure to read the real database must not silently produce an incomplete backup.
  const durable = await durableSnapshot()
  for (const [key, value] of Object.entries(durable)) {
    if (DURABLE_KEYS.has(key) || !(key in data)) data[key] = JSON.stringify(value)
  }
  for (const [key, value] of Object.entries(live)) if (key.startsWith('weijing.')) data[key] = JSON.stringify(value)
  return data
}

export function parseBackup(value: unknown): BackupFile {
  if (!value || typeof value !== 'object') throw new Error('不是有效的惟境备份文件')
  const file = value as Partial<BackupFile>
  if (file.format !== 'weijing-backup' || file.version !== 1 || !file.data || typeof file.data !== 'object' || Array.isArray(file.data)) throw new Error('不是有效的惟境备份文件')
  const entries = Object.entries(file.data)
  if (!entries.length || entries.some(([key, text]) => !key.startsWith('weijing.') || typeof text !== 'string')) throw new Error('备份数据格式不正确')
  for (const [key, text] of entries) {
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { if (DURABLE_KEYS.has(key)) throw new Error(`备份数据无法读取：${key}`); continue }
    if (['weijing.characters', 'weijing.conversations', 'weijing.identities', 'weijing.storyProjects', 'weijing.plotTemplates'].includes(key) && !Array.isArray(parsed)) throw new Error(`备份列表格式不正确：${key}`)
    if (['weijing.memoryEntries', 'weijing.memoryConfigs'].includes(key) && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error(`备份记忆格式不正确：${key}`)
    if (key === 'weijing.chatWallpapers' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error('备份壁纸格式不正确')
  }
  return { format: 'weijing-backup', version: 1, createdAt: file.createdAt || '', data: Object.fromEntries(entries) }
}

export async function restoreBackupData(file: BackupFile, storage: Storage = localStorage) {
  const validated = parseBackup(file)
  // Drain earlier writes before changing either store.
  await durableSnapshot()
  const previous = collectLocalData(storage)
  const durable = Object.fromEntries(Object.entries(validated.data).filter(([key]) => DURABLE_KEYS.has(key)).map(([key, text]) => [key, JSON.parse(text)]))
  try {
    Object.keys(previous).forEach((key) => storage.removeItem(key))
    for (const [key, value] of Object.entries(validated.data)) if (!DURABLE_KEYS.has(key)) storage.setItem(key, value)
    await replaceDurableSnapshot(durable)
  } catch (error) {
    Object.keys(collectLocalData(storage)).forEach((key) => storage.removeItem(key))
    Object.entries(previous).forEach(([key, value]) => storage.setItem(key, value))
    throw error
  }
}
