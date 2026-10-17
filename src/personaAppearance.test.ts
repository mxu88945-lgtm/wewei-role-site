import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { normalizePersonaAppearance, personaWallpaper, personaWallpaperKey, resolvePersonaAppearance, type PersonaAppearanceValues, type PersonaTheme } from './personaAppearance'
import { normalizeWallpapers, themeWallpaperKey } from './chatWallpaper'
import { addPersonaThread, emptyPersonaState, enablePersona, normalizePersonaState, updatePersona, updatePersonaThread } from './personaWindow'
import { getPersonaAppearanceScope, setPersonaState } from './personaWindowStore'
import { durableGet, durableSet } from './persistentStore'

const theme: PersonaTheme = { id: 'pearl', name: '月光珍珠', mode: 'pearl', baseColor: '#f8f7f5', textColor: '#403d42', narrationColor: '#716d74', quoteColor: '#6a5360', frost: .68 }
const defaults: PersonaAppearanceValues = { theme, fontSize: 16, uiScale: 90, uiWeight: 500, baseColor: theme.baseColor, textColor: theme.textColor, narrationColor: theme.narrationColor, quoteColor: theme.quoteColor }

describe('persona appearance isolation and persistence', () => {
  it('keeps legacy personas on app defaults and validates imported appearance values', () => {
    expect(resolvePersonaAppearance(undefined, defaults)).toEqual(defaults)
    expect(normalizePersonaAppearance({ theme: { id: 'bad', mode: 'injected' }, textColor: 'url(foo)', fontSize: NaN, uiScale: '100' })).toBeUndefined()
    expect(normalizePersonaAppearance({ fontSize: 200, uiScale: 1, uiWeight: 999, textColor: '#112233' })).toEqual({ fontSize: 22, uiScale: 80, uiWeight: 700, textColor: '#112233' })
  })

  it('restores a persona theme and text overrides across threads and durable backups, without changing the other persona', async () => {
    let state = enablePersona(enablePersona(emptyPersonaState(), 'yu'), 'gu')
    const id = state.personas[0].id
    state = updatePersona(state, id, (item) => ({ ...item, appearance: { theme, fontSize: 20, textColor: '#123456' } }))
    state = addPersonaThread(state, id)
    await durableSet('test.personaAppearance', JSON.parse(JSON.stringify(state)))
    const restored = normalizePersonaState(await durableGet('test.personaAppearance'))
    const persona = restored.personas.find((item) => item.id === id)!
    expect(persona.threads).toHaveLength(2)
    expect(persona.appearance).toEqual({ theme, fontSize: 20, textColor: '#123456' })
    expect(restored.personas.find((item) => item.id !== id)?.appearance).toBeUndefined()
    const result = resolvePersonaAppearance(persona.appearance, { ...defaults, narrationColor: '#aaaaaa' })
    expect(result.textColor).toBe('#123456')
    expect(result.narrationColor).toBe(theme.narrationColor)
    expect(defaults.fontSize).toBe(16)
  })

  it('uses theme wallpaper as read-only fallback; persona/theme wallpaper edits stay isolated and survive normalization', async () => {
    const shared = { enabled: true, source: 'image' as const, image: 'data:image/png;base64,YQ==', imageOpacity: 1, color: '#ffffff', colorOpacity: .5 }
    const key = personaWallpaperKey('yu', 'pearl')
    const wallpapers = normalizeWallpapers({ [themeWallpaperKey('pearl')]: shared, [key]: { ...shared, colorOpacity: .1 } })
    await durableSet('test.personaWallpapers', wallpapers)
    const restored = normalizeWallpapers(await durableGet('test.personaWallpapers'))
    expect(personaWallpaper(restored, 'yu', 'pearl', '#112233').colorOpacity).toBe(.1)
    expect(personaWallpaper(restored, 'gu', 'pearl', '#112233').colorOpacity).toBe(.5)
    expect(personaWallpaper(restored, 'yu', 'sage', '#112233').image).toBe('')
    expect(restored[themeWallpaperKey('pearl')]).toEqual(shared)
    delete restored[key]
    expect(personaWallpaper(restored, 'yu', 'pearl', '#112233')).toEqual(shared)
  })

  it('does not invalidate the app shell appearance snapshot for streaming text or another persona changes', () => {
    let state = enablePersona(enablePersona(emptyPersonaState(), 'gu'), 'yu')
    setPersonaState(() => state)
    const scope = getPersonaAppearanceScope()!
    const persona = state.personas.find((item) => item.id === scope.id)!
    state = updatePersonaThread(state, persona.id, persona.activeThreadId, (thread) => ({ ...thread, messages: [{ id: 1, role: 'assistant', text: '流式回复', createdAt: 1 }] }))
    setPersonaState(() => state)
    expect(getPersonaAppearanceScope()).toBe(scope)
    setPersonaState((current) => updatePersona(current, current.personas.find((item) => item.id !== scope.id)!.id, (item) => ({ ...item, appearance: { fontSize: 22 } })))
    expect(getPersonaAppearanceScope()).toBe(scope)
    setPersonaState((current) => updatePersona(current, scope.id, (item) => ({ ...item, appearance: { fontSize: 19 } })))
    expect(getPersonaAppearanceScope()).not.toBe(scope)
    expect(getPersonaAppearanceScope()?.appearance?.fontSize).toBe(19)
    expect(getPersonaAppearanceScope([{ id: 'gu' }])?.characterId).toBe('gu')
    expect(getPersonaAppearanceScope([])).toBeUndefined()
  })
})
