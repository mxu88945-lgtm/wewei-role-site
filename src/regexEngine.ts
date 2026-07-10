import type { Character, RegexScript } from './characterCard'

export type RegexMode = 'display' | 'prompt'

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

export function applyRegexScripts(text: string, scripts: RegexScript[], character: Character, userName: string, placement: 1 | 2, mode: RegexMode) {
  let output = applyMacros(text, character, userName)
  for (const script of scripts) {
    if (script.disabled || (script.placement.length > 0 && !script.placement.includes(placement))) continue
    if (mode === 'display' && script.promptOnly) continue
    if (mode === 'prompt' && script.markdownOnly && !script.promptOnly) continue
    try {
      const regex = parseRegex(applyMacros(script.findRegex, character, userName))
      if (!regex) continue
      output = output.replace(regex, applyMacros(script.replaceString, character, userName))
      for (const trim of script.trimStrings || []) output = output.split(applyMacros(trim, character, userName)).join('')
    } catch (error) {
      console.warn(`正则“${script.scriptName}”执行失败`, error)
    }
  }
  return output.trim()
}
