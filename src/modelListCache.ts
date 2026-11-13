/**
 * v229：按渠道记住「获取模型」拿到的模型列表（主聊天成员绑定、API 渠道页、人格窗口共用一份）。
 * 以及人格窗口里每个人格在每个渠道上最后选的模型，切回渠道时自动带回。
 * 全部写 localStorage，写失败（iOS 存储满）静默忽略，不影响界面。
 */
import type { ApiModel } from './chatApi'

export const MODEL_LIST_CACHE_KEY = 'weijing.modelListCache'
export const MODEL_PICK_KEY = 'weijing.personaModelPicks'
/** 每个渠道最多缓存这么多模型，防止个别中转返回上千个把存储撑满。 */
export const MODEL_LIST_CACHE_LIMIT = 800

type CacheEntry = { models: ApiModel[]; savedAt: number }
type CacheMap = Record<string, CacheEntry>
type PickMap = Record<string, Record<string, string>>

function storage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

function readJson<T extends object>(key: string): T {
  const store = storage()
  if (!store) return {} as T
  try {
    const raw = store.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : {} as T
  } catch { return {} as T }
}

function writeJson(key: string, value: unknown) {
  try { storage()?.setItem(key, JSON.stringify(value)) } catch { /* 存储满：放弃缓存 */ }
}

function cleanModels(models: unknown): ApiModel[] {
  if (!Array.isArray(models)) return []
  const seen = new Set<string>()
  const out: ApiModel[] = []
  for (const item of models) {
    const id = item && typeof item === 'object' && typeof (item as ApiModel).id === 'string' ? (item as ApiModel).id.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    const ownedBy = (item as ApiModel).ownedBy
    out.push(typeof ownedBy === 'string' && ownedBy ? { id, ownedBy } : { id })
    if (out.length >= MODEL_LIST_CACHE_LIMIT) break
  }
  return out
}

/** 某个渠道上次获取到的模型列表；没有就返回空数组。 */
export function readCachedModels(channelId: string | undefined): ApiModel[] {
  if (!channelId) return []
  return cleanModels(readJson<CacheMap>(MODEL_LIST_CACHE_KEY)[channelId]?.models)
}

/** 获取成功后写入。空列表不覆盖旧缓存（接口偶尔返回空）。 */
export function saveCachedModels(channelId: string | undefined, models: ApiModel[], now = Date.now()) {
  if (!channelId) return
  const clean = cleanModels(models)
  if (!clean.length) return
  const map = readJson<CacheMap>(MODEL_LIST_CACHE_KEY)
  map[channelId] = { models: clean, savedAt: now }
  writeJson(MODEL_LIST_CACHE_KEY, map)
}

/** 某个人格（或其他作用域）在某渠道上最后选定的模型。 */
export function readPickedModel(scope: string | undefined, channelId: string | undefined): string | undefined {
  if (!scope || !channelId) return undefined
  const value = readJson<PickMap>(MODEL_PICK_KEY)[scope]?.[channelId]
  return typeof value === 'string' && value.trim() ? value : undefined
}

export function savePickedModel(scope: string | undefined, channelId: string | undefined, modelName: string | undefined) {
  if (!scope || !channelId) return
  const map = readJson<PickMap>(MODEL_PICK_KEY)
  const current = { ...(map[scope] && typeof map[scope] === 'object' ? map[scope] : {}) }
  const name = modelName?.trim()
  if (name) current[channelId] = name
  else delete current[channelId]
  map[scope] = current
  writeJson(MODEL_PICK_KEY, map)
}
