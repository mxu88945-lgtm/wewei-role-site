/**
 * 语义召回 · 切片（纯函数，不读存储）。
 * 每段对话（剧情）单独切：相邻 2–4 条消息一段，攒到 ≥300 字且 ≥2 条、或满 600 字、或满 4 条就收段。
 * key = 哈希（模型 + 对话 id + 原文）：同一段文字只嵌入一次，不同对话之间永远不共用片段。
 */
import { modelVisibleMessageText } from './modelContext'
import { stripPresentationalHtmlForPrompt } from './regexEngine'

export type SegmentMessage = { id: number; role: 'user' | 'assistant'; text: string; phoneNotice?: boolean }
export type SegmentConversation = { id: string; messages: SegmentMessage[] }

export type Segment = {
  key: string
  conversationId: string
  /** 送去嵌入的文字 */
  text: string
  msgIds: number[]
}

export const SEG_MIN_CHARS = 300
export const SEG_MAX_CHARS = 600
export const SEG_MIN_MSGS = 2
export const SEG_MAX_MSGS = 4
/** 单段送去嵌入时的截断长度 */
export const EMBED_TEXT_MAX = 1200

/** 正在生成时的占位文字：不嵌入 */
const PENDING_PLACEHOLDER = /^(?:正在回应…|正在思考…|正在整理回复…|正在连接模型…|模型正在思考…|渠道暂未返回，正在重连…|已收到数据，正在生成消息…|幕后安排 .*)$/

/** cyrb53：快速、同步、稳定的 53 位字符串哈希（只用于去重）。 */
export function contentHash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function segmentKey(model: string, conversationId: string, text: string): string {
  return `${contentHash(`${model}\n${conversationId}\n${text}`)}-${text.length.toString(36)}`
}

function chars(text: string): number {
  return Array.from(text).length
}

export function clipChars(text: string, n: number): string {
  const list = Array.from(text)
  return list.length > n ? list.slice(0, n).join('') : text
}

/** 模型能看到的正文：去状态栏、去美化 HTML；系统小字、失败消息、占位文字返回空。 */
export function segmentMessageText(message: SegmentMessage): string {
  if (message.phoneNotice) return ''
  const visible = modelVisibleMessageText(message)
  const text = (message.role === 'assistant' ? stripPresentationalHtmlForPrompt(visible) : visible).trim()
  if (!text || PENDING_PLACEHOLDER.test(text)) return ''
  return text
}

function lineOf(role: 'user' | 'assistant', text: string): string {
  return `${role === 'user' ? '她' : '他'}：${text.replace(/\s+/g, ' ').trim()}`
}

/** 由若干条消息拼出段落原文（索引和召回校验用同一个函数，保证一致）。 */
export function segmentTextOf(messages: Array<{ role: 'user' | 'assistant'; text: string }>): string {
  return clipChars(messages.map((m) => lineOf(m.role, m.text)).join('\n'), EMBED_TEXT_MAX)
}

/**
 * 一段对话从头贪心切：旧消息不变时旧段边界也不变，哈希稳定，不会重复嵌入。
 * 最后没攒满的尾巴先不切（还在聊，等攒满再一起嵌）。
 */
export function segmentConversation(conversation: SegmentConversation, model: string): Segment[] {
  const out: Segment[] = []
  let buf: Array<{ id: number; role: 'user' | 'assistant'; text: string }> = []
  let size = 0
  const flush = () => {
    if (!buf.length) return
    const text = segmentTextOf(buf)
    out.push({ key: segmentKey(model, conversation.id, text), conversationId: conversation.id, text, msgIds: buf.map((m) => m.id) })
    buf = []
    size = 0
  }
  for (const message of conversation.messages) {
    const text = segmentMessageText(message)
    if (chars(text) < 2) continue
    const length = chars(text)
    if (buf.length >= SEG_MIN_MSGS && size + length > SEG_MAX_CHARS) flush()
    buf.push({ id: message.id, role: message.role, text })
    size += length
    if (buf.length >= SEG_MAX_MSGS || size >= SEG_MAX_CHARS || (buf.length >= SEG_MIN_MSGS && size >= SEG_MIN_CHARS)) flush()
  }
  // 没攒满的尾巴不切：它一定在最近几条里（本来就在上下文中），等攒满再嵌，已建片段的哈希永远不变。
  return out
}

/** 所有对话的片段，按 key 去重。 */
export function buildAllSegments(conversations: SegmentConversation[], model: string): Segment[] {
  const seen = new Set<string>()
  const all: Segment[] = []
  for (const conversation of conversations) {
    for (const segment of segmentConversation(conversation, model)) {
      if (seen.has(segment.key)) continue
      seen.add(segment.key)
      all.push(segment)
    }
  }
  return all
}
