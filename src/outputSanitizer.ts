const STATUS_INSTRUCTION_MARKER = /(?:#\s*)?注意[:：]?\s*(?:非常重要[！!]?|请严格按照以上格式输出)|必须在每次输出后回复的末尾|参考状态栏输出状态栏|状态栏格式要求如上|请严格遵守以上格式|禁止缺少任何符号\s*[（(]包括空格与换行|(?:获得|倒扣)\s*\d+w?\s*美元.*赛博小费/i
const STORY_START = /(?:<plot>\s*)?(?:```\s*)?(?:⏰|🕰️)\s*时间/i
const STRONG_DIRECTOR_REASONING_MARKER = /controlled by the user|narrator\s*\/\s*director|side characters? and (?:the )?environment|(?:current|character|situation) analysis|internal (?:analysis|reasoning)|chain of thought|(?:we need|let(?:'s| us)) (?:to )?(?:analy[sz]e|reason|plan)/i
const WEAK_DIRECTOR_REASONING_MARKERS = [
  /(?:desperate|calm|angry|conflicted|calculating) but (?:calculating|controlled|determined|cautious)/i,
  /is likely (?:monitoring|planning|trying)/i,
  /has just (?:finished|received|left|arrived)/i,
]
const HIDDEN_BLOCK = /<(think(?:ing)?|analysis|reasoning)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const OPEN_HIDDEN_BLOCK = /<(?:think(?:ing)?|analysis|reasoning)\b[^>]*>[\s\S]*$/i
const STATUS_TAG_PATTERN = '(?:status|[a-z][\\w-]*_status)'
const STATUS_TAG_NAME = new RegExp(`^${STATUS_TAG_PATTERN}$`, 'i')
const STATUS_OPENING = new RegExp(`<(${STATUS_TAG_PATTERN})\\b[^>]*>`, 'i')
const STATUS_FIELD_MARKER = /(?:^|[\n｜|；;])\s*([^：:\n｜|；;<>{}]{1,40}?)\s*[：:]\s*/g
const STATUS_WRAPPER = new RegExp(`<\\/?${STATUS_TAG_PATTERN}\\b[^>]*>`, 'gi')
const COMPLETE_STATUS_BLOCK = new RegExp(`<(${STATUS_TAG_PATTERN})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi')
const OPEN_OR_PARTIAL_STATUS_BLOCK = new RegExp(`<(${STATUS_TAG_PATTERN})\\b[^>]*>[\\s\\S]*?(?:<\\/\\1\\s*>|$)`, 'gi')

export type StatusFieldValue = { label: string; value: string }

/** Values that look complete but communicate no state are treated as omissions. */
export function isStatusPlaceholder(value: string) {
  return /^(?:本轮未更新|以(?:本轮)?正文明确内容为准|延续当前剧情|当前剧情(?:继续|延续)?|暂无(?:更新|变化)?|未更新|待定)$/u.test(value.trim())
}

function stripTaggedReasoning(value: string) {
  return value
    .replace(HIDDEN_BLOCK, '')
    .replace(/```(?:analysis|reasoning|thinking)\s*[\s\S]*?```/gi, '')
    .replace(OPEN_HIDDEN_BLOCK, '')
    .trimStart()
}

function directorStoryStart(value: string) {
  const scene = /<(?:scene|plot)\b/i.exec(value)
  if (scene) return scene.index
  const labelledFinal = /(?:^|\n)\s*(?:最终(?:正文|输出)|正文|final(?: answer| response)?|response)\s*[:：]\s*/i.exec(value)
  if (labelledFinal) return labelledFinal.index + labelledFinal[0].length

  let offset = 0
  for (const line of value.split('\n')) {
    const cjkCount = (line.match(/[\u3400-\u9fff]/g) || []).length
    if (cjkCount >= 4) return offset + line.search(/\S|$/)
    offset += line.length + 1
  }
  return -1
}

function looksLikeDirectorReasoning(value: string) {
  const opening = value.slice(0, 2600)
  if (STRONG_DIRECTOR_REASONING_MARKER.test(opening)) return true
  return WEAK_DIRECTOR_REASONING_MARKERS.filter((marker) => marker.test(opening)).length >= 2
}

export function containsHiddenReasoning(value: string, director = false) {
  return /<(?:think(?:ing)?|analysis|reasoning)\b|```(?:analysis|reasoning|thinking)/i.test(value)
    || (director && looksLikeDirectorReasoning(value))
}

export function sanitizeAssistantOutput(value: string, options: { director?: boolean } = {}) {
  let output = stripTaggedReasoning(value)
  const opening = output.slice(0, 2600)
  if (options.director && looksLikeDirectorReasoning(opening)) {
    const start = directorStoryStart(output)
    output = start >= 0 ? output.slice(start).trimStart() : ''
  }
  if (!STATUS_INSTRUCTION_MARKER.test(output.slice(0, 1600))) return output
  const match = STORY_START.exec(output)
  if (!match) return ''
  const storyIndex = match.index
  const plotIndex = output.lastIndexOf('<plot>', storyIndex)
  const fenceIndex = output.lastIndexOf('```', storyIndex)
  const start = plotIndex >= 0 ? plotIndex : fenceIndex >= 0 ? fenceIndex : storyIndex
  return output.slice(start).trimStart()
}

/** Find the card-specific status tag used by a character's output protocol. */
export function detectStatusTag(...sources: string[]) {
  for (const source of sources) {
    const match = STATUS_OPENING.exec(source || '')
    if (match?.[1]) return match[1]
  }
  return ''
}

/** Keep a card's visual status block stable even when a model omits or forgets to close it. */
export function ensureStatusBlock(value: string, tag: string, fallbackContent: string) {
  const output = value.trimEnd()
  if (!output) return output
  if (!STATUS_TAG_NAME.test(tag)) return output
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const complete = new RegExp(`<${escapedTag}\\b[^>]*>[\\s\\S]*?<\\/${escapedTag}\\s*>`, 'i')
  if (complete.test(output)) return output

  const opening = new RegExp(`<${escapedTag}\\b[^>]*>`, 'ig')
  const matches = Array.from(output.matchAll(opening))
  if (matches.length) return `${output}</${tag}>`

  return `${output}\n\n<${tag}>${fallbackContent.trim()}</${tag}>`
}

/** Read labelled fields from the plain-text contents of a status block. */
export function extractStatusFields(value: string): StatusFieldValue[] {
  const fields: StatusFieldValue[] = []
  const plainValue = value.replace(STATUS_WRAPPER, '')
  STATUS_FIELD_MARKER.lastIndex = 0
  const markers = Array.from(plainValue.matchAll(STATUS_FIELD_MARKER))
  STATUS_FIELD_MARKER.lastIndex = 0
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index]
    const next = markers[index + 1]
    const label = marker[1]?.trim()
    const start = (marker.index || 0) + marker[0].length
    const end = next?.index ?? plainValue.length
    const fieldValue = plainValue.slice(start, end).trim().replace(/[｜|；;]+$/, '').trim()
    if (label && fieldValue) fields.push({ label, value: fieldValue })
  }
  return fields
}

/**
 * Keep a status panel useful when the model emits the tag but drops some of
 * the card's required fields. Concrete model text wins; absent or placeholder
 * values are replaced from the deterministic fallback values.
 */
export function completeStatusBlock(value: string, tag: string, fallbackContent: string, fallbackFields: StatusFieldValue[] = []) {
  const ensured = ensureStatusBlock(value, tag, fallbackContent)
  if (!ensured || !STATUS_TAG_NAME.test(tag) || !fallbackFields.length) return ensured

  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const complete = new RegExp(`<${escapedTag}\\b[^>]*>[\\s\\S]*?<\\/${escapedTag}\\s*>`, 'ig')
  const matches = Array.from(ensured.matchAll(complete))
  const last = matches[matches.length - 1]
  if (!last || last.index === undefined) return ensured

  const block = last[0]
  const contentStart = block.indexOf('>') + 1
  const closingStart = block.toLowerCase().lastIndexOf(`</${tag.toLowerCase()}`)
  if (contentStart <= 0 || closingStart < contentStart) return ensured

  let content = block.slice(contentStart, closingStart).trim()
  const originalContent = content
  const existingFields = extractStatusFields(content)
  for (const fallback of fallbackFields) {
    const existing = existingFields.find((field) => field.label === fallback.label)
    if (!existing || !isStatusPlaceholder(existing.value)) continue
    const label = fallback.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const field = new RegExp(`(${label}\\s*[：:]\\s*)[^\\n｜|；;<>{}]+`, 'u')
    content = content.replace(field, `$1${fallback.value}`)
  }
  const existingLabels = new Set(extractStatusFields(content).map((field) => field.label))
  const missing = fallbackFields.filter((field) => field.label && !existingLabels.has(field.label))
  if (!missing.length && content === originalContent) return ensured

  const separator = content ? (content.includes('\n') ? '\n' : '｜') : ''
  const additions = missing.map((field) => `${field.label}：${field.value}`).join(separator || '｜')
  const mergedContent = !additions ? content : content ? `${content}${separator}${additions}` : additions
  const mergedBlock = `${block.slice(0, contentStart)}${mergedContent}${block.slice(closingStart)}`
  return `${ensured.slice(0, last.index)}${mergedBlock}${ensured.slice(last.index + block.length)}`
}

/**
 * Some models emit their backstage block before the scene/body despite the
 * character protocol. Keep the persisted reply and the rendered old history in
 * the same canonical order: story first, one final status block last.
 */
export function moveStatusBlockToEnd(value: string, tag: string) {
  const output = value.trim()
  if (!output || !STATUS_TAG_NAME.test(tag)) return output
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const complete = new RegExp(`<${escapedTag}\\b[^>]*>[\\s\\S]*?<\\/${escapedTag}\\s*>`, 'ig')
  const blocks = Array.from(output.matchAll(complete)).map((match) => match[0].trim())
  if (!blocks.length) return output

  // Keep the newest complete block if a relay/model duplicated it, then append
  // it after the visible story. This keeps historical messages stable too.
  const body = output.replace(complete, '').replace(/\n{3,}/g, '\n\n').trim()
  const finalBlock = blocks[blocks.length - 1]
  return body ? `${body}\n\n${finalBlock}` : finalBlock
}

/** Streaming replies must not show a half-written or synthesized status panel. */
export function stripStatusBlocksForStreaming(value: string) {
  OPEN_OR_PARTIAL_STATUS_BLOCK.lastIndex = 0
  return value.replace(OPEN_OR_PARTIAL_STATUS_BLOCK, '').replace(/\n{3,}/g, '\n\n').trimEnd()
}

/** Directors own one final director_status panel; discard accidental character-status tags. */
export function normalizeDirectorStatusOutput(value: string) {
  COMPLETE_STATUS_BLOCK.lastIndex = 0
  const directorOnly = value.replace(COMPLETE_STATUS_BLOCK, (block, tag: string) => tag.toLowerCase() === 'director_status' ? block : '')
  const withoutPartialForeignStatus = directorOnly.replace(new RegExp(`<(?!(?:director_status)\\b)${STATUS_TAG_PATTERN}\\b[^>]*>[\\s\\S]*$`, 'i'), '')
  const fallback = '当前外部事件：本轮剧情已推进｜待回应钩子：等待用户或独立角色回应'
  return moveStatusBlockToEnd(ensureStatusBlock(withoutPartialForeignStatus, 'director_status', fallback), 'director_status')
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Remove repeated model-authored speaker headings when the UI already shows an author. */
export function stripLeadingSpeakerLabels(value: string, speakerNames: string[]) {
  const names = Array.from(new Set(speakerNames.map((name) => name.trim()).filter(Boolean)))
  if (!names.length) return value
  const alternatives = names.map(escapeRegex).join('|')
  const heading = new RegExp(`^\\s*(?:【\\s*(?:${alternatives})\\s*】|\\[\\s*(?:${alternatives})\\s*\\]|［\\s*(?:${alternatives})\\s*］)\\s*(?:[·•・:：—-]\\s*)?`, 'i')
  let output = value
  for (let index = 0; index < 6; index += 1) {
    const next = output.replace(heading, '')
    if (next === output) break
    output = next
  }
  return output.trimStart()
}
