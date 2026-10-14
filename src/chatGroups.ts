import type { Conversation } from './conversationLifecycle'

export const UNGROUPED_CHAT_KEY = '__ungrouped__'
export type ChatSection = { key: string; name: string; items: Conversation[] }

/** Named groups first, ordered by their latest chat; ungrouped last. Keeps the incoming order inside a group. */
export function groupConversations(sorted: Conversation[]): ChatSection[] {
  const byGroup = new Map<string, Conversation[]>()
  const ungrouped: Conversation[] = []
  for (const conversation of sorted) {
    const group = conversation.chatGroup?.trim()
    if (!group) { ungrouped.push(conversation); continue }
    byGroup.set(group, [...(byGroup.get(group) || []), conversation])
  }
  const latest = (items: Conversation[]) => Math.max(...items.map((item) => item.updatedAt || 0))
  const sections = [...byGroup.entries()].sort((a, b) => latest(b[1]) - latest(a[1])).map(([name, items]) => ({ key: name, name, items }))
  if (ungrouped.length) sections.push({ key: UNGROUPED_CHAT_KEY, name: '未分组', items: ungrouped })
  return sections
}

export function chatGroupNames(conversations: Conversation[]) {
  return [...new Set(conversations.map((item) => item.chatGroup?.trim()).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

/** Put the given chats into one group ('' = ungroup). Does not touch updatedAt, so list order stays. */
export function assignChatGroup(conversations: Conversation[], ids: string[], group: string) {
  const wanted = new Set(ids)
  const next = group.trim().slice(0, 40) || undefined
  return conversations.map((item) => wanted.has(item.id) ? { ...item, chatGroup: next } : item)
}

/** Set a group's exact members and optionally rename it; chats taken out become ungrouped. */
export function setChatGroupMembers(conversations: Conversation[], original: string, name: string, memberIds: string[]) {
  const next = name.trim().slice(0, 40) || undefined
  const members = new Set(memberIds)
  return conversations.map((item) => {
    if (members.has(item.id)) return item.chatGroup === next ? item : { ...item, chatGroup: next }
    if (original && item.chatGroup === original) return { ...item, chatGroup: undefined }
    return item
  })
}
