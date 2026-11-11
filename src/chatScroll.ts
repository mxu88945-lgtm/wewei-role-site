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

/**
 * Where the list should sit after the end-marker relayout nudge (Safari extent fix).
 *
 * v203: the live scrollTop must be read at the moment of the nudge, never when the
 * nudge was scheduled. Coming back from 幕后手记 / 小手机 / settings, the freshly
 * mounted list reports scrollTop 0 and a ResizeObserver schedules a nudge in that
 * same frame; the position restore lands one frame later, and writing the stale 0
 * back afterwards threw her to the top ("加载更早 60 条" showing).
 */
export function resolveRelayoutScrollTop(options: {
  restorePending: boolean
  snapshot: ChatScrollSnapshot | undefined
  liveTop: number
  maxScrollTop: number
}) {
  const maximum = Math.max(0, options.maxScrollTop)
  if (options.restorePending || options.snapshot?.stickToBottom) return resolveChatScrollTarget(options.snapshot, maximum)
  return Math.min(Math.max(0, options.liveTop), maximum)
}
