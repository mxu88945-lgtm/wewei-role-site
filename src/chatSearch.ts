import type { Conversation, Message } from './conversationLifecycle'
import { modelVisibleMessageText } from './modelContext'
import { stripPresentationalHtmlForPrompt } from './regexEngine'

export function searchChatMessages(messages: Message[], query: string, bookmarks: Conversation['bookmarks'], onlyBookmarks: boolean) {
  const needle = query.trim().toLocaleLowerCase()
  return messages.flatMap((message) => {
    const bookmark = bookmarks?.[String(message.id)]
    if (onlyBookmarks && !bookmark) return []
    const text = stripPresentationalHtmlForPrompt(modelVisibleMessageText(message))
    const index = text.toLocaleLowerCase().indexOf(needle)
    if (needle && index < 0 && !bookmark?.note.toLocaleLowerCase().includes(needle)) return []
    const start = Math.max(0, index - 45)
    return [{ message, bookmark, excerpt: `${start ? '…' : ''}${text.slice(start, start + 200)}${text.length > start + 200 ? '…' : ''}` }]
  })
}

