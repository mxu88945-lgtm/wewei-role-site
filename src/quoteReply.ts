import { stripUiOnlyStatusBlocks } from './modelContext'

/** 小手机「引用回复」：用户消息上保存被引用那句的快照（原句被删也能显示）。 */
export type MessageQuote = { messageId: string; author: string; text: string }

export const QUOTE_TEXT_LIMIT = 80

export function clipQuoteText(text: string, limit = QUOTE_TEXT_LIMIT) {
  const plain = stripUiOnlyStatusBlocks(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = Array.from(plain)
  return chars.length > limit ? `${chars.slice(0, limit).join('')}…` : plain
}

export function buildMessageQuote(message: { id: number | string; text: string; images?: unknown[]; attachments?: Array<{ name?: string }> }, author: string): MessageQuote {
  const text = clipQuoteText(message.text)
    || (message.attachments?.length ? `[文件：${message.attachments.map((item) => item.name || '未命名文件').join('、')}]` : '')
    || (message.images?.length ? '[图片]' : '')
  return { messageId: String(message.id), author: author.trim() || '对方', text }
}

/** 发给模型时加在用户这一轮最前面，存储的原文不变。 */
export function quotePromptPrefix(quote?: MessageQuote | null) {
  if (!quote || !quote.text) return ''
  return `（引用 ${quote.author}：“${quote.text}”）`
}

export function withQuotePrefix(text: string, quote?: MessageQuote | null) {
  const prefix = quotePromptPrefix(quote)
  if (!prefix) return text
  return text ? `${prefix}\n${text}` : prefix
}

/**
 * 被引用的人如果是群成员，算作被点名（和 @ 一样优先）。
 * 先按原消息的 characterId 找，找不到再按作者名字匹配。
 */
export function quotedParticipantIds(
  quote: MessageQuote | null | undefined,
  participants: Array<{ id: string; name: string }>,
  messages: Array<{ id: number | string; role: string; characterId?: string }> = [],
) {
  if (!quote) return []
  const original = messages.find((item) => String(item.id) === quote.messageId)
  if (original && original.role === 'user') return []
  if (original?.characterId && participants.some((item) => item.id === original.characterId)) return [original.characterId]
  const byName = participants.find((item) => item.name && item.name === quote.author)
  return byName ? [byName.id] : []
}

/** 把被引用者排到最前（去重），其余顺序不变。 */
export function prioritizeAddressed(ids: string[], addressedIds: string[]) {
  const front = addressedIds.filter((id, index) => addressedIds.indexOf(id) === index)
  return [...front, ...ids.filter((id) => !front.includes(id))]
}
