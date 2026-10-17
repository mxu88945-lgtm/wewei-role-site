import type { ChatWallpaper, ChatWallpapers } from './chatWallpaper'
import { normalizeWallpaper, themeWallpaperKey } from './chatWallpaper'

export type PersonaTheme = { id: string; name: string; mode: 'mist' | 'pearl' | 'sage' | 'pudding' | 'strawberry' | 'blueberry'; baseColor: string; textColor: string; narrationColor: string; quoteColor: string; frost: number }
export type PersonaAppearance = { theme?: PersonaTheme; fontSize?: number; uiScale?: number; uiWeight?: number; baseColor?: string; textColor?: string; narrationColor?: string; quoteColor?: string }
export type PersonaAppearanceValues = { theme: PersonaTheme; fontSize: number; uiScale: number; uiWeight: number; baseColor: string; textColor: string; narrationColor: string; quoteColor: string }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const validColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)

/** Only presentation data is accepted; legacy personas continue to follow app defaults. */
export function normalizePersonaAppearance(raw: unknown): PersonaAppearance | undefined {
  if (!record(raw)) return undefined
  const result: PersonaAppearance = {}
  for (const key of ['baseColor', 'textColor', 'narrationColor', 'quoteColor'] as const) if (validColor(raw[key])) result[key] = raw[key]
  for (const [key, min, max] of [['fontSize', 13, 22], ['uiScale', 80, 115], ['uiWeight', 400, 700]] as const) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = Math.round(Math.max(min, Math.min(max, value)))
  }
  const theme = raw.theme
  if (record(theme) && typeof theme.id === 'string' && theme.id.trim() && typeof theme.name === 'string' && ['mist', 'pearl', 'sage', 'pudding', 'strawberry', 'blueberry'].includes(String(theme.mode)) && validColor(theme.baseColor) && validColor(theme.textColor) && validColor(theme.narrationColor) && validColor(theme.quoteColor)) {
    result.theme = { id: theme.id.slice(0, 160), name: theme.name.slice(0, 80), mode: theme.mode as PersonaTheme['mode'], baseColor: theme.baseColor, textColor: theme.textColor, narrationColor: theme.narrationColor, quoteColor: theme.quoteColor, frost: typeof theme.frost === 'number' && Number.isFinite(theme.frost) ? Math.max(0, Math.min(1, theme.frost)) : .72 }
  }
  return Object.keys(result).length ? result : undefined
}

export function resolvePersonaAppearance(appearance: PersonaAppearance | undefined, defaults: PersonaAppearanceValues): PersonaAppearanceValues {
  const theme = appearance?.theme || defaults.theme
  return { theme, fontSize: appearance?.fontSize ?? defaults.fontSize, uiScale: appearance?.uiScale ?? defaults.uiScale, uiWeight: appearance?.uiWeight ?? defaults.uiWeight, baseColor: appearance?.baseColor ?? (appearance?.theme ? theme.baseColor : defaults.baseColor), textColor: appearance?.textColor ?? (appearance?.theme ? theme.textColor : defaults.textColor), narrationColor: appearance?.narrationColor ?? (appearance?.theme ? theme.narrationColor : defaults.narrationColor), quoteColor: appearance?.quoteColor ?? (appearance?.theme ? theme.quoteColor : defaults.quoteColor) }
}

export const personaWallpaperKey = (personaId: string, themeId: string) => `persona:${personaId}:theme:${themeId || 'default'}`
/** Shared theme wallpapers are read-only defaults; edits get their own persona key. */
export function personaWallpaper(wallpapers: ChatWallpapers, personaId: string, themeId: string, baseColor: string): ChatWallpaper {
  return normalizeWallpaper(wallpapers[personaWallpaperKey(personaId, themeId)] ?? (themeId ? wallpapers[themeWallpaperKey(themeId)] : undefined), baseColor)
}
