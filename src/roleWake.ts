export type RoleWakeConfig = { enabled: boolean; url: string; key: string }
export type RoleWakeMessage = { id: string; text: string; ts?: number }
export type RoleWakeSyncInput = { roleId: string; roleName: string; personaSummary: string; recentSummary: string; lastChatAt: number; pushDevice?: string; pushUrl?: string }

// Deliberately not prefixed with `weijing.`: backupStore treats that prefix as durable user data.
const ENABLED_KEY = 'roleWake.enabled'
const URL_KEY = 'roleWake.url'
const KEY_KEY = 'roleWake.key'
const SEEN_KEY = 'roleWake.seen'
const storage = () => { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }

export function readRoleWakeConfig(): RoleWakeConfig {
  const store = storage()
  return { enabled: store?.getItem(ENABLED_KEY) === '1', url: (store?.getItem(URL_KEY) || '').trim().replace(/\/+$/, ''), key: store?.getItem(KEY_KEY) || '' }
}
export function writeRoleWakeConfig(config: RoleWakeConfig) {
  const store = storage(); if (!store) return
  try { store.setItem(ENABLED_KEY, config.enabled ? '1' : '0'); store.setItem(URL_KEY, config.url.trim().replace(/\/+$/, '')); store.setItem(KEY_KEY, config.key) } catch { /* 配额不足不影响聊天 */ }
}
export function roleWakeReady(config = readRoleWakeConfig()) { return config.enabled && /^https:\/\//i.test(config.url) && Boolean(config.key) }
const headers = (config: RoleWakeConfig) => ({ Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' })
const seenIds = () => { try { const value = JSON.parse(storage()?.getItem(SEEN_KEY) || '[]'); return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(-120) : []) } catch { return new Set<string>() } }
const saveSeenIds = (seen: Set<string>) => { try { storage()?.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-120))) } catch { /* ignore */ } }

export async function syncRoleWake(input: RoleWakeSyncInput, config = readRoleWakeConfig()): Promise<boolean> {
  if (!roleWakeReady(config)) return false
  try {
    const { pushDevice, pushUrl, ...base } = input
    const push = pushDevice?.trim() ? { pushDevice: pushDevice.trim(), pushUrl: pushUrl?.trim() || '' } : {}
    const response = await fetch(`${config.url}/sync`, { method: 'POST', headers: headers(config), body: JSON.stringify({ ...base, ...push, personaSummary: input.personaSummary.slice(0, 6000), recentSummary: input.recentSummary.slice(0, 1800) }) })
    return response.ok
  } catch { return false }
}
export async function pullRoleWakeInbox(roleId: string, config = readRoleWakeConfig()): Promise<RoleWakeMessage[]> {
  if (!roleWakeReady(config)) return []
  try {
    const response = await fetch(`${config.url}/inbox?roleId=${encodeURIComponent(roleId)}`, { headers: { Authorization: `Bearer ${config.key}` } })
    if (!response.ok) return []
    const body = await response.json() as { messages?: RoleWakeMessage[] }
    const seen = seenIds(); const fresh: RoleWakeMessage[] = []
    for (const item of Array.isArray(body.messages) ? body.messages : []) {
      if (!item?.id || !String(item.text || '').trim() || seen.has(item.id)) continue
      seen.add(item.id); fresh.push({ id: item.id, text: String(item.text).trim(), ts: item.ts })
    }
    saveSeenIds(seen)
    return fresh
  } catch { return [] }
}
export function roleWakeRecentSummary(messages: Array<{ role: string; text?: string }>) {
  return messages.slice(-8).map((message) => `${message.role === 'user' ? '她' : '他'}：${String(message.text || '').replace(/\s+/g, ' ').trim().slice(0, 220)}`).join('\n').slice(0, 1800)
}
