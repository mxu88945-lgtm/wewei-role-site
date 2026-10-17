import { useSyncExternalStore } from 'react'
import { durableGet, durableSet } from './persistentStore'
import { emptyPersonaState, normalizePersonaState, PERSONA_WINDOWS_KEY, type PersonaWindowState } from './personaWindow'

/**
 * 人格窗口的数据单独存在 IndexedDB 的 weijing.personaWindows 里（也进备份），
 * 不和 weijing.conversations 混在一起。放在模块级 store 里，离开页面时正在生成
 * 的回复仍会写回来，不会因为组件卸载丢掉。
 */
let state: PersonaWindowState = emptyPersonaState()
let hydrated = false
let hydrating: Promise<void> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((listener) => listener())

function scheduleSave(delay: number) {
  if (!hydrated) return
  if (saveTimer !== null) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void durableSet(PERSONA_WINDOWS_KEY, state).catch((error) => console.error('人格窗口保存失败', error))
  }, delay)
}

export function hydratePersonaStore() {
  if (hydrated) return Promise.resolve()
  if (!hydrating) {
    hydrating = durableGet<unknown>(PERSONA_WINDOWS_KEY)
      .then((stored) => {
        // Changes made before the database answered (unlikely) are kept on top.
        const loaded = normalizePersonaState(stored)
        state = state.personas.length ? state : loaded
      })
      .catch((error) => { console.error('人格窗口读取失败', error) })
      .finally(() => { hydrated = true; emit() })
  }
  return hydrating
}

export const isPersonaStoreHydrated = () => hydrated
export const getPersonaState = () => state

/** `busy` = streaming: batch writes instead of hitting IndexedDB on every delta. */
export function setPersonaState(update: (current: PersonaWindowState) => PersonaWindowState, busy = false) {
  const next = update(state)
  if (next === state) return
  state = next
  emit()
  scheduleSave(busy ? 900 : 120)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function usePersonaState() {
  return useSyncExternalStore(subscribe, getPersonaState, getPersonaState)
}

export function usePersonaHydrated() {
  return useSyncExternalStore(subscribe, isPersonaStoreHydrated, isPersonaStoreHydrated)
}
