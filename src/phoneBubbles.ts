export type PhoneBubble = { kind: 'say' | 'act'; text: string }

const ACT_PART = /（[^（）\n]{1,200}）|\([^()\n]{1,200}\)|\*[^*\n]{1,200}\*/g
const SHORT = 26

/** 一句太长就按句号/问号/感叹号切成几个短气泡（像微信一句一句发）。 */
function shortSentences(line: string) {
  if (line.length <= SHORT) return [line]
  const sentences = line.match(/[^。！？!?…~～]+(?:[。！？!?…~～]+|$)/g)?.map((item) => item.trim()).filter(Boolean) || [line]
  const out: string[] = []
  for (const sentence of sentences) {
    const last = out[out.length - 1]
    if (last !== undefined && last.length + sentence.length <= SHORT) out[out.length - 1] = last + sentence
    else out.push(sentence)
  }
  return out
}

/** 小手机微信样式：每行台词一个气泡，括号/星号里的动作变成气泡间的小灰字。 */
export function splitPhoneBubbles(text: string): PhoneBubble[] {
  const result: PhoneBubble[] = []
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim()
    if (!line) continue
    let cursor = 0
    for (const match of line.matchAll(ACT_PART)) {
      const before = line.slice(cursor, match.index).trim()
      if (before) shortSentences(before).forEach((item) => result.push({ kind: 'say', text: item }))
      const inner = match[0].slice(1, -1).trim()
      if (inner) result.push({ kind: 'act', text: inner })
      cursor = (match.index || 0) + match[0].length
    }
    const rest = line.slice(cursor).trim()
    if (rest) shortSentences(rest).forEach((item) => result.push({ kind: 'say', text: item }))
  }
  return result
}
