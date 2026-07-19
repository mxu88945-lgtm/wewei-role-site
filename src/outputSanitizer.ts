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
