export type ChatScrollSnapshot = {
  top: number
  stickToBottom: boolean
}

/**
 * A conversation without an in-memory snapshot has just been opened in this
 * app session. In that case the useful default is the newest message, not the
 * beginning of a potentially very long transcript.
 */
export function resolveChatScrollTarget(snapshot: ChatScrollSnapshot | undefined, maxScrollTop: number) {
  const maximum = Math.max(0, maxScrollTop)
  if (!snapshot || snapshot.stickToBottom) return maximum
  return Math.min(Math.max(0, snapshot.top), maximum)
}
