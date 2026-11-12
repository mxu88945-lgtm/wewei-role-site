import type { ChatWallpaper, ChatWallpapers } from './chatWallpaper'
import { normalizeWallpaper, themeWallpaperKey } from './chatWallpaper'

export type PersonaTheme = { id: string; name: string; mode: 'mist' | 'pearl' | 'sage' | 'pudding' | 'strawberry' | 'blueberry' | 'liquid' | 'paper' | 'scrapbook' | 'academy' | 'vinyl' | 'mobile' | 'letter' | 'mistnote' | 'nightglow' | 'warmtea'; baseColor: string; textColor: string; narrationColor: string; quoteColor: string; frost: number }
export type PersonaAppearance = { theme?: PersonaTheme; fontSize?: number; uiScale?: number; uiWeight?: number; baseColor?: string; textColor?: string; narrationColor?: string; quoteColor?: string }
export type PersonaAppearanceValues = { theme: PersonaTheme; fontSize: number; uiScale: number; uiWeight: number; baseColor: string; textColor: string; narrationColor: string; quoteColor: string }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const validColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)

export const CHAT_FONT_MIN = 13
export const CHAT_FONT_MAX = 22
export const CHAT_FONT_STEP = .5
/** v227：聊天正文字号按 0.5px 一档（14、14.5、15…），超范围夹回 13–22；旧的整数值原样有效。 */
export function normalizeChatFontSize(value: unknown, fallback = 16): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  if (!Number.isFinite(number)) return fallback
  return Math.round(Math.max(CHAT_FONT_MIN, Math.min(CHAT_FONT_MAX, number)) / CHAT_FONT_STEP) * CHAT_FONT_STEP
}
/** 显示用：14 → 14px，14.5 → 14.5px。 */
export const formatChatFontSize = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)}px`

/** Only presentation data is accepted; legacy personas continue to follow app defaults. */
export function normalizePersonaAppearance(raw: unknown): PersonaAppearance | undefined {
  if (!record(raw)) return undefined
  const result: PersonaAppearance = {}
  for (const key of ['baseColor', 'textColor', 'narrationColor', 'quoteColor'] as const) if (validColor(raw[key])) result[key] = raw[key]
  if (typeof raw.fontSize === 'number' && Number.isFinite(raw.fontSize)) result.fontSize = normalizeChatFontSize(raw.fontSize)
  for (const [key, min, max] of [['uiScale', 80, 115], ['uiWeight', 400, 700]] as const) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = Math.round(Math.max(min, Math.min(max, value)))
  }
  const theme = raw.theme
  if (record(theme) && typeof theme.id === 'string' && theme.id.trim() && typeof theme.name === 'string' && ['mist', 'pearl', 'sage', 'pudding', 'strawberry', 'blueberry', 'liquid', 'paper', 'scrapbook', 'academy', 'vinyl', 'mobile', 'letter', 'mistnote', 'nightglow', 'warmtea'].includes(String(theme.mode)) && validColor(theme.baseColor) && validColor(theme.textColor) && validColor(theme.narrationColor) && validColor(theme.quoteColor)) {
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
