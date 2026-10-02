import type { Conversation } from './conversationLifecycle'

type TemporaryPlot = NonNullable<Conversation['temporaryPlot']>

/** Capture once for the request; group directions only reach explicitly named speakers. */
export function captureTemporaryPlot(conversation: Conversation, explicitlyMentioned: boolean): TemporaryPlot | undefined {
  if (conversation.kind === 'group' && !explicitlyMentioned) return undefined
  return conversation.temporaryPlot?.text.trim() ? { ...conversation.temporaryPlot } : undefined
}

/** Call only after a validated successful reply. Never clear a newer edit or restarted story. */
export function consumeTemporaryPlot(conversation: Conversation, captured: TemporaryPlot | undefined, historyRevision: number): Conversation {
  if (!captured || captured.id !== conversation.temporaryPlot?.id || historyRevision !== (conversation.historyRevision || 0)) return conversation
  return { ...conversation, temporaryPlot: undefined }
}
