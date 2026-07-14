import type { Character, RegexScript } from './characterCard'

export type RegexMode = 'display' | 'prompt'

const PRESENTATIONAL_HTML = /<(?:div|section|article|details|summary|style|table|thead|tbody|tr|td|th|span|p|h[1-6])\b/i

function containsPresentationalHtml(value: string) {
  return PRESENTATIONAL_HTML.test(value)
}

function parseRegex(source: string) {
  const trimmed = source.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('/')) {
    const lastSlash = trimmed.lastIndexOf('/')
    if (lastSlash > 0) {
      const pattern = trimmed.slice(1, lastSlash)
      const flags = trimmed.slice(lastSlash + 1) || 'g'
      return new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`)
    }
  }
  return new RegExp(trimmed, 'g')
}

export function applyMacros(value: string, character: Character, userName: string) {
  return value
    .split('{{char}}').join(character.name)
    .split('{{user}}').join(userName)
}

function wrapsWholeMessage(regex: RegExp) {
  const sentinel = '__WEIJING_MESSAGE__\nSECOND_LINE'
  regex.lastIndex = 0
  const match = regex.exec(sentinel)
  regex.lastIndex = 0
  return match?.index === 0 && match[0] === sentinel
}

function usesNativeChatBubble(script: RegexScript) {
  return script.id === 'pei-chengyan-story-card' || script.id === 'pei-director-story-card'
}

export function stripPresentationalHtmlForPrompt(value: string) {
  if (!containsPresentationalHtml(value)) return value

  return value
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|section|article|details|summary|table|tr|p|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function applyRegexScripts(text: string, scripts: RegexScript[], character: Character, userName: string, placement: 1 | 2, mode: RegexMode) {
  let output = applyMacros(text, character, userName)
  const sourceHasPresentationalHtml = containsPresentationalHtml(output)
  for (const script of scripts) {
    if (script.disabled || (script.placement.length > 0 && !script.placement.includes(placement))) continue
    if (mode === 'display' && script.promptOnly) continue
    if (mode === 'prompt' && script.markdownOnly && !script.promptOnly) continue
    const replacement = applyMacros(script.replaceString, character, userName)
    // Display-card HTML belongs to the renderer, never in model history. Let
    // explicit prompt-only rules through even if they intentionally use HTML.
    if (mode === 'prompt' && !script.promptOnly && containsPresentationalHtml(replacement)) continue
    try {
      const regex = parseRegex(applyMacros(script.findRegex, character, userName))
      if (!regex) continue
      // These built-in cards used to paint a second full-message bubble inside
      // the app's own chat bubble. Keep their scene/status panels, but let the
      // chat layout own the single outer shell.
      if (mode === 'display' && usesNativeChatBubble(script) && wrapsWholeMessage(regex)) continue
      // Some imported cards wrap the entire reply. If an older model response
      // already contains a rendered shell, adding another one creates the
      // ever-growing nested bubbles seen in group chat.
      if (mode === 'display' && sourceHasPresentationalHtml && containsPresentationalHtml(replacement) && wrapsWholeMessage(regex)) continue
      output = output.replace(regex, replacement)
      for (const trim of script.trimStrings || []) output = output.split(applyMacros(trim, character, userName)).join('')
    } catch (error) {
      console.warn(`正则“${script.scriptName}”执行失败`, error)
    }
  }
  return output.trim()
}
