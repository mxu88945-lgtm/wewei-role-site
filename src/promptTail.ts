import type { ChatApiMessage } from './chatApi'

/**
 * v210：每轮会变的提示（召回、触发的世界书、剧情锚点、正在听的歌、倒计时……）不再作为第二条 system 发出——
 * 她用的中转站多半只认第一条 system，后面的 system 会被丢掉或忽略。
 * 现在只在发出的请求里，把这些内容接在「最新一条用户消息」正文之后，用固定标记包起来；
 * 存储、显示、历史、记忆、压缩、召回一律看不到它（只在请求副本里加，另外到处再剥一次兜底）。
 * 第一条 system 因此每轮字节不变，Gemini 隐式前缀缓存和 Claude cache_control 都能命中。
 */
export const TURN_CONTEXT_OPEN = '【本轮背景（系统提供，非她原话）】'
export const TURN_CONTEXT_CLOSE = '【/本轮背景】'

const TURN_CONTEXT_PATTERN = /\n*【本轮背景（系统提供，非她原话）】[\s\S]*?(?:【\/本轮背景】|$)/g
// A streamed chunk can stop halfway through the opening marker.
const PARTIAL_OPEN = /\n*【本轮背?景?（?系?统?提?供?，?非?她?原?话?）?$/

/** Remove the request-only tail anywhere it might leak (model echo, old data, partial stream). */
export function stripTurnContext(value: string) {
  if (!value || !value.includes('【本轮背')) return value
  return value.replace(TURN_CONTEXT_PATTERN, '').replace(PARTIAL_OPEN, '').trimEnd()
}

export function hasTurnContext(message: ChatApiMessage | undefined) {
  if (!message) return false
  const text = typeof message.content === 'string' ? message.content : message.content.map((part) => part.type === 'text' ? part.text : '').join('\n')
  return text.includes(TURN_CONTEXT_OPEN)
}

const messageText = (message: ChatApiMessage) => typeof message.content === 'string' ? message.content : message.content.map((part) => part.type === 'text' ? part.text : '').join('\n')

const wrap = (tail: string) => `${TURN_CONTEXT_OPEN}\n${tail}\n${TURN_CONTEXT_CLOSE}`

/** Append the tail after her own words (text or multimodal content). Never mutates. */
export function withTurnContext(content: ChatApiMessage['content'], tail: string): ChatApiMessage['content'] {
  const block = wrap(tail)
  if (typeof content === 'string') return content.trim() ? `${content}\n\n${block}` : block
  // Multimodal turn: her text and images stay untouched; the tail is its own trailing text part.
  return [...content, { type: 'text', text: block }]
}

export const TURN_BRIDGE_TEXT = '请根据以上对话继续回应。'

/**
 * One leading system message (everything before the first conversation turn, merged), the visible
 * turns in order, and every later system message folded — in order — into the latest user turn's
 * tail. If the conversation ends on an assistant turn, a request-only bridge user turn carries it.
 */
export function foldPromptForRelay(messages: ChatApiMessage[]): ChatApiMessage[] {
  const firstTurn = messages.findIndex((item) => item.role !== 'system')
  const leadEnd = firstTurn < 0 ? messages.length : firstTurn
  const lead = messages.slice(0, leadEnd).map(messageText).filter((item) => item.trim())
  const turns: ChatApiMessage[] = []
  const tail: string[] = []
  for (const message of messages.slice(leadEnd)) {
    if (message.role === 'system') { const text = messageText(message); if (text.trim()) tail.push(text) }
    else turns.push(message)
  }
  const result: ChatApiMessage[] = lead.length ? [{ role: 'system', content: lead.join('\n\n') }] : []
  if (!tail.length) return [...result, ...turns]
  const last = turns[turns.length - 1]
  if (last?.role === 'user') return [...result, ...turns.slice(0, -1), { ...last, content: withTurnContext(last.content, tail.join('\n\n')) }]
  if (!turns.length && !lead.length) return [{ role: 'system', content: tail.join('\n\n') }]
  return [...result, ...turns, { role: 'user', content: withTurnContext(TURN_BRIDGE_TEXT, tail.join('\n\n')) }]
}
