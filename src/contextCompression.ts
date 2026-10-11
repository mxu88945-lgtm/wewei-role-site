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

/**
 * Automatic background compression (ported from 顾祁砚's continuity archive):
 * once AUTO_COMPRESSION_TRIGGER compressible messages sit after the summary
 * boundary, fold the older ones into the cumulative summary and keep the most
 * recent AUTO_COMPRESSION_KEEP_RECENT verbatim. The originals are never deleted
 * or hidden; only the prompt stops sending the folded ones.
 */
export const AUTO_COMPRESSION_TRIGGER = 240
export const AUTO_COMPRESSION_KEEP_RECENT = 96
/** A failed background run is not retried on every reply. */
export const AUTO_COMPRESSION_FAILURE_COOLDOWN_MS = 30 * 60 * 1000

export function planAutoContextCompression<T>(
  messages: T[],
  options: { compressedUntil?: number; hasValidSummary?: boolean; memoryLength?: number; isCompressible?: (message: T) => boolean },
): ContextCompressionPlan<T> | null {
  const isCompressible = options.isCompressible || (() => true)
  // Never fold messages the prompt would still send verbatim.
  const keepRecent = Math.max(AUTO_COMPRESSION_KEEP_RECENT, Math.floor(options.memoryLength || 0))
  const previousUntil = options.hasValidSummary
    ? Math.min(messages.length, Math.max(0, Math.floor(options.compressedUntil || 0)))
    : 0
  const outstanding = messages.slice(previousUntil).filter(isCompressible).length
  if (outstanding < AUTO_COMPRESSION_TRIGGER) return null
  const targetUntil = messages.length - keepRecent
  if (targetUntil <= previousUntil) return null
  const pendingMessages = messages.slice(previousUntil, targetUntil).filter(isCompressible)
  if (!pendingMessages.length) return null
  return { keepRecent, previousUntil, targetUntil, pendingMessages }
}

export function shouldStartAutoCompression(input: {
  plan: unknown
  running: boolean
  apiReady: boolean
  lastFailureAt?: number
  now: number
  cooldownMs?: number
}) {
  if (!input.plan || input.running || !input.apiReady) return false
  if (input.lastFailureAt && input.now - input.lastFailureAt < (input.cooldownMs ?? AUTO_COMPRESSION_FAILURE_COOLDOWN_MS)) return false
  return true
}

type SummaryState = { messages: unknown[]; historyRevision?: number; contextSummary?: string; contextSummaryRevision?: number; compressedUntil?: number }

/**
 * A finished summary may only land on the history it was made from: same
 * revision (no edit / rollback / branch switch since), same starting boundary
 * (no other compression slipped in), and the folded range still exists.
 */
export function canApplyContextCompression(
  conversation: SummaryState | undefined,
  started: { revision: number; previousUntil: number; targetUntil: number },
) {
  if (!conversation) return false
  const revision = conversation.historyRevision || 0
  if (revision !== started.revision) return false
  const validSummary = Boolean(conversation.contextSummary && (conversation.contextSummaryRevision || 0) === revision)
  const currentUntil = validSummary ? Math.max(0, Math.floor(conversation.compressedUntil || 0)) : 0
  if (currentUntil !== started.previousUntil) return false
  return conversation.messages.length >= started.targetUntil
}
