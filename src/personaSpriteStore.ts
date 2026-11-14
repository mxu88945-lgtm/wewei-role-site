import { useSyncExternalStore } from 'react'
import { normalizeSpriteState, PERSONA_SPRITE_KEY, type PersonaSpritePrefs, type PersonaSpriteState } from './personaSprite'

/** v239 立绘设置：每个人格一份（开关、出现方式、位置、是否隐身），存 localStorage，weijing.* 会被备份带上。 */
let state: PersonaSpriteState | null = null
const listeners = new Set<() => void>()

export function readSpriteState(): PersonaSpriteState {
  if (state) return state
  try { state = normalizeSpriteState(JSON.parse(localStorage.getItem(PERSONA_SPRITE_KEY) || 'null')) } catch { state = {} }
  return state
}

export function setSpritePrefs(personaId: string, update: (current: PersonaSpritePrefs) => PersonaSpritePrefs) {
  if (!personaId) return
  const current = readSpriteState()
  const next = { ...current, [personaId]: update(current[personaId] || {}) }
  state = next
  try { localStorage.setItem(PERSONA_SPRITE_KEY, JSON.stringify(next)) } catch (error) { console.error('立绘设置保存失败', error) }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === PERSONA_SPRITE_KEY || event.key === null) { state = null; listeners.forEach((listener) => listener()) }
  })
}

export const useSpriteState = () => useSyncExternalStore(subscribe, readSpriteState, readSpriteState)
