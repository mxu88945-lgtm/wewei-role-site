/**
 * v249：连续性档案整理失败记录（时间 + 原因）落到 localStorage，刷新后冷却和「上次失败」照常生效。
 * 体积很小：每条原因截到 120 字，最多留 20 个窗口，超过一天的旧记录读时丢掉。写失败（存储满）静默忽略。
 */
import type { PersonaCompressionFailure } from './personaCompressionStatus'

export const COMPRESSION_FAILURE_KEY = 'weijing.personaCompressionFailures'
export const COMPRESSION_FAILURE_LIMIT = 20
const MAX_AGE_MS = 24 * 60 * 60 * 1000

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function normalizeCompressionFailures(value: unknown, now = Date.now()): Record<string, PersonaCompressionFailure> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const rows = Object.entries(value as Record<string, unknown>).flatMap(([id, raw]) => {
    const item = raw as Partial<PersonaCompressionFailure> | null
    if (!id || !item || typeof item.at !== 'number' || !Number.isFinite(item.at) || now - item.at > MAX_AGE_MS || item.at > now + 60_000) return []
    return [[id, { at: item.at, message: typeof item.message === 'string' ? item.message.slice(0, 120) : '' }] as const]
  })
  return Object.fromEntries(rows.sort((a, b) => b[1].at - a[1].at).slice(0, COMPRESSION_FAILURE_LIMIT))
}

export function loadCompressionFailures(now = Date.now()) {
  const store = storage()
  if (!store) return {}
  try { return normalizeCompressionFailures(JSON.parse(store.getItem(COMPRESSION_FAILURE_KEY) || 'null'), now) } catch { return {} }
}

export function saveCompressionFailures(failures: Record<string, PersonaCompressionFailure>, now = Date.now()) {
  const store = storage()
  if (!store) return
  const next = normalizeCompressionFailures(failures, now)
  try {
    if (Object.keys(next).length) store.setItem(COMPRESSION_FAILURE_KEY, JSON.stringify(next))
    else store.removeItem(COMPRESSION_FAILURE_KEY)
  } catch { /* 存储满也不影响整理 */ }
}
