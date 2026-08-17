export type ConversationStatMessage = { role: string }

export function countConversationStats(messages: ReadonlyArray<ConversationStatMessage>) {
  return messages.reduce((stats, message) => ({
    rounds: stats.rounds + (message.role === 'user' ? 1 : 0),
    replies: stats.replies + (message.role === 'assistant' ? 1 : 0),
    total: stats.total + 1,
  }), { rounds: 0, replies: 0, total: 0 })
}
