export type PhoneBubble = { kind: 'say' | 'act'; text: string }

const ACT_PART = /（[^（）\n]{1,200}）|\([^()\n]{1,200}\)|\*[^*\n]{1,200}\*/g
const SHORT = 18
const CLOSERS_ONLY = /^[”’」』"'）)]+$/

/** 一句太长就按句号/问号/感叹号切成几个短气泡（像微信一句一句发）。 */
function shortSentences(line: string) {
  if (line.length <= SHORT) return [line]
  let sentences = line.match(/[^。！？!?…~～]+(?:[。！？!?…~～]+[”’」』"'）)]*|$)/g)?.map((item) => item.trim()).filter(Boolean) || [line]
  // 单句还是太长，就在逗号处再断一次（逗号留在前半句末尾去掉，更像打字发消息）。
  sentences = sentences.flatMap((sentence) => sentence.length > SHORT * 1.6 ? sentence.split(/(?<=[，,；;])/).map((item) => item.trim()).filter(Boolean) : [sentence])
  const out: string[] = []
  for (const sentence of sentences) {
    const last = out[out.length - 1]
    if (last !== undefined && last.length + sentence.length <= SHORT) out[out.length - 1] = last + sentence
    else out.push(sentence)
  }
  return out.map((item) => item.replace(/[，,]$/, ''))
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
  // 只剩一个右引号/右括号的气泡（例如模型把 ” 或 」 单独换了一行）并回上一句。
  return result.reduce<PhoneBubble[]>((out, bubble) => {
    const prev = out[out.length - 1]
    if (bubble.kind === 'say' && CLOSERS_ONLY.test(bubble.text) && prev?.kind === 'say') prev.text += bubble.text
    else out.push(bubble)
    return out
  }, [])
}

/** v335：防刷屏——气泡超过上限时，反复把相邻两条台词里合起来最短的一对并成一条，直到不超过上限。动作小灰字不计数、不合并。 */
export function capPhoneBubbles(bubbles: PhoneBubble[], max: number): PhoneBubble[] {
  const out = bubbles.map((item) => ({ ...item }))
  const limit = Math.max(1, Math.floor(max))
  const sayCount = () => out.filter((item) => item.kind === 'say').length
  while (sayCount() > limit) {
    let best = -1
    let bestLength = Infinity
    for (let index = 0; index < out.length - 1; index += 1) {
      if (out[index].kind !== 'say' || out[index + 1].kind !== 'say') continue
      const length = out[index].text.length + out[index + 1].text.length
      if (length < bestLength) { best = index; bestLength = length }
    }
    if (best < 0) {
      // 台词被动作隔开、没有相邻对：把动作并回前一句台词里，再继续合并。
      const actIndex = out.findIndex((item, index) => item.kind === 'act' && out[index - 1]?.kind === 'say' && out[index + 1]?.kind === 'say')
      if (actIndex < 0) break
      out[actIndex - 1].text += `（${out[actIndex].text}）`
      out.splice(actIndex, 1)
      continue
    }
    const left = out[best].text
    const joiner = /[。！？!?…~～”’」』"')）]$/.test(left) ? '' : '，'
    out[best].text = left + joiner + out[best + 1].text
    out.splice(best + 1, 1)
  }
  return out
}

export type PhoneSplitSetting = { on: boolean; max: number }
export const PHONE_SPLIT_KEY = 'weijing.phoneSplitBubbles'
export const PHONE_SPLIT_DEFAULT: PhoneSplitSetting = { on: false, max: 4 }

export function readPhoneSplit(): PhoneSplitSetting {
  try {
    const raw = JSON.parse(localStorage.getItem(PHONE_SPLIT_KEY) || 'null') as Partial<PhoneSplitSetting> | null
    if (!raw) return { ...PHONE_SPLIT_DEFAULT }
    const max = Number(raw.max)
    return { on: raw.on === true, max: Number.isFinite(max) && max >= 1 && max <= 12 ? Math.floor(max) : PHONE_SPLIT_DEFAULT.max }
  } catch { return { ...PHONE_SPLIT_DEFAULT } }
}

export function writePhoneSplit(value: PhoneSplitSetting) {
  try { localStorage.setItem(PHONE_SPLIT_KEY, JSON.stringify(value)) } catch { /* 存不下也不影响本次显示 */ }
}
