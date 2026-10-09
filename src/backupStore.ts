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

const SECRET_FIELD = 'apiKey'

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([field, child]) => [field, field === SECRET_FIELD && typeof child === 'string' ? '' : stripSecrets(child)]))
}

/** Blanks every API key so a backup file can be shared without leaking secrets. */
export function redactBackupData(data: Record<string, string>) {
  const result: Record<string, string> = {}
  for (const [key, text] of Object.entries(data)) {
    if (!text.includes(SECRET_FIELD)) { result[key] = text; continue }
    try { result[key] = JSON.stringify(stripSecrets(JSON.parse(text))) } catch { result[key] = text }
  }
  return result
}

function fillSecrets(incoming: unknown, current: unknown): unknown {
  if (Array.isArray(incoming)) {
    if (!Array.isArray(current)) return incoming
    return incoming.map((item, index) => {
      const id = item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined
      const match = id !== undefined ? current.find((candidate) => candidate && typeof candidate === 'object' && (candidate as { id?: unknown }).id === id) : current[index]
      return fillSecrets(item, match)
    })
  }
  if (!incoming || typeof incoming !== 'object' || !current || typeof current !== 'object' || Array.isArray(current)) return incoming
  const existing = current as Record<string, unknown>
  return Object.fromEntries(Object.entries(incoming as Record<string, unknown>).map(([field, child]) => {
    if (field === SECRET_FIELD && child === '' && typeof existing[field] === 'string') return [field, existing[field]]
    return [field, fillSecrets(child, existing[field])]
  }))
}

/** Keeps the API keys already on this device when a backup was exported without them. */
export function mergeExistingSecrets(data: Record<string, string>, current: Record<string, unknown>) {
  const result: Record<string, string> = {}
  for (const [key, text] of Object.entries(data)) {
    if (!text.includes(SECRET_FIELD) || !(key in current)) { result[key] = text; continue }
    try { result[key] = JSON.stringify(fillSecrets(JSON.parse(text), current[key])) } catch { result[key] = text }
  }
  return result
}

export function parseBackupText(text: string): BackupFile {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('这个文件不是惟境备份（无法读取 JSON），请选择导出的 weijing-backup-*.json 文件') }
  return parseBackup(value)
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
  const currentDurable = await durableSnapshot()
  const previous = collectLocalData(storage)
  const current: Record<string, unknown> = { ...currentDurable }
  for (const [key, text] of Object.entries(previous)) { try { current[key] = JSON.parse(text) } catch { /* not JSON */ } }
  validated.data = mergeExistingSecrets(validated.data, current)
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
