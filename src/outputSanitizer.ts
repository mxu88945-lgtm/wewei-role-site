const STATUS_INSTRUCTION_MARKER = /(?:#\s*)?注意[:：]?\s*非常重要[！!]?|必须在每次输出后回复的末尾|参考状态栏输出状态栏|状态栏格式要求如上|请严格遵守以上格式|(?:获得|倒扣)\s*\d+w?\s*美元.*赛博小费/i
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
