import type { Character, RegexScript } from './characterCard'

export type RegexMode = 'display' | 'prompt'

const PRESENTATIONAL_HTML = /<(?:div|section|article|details|summary|style|table|thead|tbody|tr|td|th|span|p|h[1-6])\b/i
const STATUS_BLOCK = /<(status|[a-z][\w-]*_status)\b[^>]*>\s*([\s\S]*?)\s*<\/\1\s*>/gi
const CZW_STATUS_FIELD = /(?:^|\n)\s*(心理|动作|对顾霆深|对[^：\n]{1,24}|政治立场|情绪波动|当前目标)：/g

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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderCzwStatusCard(content: string) {
  const fields: Array<{ label: string; value: string }> = []
  const markers = Array.from(content.matchAll(CZW_STATUS_FIELD))
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index]
    const next = markers[index + 1]
    const label = marker[1]
    const value = content.slice((marker.index || 0) + marker[0].length, next?.index).trim()
    if (label && value) fields.push({ label, value })
  }
  if (!fields.length) return ''

  const fieldHtml = fields.map(({ label, value }) => {
    const wide = /^(?:心理|动作|政治立场)$/.test(label)
    return `<div class="weijing-czw-status-field${wide ? ' wide' : ''}"><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`
  }).join('')
  return `<section class="weijing-status-card weijing-status-card-czw"><header class="weijing-czw-status-header"><strong>岑知微 · 状态栏</strong><span>STATUS</span></header><div class="weijing-czw-status-fields">${fieldHtml}</div></section>`
}

/**
 * A card may provide a detailed status regex, but models occasionally return a
 * compact or incomplete status block. Leave successful card-specific
 * transformations alone, then turn any remaining block into the built-in
 * compact panel instead of letting its contents fall through as story text.
 */
function renderUnmatchedStatusBlocks(value: string) {
  return value.replace(STATUS_BLOCK, (_match, tag: string, content: string) => {
    const status = content.replace(/\n{3,}/g, '\n\n').trim() || '本轮状态等待更新。'
    if (tag.toLowerCase() === 'czw_status') return renderCzwStatusCard(status) || `<section class="weijing-status-card weijing-status-card-czw"><strong class="weijing-status-title">岑知微 · 状态栏</strong><div>${escapeHtml(status)}</div></section>`
    return `<section class="weijing-status-card"><strong class="weijing-status-title">状态更新</strong><div>${escapeHtml(status)}</div></section>`
  })
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
  // Do this only for display. Model history must retain the original compact
  // tags, while the UI should never expose a failed status block as plain text.
  if (mode === 'display') output = renderUnmatchedStatusBlocks(output)
  return output.trim()
}
