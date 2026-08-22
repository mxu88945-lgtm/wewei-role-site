import type { RegexScript } from './characterCard'

const LIGHT_NEUTRAL_COLORS = new Set([
  'white', '#fff', '#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#d1d5db',
  '#e5e7eb', '#f3f4f6', '#f9fafb', '#94a3b8', 'rgb(255,255,255)', 'rgba(255,255,255,1)',
])

const randomId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `regex-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function rgbFromToken(value: string) {
  const normalized = value.trim().toLowerCase()
  const hex = normalized.match(/^#([\da-f]{3,8})$/i)
  if (hex) {
    const raw = hex[1]
    if (raw.length !== 3 && raw.length !== 4 && raw.length !== 6 && raw.length !== 8) return null
    const expanded = raw.length === 3 || raw.length === 4 ? raw.slice(0, 3).split('').map((item) => item + item).join('') : raw.slice(0, 6)
    return [parseInt(expanded.slice(0, 2), 16), parseInt(expanded.slice(2, 4), 16), parseInt(expanded.slice(4, 6), 16)] as const
  }
  const rgb = normalized.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
  if (!rgb) return null
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] as const
}

function luminance([red, green, blue]: readonly [number, number, number]) {
  return (red * 299 + green * 587 + blue * 114) / 1000
}

function hasDarkSurface(declarations: string) {
  const backgrounds = declarations.match(/(?:^|[;{])\s*background(?:-color)?\s*:\s*[^;}]*/gi) || []
  return backgrounds.some((background) => {
    const value = background.replace(/^[\s\S]*?background(?:-color)?\s*:\s*/i, '').trim()
    if (/^(?:transparent|none)$/i.test(value)) return false
    const colors = value.match(/#[\da-f]{3,8}|rgba?\([^)]*\)/gi) || []
    if (!colors.length) return true
    return colors.some((color) => {
      const rgb = rgbFromToken(color)
      return rgb ? luminance(rgb) < 170 : false
    })
  })
}

function isLightNeutralColor(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '')
  if (LIGHT_NEUTRAL_COLORS.has(normalized)) return true
  const rgb = rgbFromToken(normalized)
  if (!rgb) return false
  const max = Math.max(...rgb)
  const min = Math.min(...rgb)
  return luminance(rgb) >= 190 && max - min <= 55
}

function normalizeLayoutDeclarations(value: string) {
  const hadViewportPosition = /\bposition\s*:\s*(?:fixed|sticky)\b/i.test(value)
  let output = value
    .replace(/(\bposition\s*:\s*)(?:fixed|sticky)\b/gi, '$1relative')
    .replace(/(\b(?:height|min-height|max-height)\s*:\s*)[^;{}]*(?:100dvh|100vh|100svh|100lvh)[^;{}]*/gi, (_match, prefix: string) => {
      const property = prefix.split(':')[0].trim().toLowerCase()
      return `${prefix}${property === 'min-height' ? '0' : property === 'max-height' ? 'none' : 'auto'}`
    })
    .replace(/(\btouch-action\s*:\s*)none\b/gi, '$1pan-y')

  if (hadViewportPosition) output = output.replace(/\b(?:inset|top|right|bottom|left)\s*:\s*[^;{}]+;?/gi, '')
  return output
}

function normalizeStyleDeclarations(value: string) {
  const output = normalizeLayoutDeclarations(value)
  if (hasDarkSurface(output)) return output

  return output.replace(/(^|[;{])(\s*color\s*:\s*)([^;{}]+)/gi, (match, start: string, prefix: string, rawValue: string) => {
    const important = /!important\s*$/i.test(rawValue)
    const color = rawValue.replace(/!important\s*$/i, '').trim()
    if (!isLightNeutralColor(color)) return match
    return `${start}${prefix}var(--chat-text-color, #000000)${important ? ' !important' : ''}`
  })
}

function normalizeStyleBlock(css: string) {
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (_match, selector: string, declarations: string) => `${selector}{${normalizeStyleDeclarations(declarations)}}`)
}

/**
 * Generated/imported cards can carry a full HTML replacement template. Keep
 * visual styles, but make generic story text follow the app's text color and
 * remove the layout/script traps that previously locked the chat page.
 */
export function normalizeRegexPresentation(value: string) {
  return value
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/<object\b[\s\S]*?<\/object\s*>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(["'])[^"']*\1/gi, '')
    .replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi, (_match, quote: string, declarations: string) => `style=${quote}${normalizeStyleDeclarations(declarations)}${quote}`)
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (_match, opening: string, css: string, closing: string) => `${opening}${normalizeStyleBlock(css)}${closing}`)
}

export function normalizeRegexPlacement(value: unknown, fallback: number[] = [2]) {
  const raw = Array.isArray(value)
    ? value.map((item) => Number(item)).filter(Number.isFinite)
    : []
  if (raw.includes(3) && !raw.includes(2)) return [2]
  const valid = [...new Set(raw.filter((item) => item === 1 || item === 2))]
  return valid.length ? valid : fallback
}

export function normalizeRegexScript(value: unknown): RegexScript {
  const source = value && typeof value === 'object' ? value as Partial<RegexScript> : {}
  return {
    ...source,
    id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : randomId(),
    scriptName: typeof source.scriptName === 'string' && source.scriptName.trim() ? source.scriptName.trim() : '新 UI 美化',
    findRegex: typeof source.findRegex === 'string' ? source.findRegex.trim() : '',
    replaceString: typeof source.replaceString === 'string' ? normalizeRegexPresentation(source.replaceString.trim()) : '',
    trimStrings: Array.isArray(source.trimStrings) ? source.trimStrings.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [],
    placement: normalizeRegexPlacement(source.placement),
    disabled: source.disabled === true,
    markdownOnly: source.markdownOnly === true,
    promptOnly: source.promptOnly === true,
    runOnEdit: source.runOnEdit !== false,
    substituteRegex: Number.isFinite(Number(source.substituteRegex)) ? Number(source.substituteRegex) : 0,
    minDepth: source.minDepth == null ? null : Number(source.minDepth),
    maxDepth: source.maxDepth == null ? null : Number(source.maxDepth),
  }
}
