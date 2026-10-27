import type { Conversation } from './conversationLifecycle'

export type ConversationTrashEntry<TMemory = unknown> = {
  id: string
  deletedAt: number
  conversation: Conversation
  memories: TMemory[]
  storyProjectIds: string[]
}

const clone = <T,>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

export function createConversationTrashEntry<TMemory>(conversation: Conversation, memories: TMemory[], storyProjectIds: string[], deletedAt = Date.now()): ConversationTrashEntry<TMemory> {
  return {
    id: `${conversation.id}:${deletedAt}`,
    deletedAt,
    conversation: clone(conversation),
    memories: clone(memories),
    storyProjectIds: clone(storyProjectIds),
  }
}

export function restoreConversationTrashEntry<TMemory>(entry: ConversationTrashEntry<TMemory>) {
  return {
    conversation: clone(entry.conversation),
    memories: clone(entry.memories),
    storyProjectIds: clone(entry.storyProjectIds),
  }
}
