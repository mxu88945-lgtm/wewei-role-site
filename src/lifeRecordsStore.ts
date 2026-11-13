import { useSyncExternalStore } from 'react'
import { emptyPeriodLog, normalizePeriodLog, PERIOD_LOG_KEY, type PeriodLogState } from './periodLog'
import { emptyPeople, normalizePeople, PEOPLE_KEY, type PeopleState } from './peopleProfiles'

/**
 * v230 经期记录与人物档案：体积很小，放 localStorage（weijing.* 键会被备份自动带上）。
 * 模块级 store，人格窗口的请求在发送时直接读最新值。
 */
function createLocalStore<T>(key: string, normalize: (raw: unknown) => T, empty: () => T) {
  let state: T | null = null
  const listeners = new Set<() => void>()
  const read = (): T => {
    if (state) return state
    try { state = normalize(JSON.parse(localStorage.getItem(key) || 'null')) } catch { state = empty() }
    return state
  }
  const set = (update: (current: T) => T) => {
    const next = update(read())
    if (next === state) return
    state = next
    try { localStorage.setItem(key, JSON.stringify(next)) } catch (error) { console.error(`${key} 保存失败`, error) }
    listeners.forEach((listener) => listener())
  }
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
  // 备份恢复会整体改写 localStorage：下次读取时重新解析。
  const reset = () => { state = null; listeners.forEach((listener) => listener()) }
  return { read, set, subscribe, reset }
}

export const periodStore = createLocalStore<PeriodLogState>(PERIOD_LOG_KEY, normalizePeriodLog, emptyPeriodLog)
export const peopleStore = createLocalStore<PeopleState>(PEOPLE_KEY, normalizePeople, emptyPeople)

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === PERIOD_LOG_KEY || event.key === null) periodStore.reset()
    if (event.key === PEOPLE_KEY || event.key === null) peopleStore.reset()
  })
}

export const usePeriodLog = () => useSyncExternalStore(periodStore.subscribe, periodStore.read, periodStore.read)
export const usePeople = () => useSyncExternalStore(peopleStore.subscribe, peopleStore.read, peopleStore.read)

/** 本地日期 YYYY-MM-DD（她手机上的今天）。 */
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
