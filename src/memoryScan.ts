import type { Conversation, Message } from './conversationLifecycle'

/** Appended turns are allowed; edits, deletion, restart and removed conversations invalidate a scan. */
export function isMemoryScanCurrent(current: Conversation | undefined, source: Conversation, scannedMessages: Message[]) {
  if (!current || current.id !== source.id || (current.historyRevision || 0) !== (source.historyRevision || 0) || current.messages.length < scannedMessages.length) return false
  return scannedMessages.every((message, index) => {
    const latest = current.messages[index]
    return latest.id === message.id && latest.role === message.role && latest.characterId === message.characterId && latest.text === message.text
  })
}

/** Bounded incremental scans keep old unsummarized turns available for the next batch. */
export function planMemoryScan(messages: Message[], summarizedCount: number, maxChars = 36000, maxMessages = 100) {
  const start = Math.min(messages.length, Math.max(0, summarizedCount))
  let end = start
  let chars = 0
  for (const message of messages.slice(start)) {
    if (end > start && (chars + message.text.length > maxChars || end - start >= maxMessages)) break
    chars += message.text.length
    end += 1
  }
  return { pendingMessages: messages.slice(start, end), scannedMessages: messages.slice(0, end), end, hasMore: end < messages.length }
}

export function hasCompleteCoreMemoryPayload(payload: string) {
  try {
    const parsed: unknown = JSON.parse(payload)
    return Boolean(parsed && typeof parsed === 'object' && 'memories' in parsed && Array.isArray(parsed.memories))
  } catch { return false }
}
