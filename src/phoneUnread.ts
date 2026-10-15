import type { Conversation } from './conversationLifecycle'

/** 小手机未读：readId 之后角色发来的消息数（系统小字、生成中的占位不算）。没记过 readId 的旧会话算 0。 */
export function phoneUnreadCount(conversation: Pick<Conversation, 'phone' | 'messages'>) {
  const readId = conversation.phone?.readId
  if (!conversation.phone || readId === undefined) return 0
  return conversation.messages.filter((message) => message.role === 'assistant' && !message.phoneNotice && message.id > readId && message.text.trim() && message.text !== '正在回应…').length
}

export const latestMessageId = (conversation: Pick<Conversation, 'messages'>) => conversation.messages.reduce((max, message) => Number.isFinite(message.id) && message.id > max ? message.id : max, 0)

/** 红点上的文字：超过 99 显示 99+。 */
export const unreadLabel = (count: number) => count > 99 ? '99+' : String(count)
