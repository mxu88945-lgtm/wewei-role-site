import { useCallback, useSyncExternalStore } from 'react'
import { durableGet, durableSet } from './persistentStore'
import { emptyPersonaState, normalizePersonaState, PERSONA_WINDOWS_KEY, type PersonaWindowState } from './personaWindow'
import type { PersonaAppearance } from './personaAppearance'

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

type AppearanceScope = { id: string; characterId: string; appearance?: PersonaAppearance }
let appearanceScope: AppearanceScope | undefined
/** Stable during streaming: the app shell only rerenders for appearance/persona changes. */
export function getPersonaAppearanceScope(characters?: readonly { id: string }[]) {
  const available = (item: PersonaWindowState['personas'][number]) => item.enabled && (!characters || characters.some((character) => character.id === item.characterId))
  const active = state.personas.find((item) => item.id === state.activeId && available(item)) || state.personas.find(available)
  if (!active) { appearanceScope = undefined; return appearanceScope }
  if (appearanceScope?.id !== active.id || appearanceScope.characterId !== active.characterId || appearanceScope.appearance !== active.appearance) appearanceScope = { id: active.id, characterId: active.characterId, appearance: active.appearance }
  return appearanceScope
}
export function usePersonaAppearanceScope(characters: readonly { id: string }[]) {
  const snapshot = useCallback(() => getPersonaAppearanceScope(characters), [characters])
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
