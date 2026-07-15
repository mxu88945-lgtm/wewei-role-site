const STATUS_INSTRUCTION_MARKER = /(?:#\s*)?注意[:：]?\s*(?:非常重要[！!]?|请严格按照以上格式输出)|必须在每次输出后回复的末尾|参考状态栏输出状态栏|状态栏格式要求如上|请严格遵守以上格式|禁止缺少任何符号\s*[（(]包括空格与换行|(?:获得|倒扣)\s*\d+w?\s*美元.*赛博小费/i
const STORY_START = /(?:<plot>\s*)?(?:```\s*)?(?:⏰|🕰️)\s*时间/i

export function sanitizeAssistantOutput(value: string) {
  const opening = value.slice(0, 1600)
  if (!STATUS_INSTRUCTION_MARKER.test(opening)) return value
  const match = STORY_START.exec(value)
  if (!match) return ''
  const storyIndex = match.index
  const plotIndex = value.lastIndexOf('<plot>', storyIndex)
  const fenceIndex = value.lastIndexOf('```', storyIndex)
  const start = plotIndex >= 0 ? plotIndex : fenceIndex >= 0 ? fenceIndex : storyIndex
  return value.slice(start).trimStart()
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
