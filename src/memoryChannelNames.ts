export type MemoryChannelNameMap = Record<string, string>

const STORAGE_KEY = 'weijing.memoryChannelNames'

export function readMemoryChannelNames(): MemoryChannelNameMap {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    const parsed = value ? JSON.parse(value) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as MemoryChannelNameMap : {}
  } catch {
    return {}
  }
}

export function getMemoryChannelName(scope: string) {
  return readMemoryChannelNames()[scope] || ''
}

export function saveMemoryChannelName(scope: string, value: string) {
  const names = readMemoryChannelNames()
  names[scope] = value
  localStorage.setItem(STORAGE_KEY, JSON.stringify(names))
}
