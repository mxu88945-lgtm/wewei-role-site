import type { Character } from './characterCard'
import { detectStatusTag, extractStatusFields, isStatusPlaceholder, type StatusFieldValue } from './outputSanitizer'

const DEFAULT_STATUS_FIELDS = ['状态', '关系', '待回应']

export type StatusProtocol = {
  tag: string
  fields: string[]
}

export type StatusFallback = {
  tag: string
  content: string
  fields: StatusFieldValue[]
}

type StatusHistoryMessage = { role: 'user' | 'assistant'; text: string; characterId?: string }

function statusSources(character: Character) {
  return [
    character.greeting,
    ...character.alternateGreetings,
    character.beautificationProtocol || '',
    character.systemPrompt,
    character.postHistoryInstructions,
    character.mesExample,
    ...(character.characterBook?.entries || []).map((entry) => entry.content),
    ...character.regexScripts.map((script) => script.findRegex),
  ].filter(Boolean)
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function statusSamples(sources: string[], tag: string) {
  if (!tag) return []
  const escapedTag = escapeRegex(tag)
  const pattern = new RegExp(`<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}\\s*>`, 'gi')
  return sources.flatMap((source) => Array.from(source.matchAll(pattern), (match) => match[1] || ''))
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

/** Discover the exact status tag and field order defined by a character card. */
export function getStatusProtocol(character: Character): StatusProtocol {
  const sources = statusSources(character)
  const tag = detectStatusTag(...sources)
  if (!tag) return { tag: '', fields: [] }
  const fieldCandidates = statusSamples(sources, tag)
    .map((sample) => unique(extractStatusFields(sample).map((field) => field.label)))
    .filter((candidate) => candidate.length > 0)
  const fields = fieldCandidates.reduce<string[]>((best, candidate) => candidate.length > best.length ? candidate : best, [])
  return { tag, fields }
}

function sceneValues(output: string) {
  const scene = /<(?:scene|plot)\b[^>]*>([\s\S]*?)<\/(?:scene|plot)\s*>/i.exec(output)?.[1] || ''
  const time = /(?:⏰|🕰️)?\s*时间\s*[：:]\s*([^\n|｜]+)/i.exec(scene)?.[1]?.trim() || ''
  const location = /(?:🏙️|🗺️)?\s*地点\s*[：:]\s*([^\n|｜]+)/i.exec(scene)?.[1]?.trim() || ''
  return { time, location }
}

function statusTemplateValues(character: Character, tag: string) {
  const samples = statusSamples(statusSources(character), tag).map((sample) => extractStatusFields(sample))
  return samples.reduce<StatusFieldValue[]>((best, current) => current.length > best.length ? current : best, [])
}

function storySentences(output: string) {
  const visible = output
    .replace(/<(?:status|[a-z][\w-]*_status)\b[^>]*>[\s\S]*?<\/(?:status|[a-z][\w-]*_status)\s*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return visible.split(/(?<=[。！？!?])\s*/u).map((item) => item.trim()).filter((item) => item.length >= 8)
}

function storyValue(label: string, output: string, characterName: string, userName: string) {
  const sentences = storySentences(output)
  const matchers: RegExp[] = [/联姻|婚约|未婚|恋人|关系|合作|盟友|疏远/u]
  if (/认知|已知|线索|救命恩人/u.test(label)) matchers.unshift(/得知|知道|发现|认出|线索|救命|恩人|怀疑|确认/u)
  if (/公开责任|事件|任务|目标/u.test(label)) matchers.unshift(/负责|协议|项目|签约|晚宴|宴会|会议|发布|安排|处理/u)
  if (/私人立场|想法|态度|心理/u.test(label)) matchers.unshift(/不(?:会|再|想)|仍(?:然)?|决定|愿意|在意|拒绝|默许/u)
  const sentence = sentences.find((item) => matchers.some((matcher) => matcher.test(item)))
    || sentences.find((item) => item.includes(userName) || item.includes(characterName))
    || sentences[0]
  return sentence ? sentence.slice(0, 96) : ''
}

function valueForField(label: string, characterName: string, userName: string, previous: Map<string, string>, template: Map<string, string>, scene: ReturnType<typeof sceneValues>, output: string) {
  const oldValue = previous.get(label)
  const templateValue = template.get(label)
  const carriedValue = oldValue && !isStatusPlaceholder(oldValue) ? oldValue : templateValue && !isStatusPlaceholder(templateValue) ? templateValue : ''
  if (/^待回应$/.test(label)) return `等待${userName}回应`
  if (/^状态$/.test(label)) return `${characterName}已完成本轮回应`
  if (/^(?:时间|当前时间)$/.test(label)) return scene.time || carriedValue || storyValue(label, output, characterName, userName)
  if (/^(?:地点|当前地点)$/.test(label)) return scene.location || carriedValue || storyValue(label, output, characterName, userName)
  return carriedValue || storyValue(label, output, characterName, userName) || `${characterName}正在等待${userName}回应`
}

/** Return the newest complete status content for a speaker in conversation history. */
export function latestStatusContent(messages: StatusHistoryMessage[], tag: string, characterId?: string) {
  if (!tag) return ''
  const escapedTag = escapeRegex(tag)
  const pattern = new RegExp(`<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}\\s*>`, 'gi')
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant') continue
    if (characterId && message.characterId && message.characterId !== characterId) continue
    const matches = Array.from(message.text.matchAll(pattern))
    const content = matches[matches.length - 1]?.[1]?.trim()
    if (content) return content
  }
  return ''
}

/** Build a full, card-shaped fallback without inventing facts beyond prior UI state. */
export function buildStatusFallback(character: Character, userName: string, options: { output?: string; previousStatusContent?: string } = {}): StatusFallback {
  const protocol = getStatusProtocol(character)
  const fields = protocol.fields.length ? protocol.fields : DEFAULT_STATUS_FIELDS
  const previous = new Map<string, string>()
  for (const field of extractStatusFields(options.previousStatusContent || '')) previous.set(field.label, field.value)
  const template = new Map<string, string>()
  for (const field of statusTemplateValues(character, protocol.tag)) template.set(field.label, field.value)
  const scene = sceneValues(options.output || '')
  const fallbackFields = fields.map((label) => ({ label, value: valueForField(label, character.name, userName, previous, template, scene, options.output || '') }))
  return {
    tag: protocol.tag,
    fields: fallbackFields,
    content: fallbackFields.map((field) => `${field.label}：${field.value}`).join('｜'),
  }
}
