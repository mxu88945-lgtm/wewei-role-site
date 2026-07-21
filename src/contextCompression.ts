export type ContextCompressionPlan<T> = {
  keepRecent: number
  previousUntil: number
  targetUntil: number
  pendingMessages: T[]
}

export function planContextCompression<T>(
  messages: T[],
  memoryLength: number,
  compressedUntil = 0,
  hasValidSummary = false,
): ContextCompressionPlan<T> {
  const keepRecent = Math.max(10, Math.floor(memoryLength / 2))
  const previousUntil = hasValidSummary
    ? Math.min(messages.length, Math.max(0, Math.floor(compressedUntil)))
    : 0
  const targetUntil = Math.max(previousUntil, messages.length - keepRecent)

  return {
    keepRecent,
    previousUntil,
    targetUntil,
    pendingMessages: messages.slice(previousUntil, targetUntil),
  }
}

export function uncompressedMessages<T>(messages: T[], compressedUntil = 0, hasValidSummary = false) {
  if (!hasValidSummary) return messages
  const cutoff = Math.min(messages.length, Math.max(0, Math.floor(compressedUntil)))
  return messages.slice(cutoff)
}
