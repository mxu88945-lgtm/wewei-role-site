/**
 * Long chats only render their most recent rows; older rows load on demand.
 * Display only: what the model receives is decided by the prompt builder.
 *
 * The window is anchored to a message id (its first rendered message), not to a
 * count from the end. A count-from-end window drops the top row whenever a new
 * reply arrives, which shifts everything under her finger while she reads
 * history. `null` means "the latest CHAT_RENDER_WINDOW messages".
 */
export const CHAT_RENDER_WINDOW = 60
/** Rendered rows may grow this far past the window during a session before a trim. */
export const CHAT_WINDOW_TRIM_SLACK = 30

type Identified = { id: number }

export function resolveChatWindowStart(messages: Identified[], anchorId: number | null | undefined, limit = CHAT_RENDER_WINDOW) {
  if (anchorId !== null && anchorId !== undefined) {
    const index = messages.findIndex((message) => message.id === anchorId)
    if (index >= 0) return index
  }
  return Math.max(0, messages.length - limit)
}

/** How many earlier messages the "加载更早" button would add (0 = no button). */
export function earlierChatMessageCount(start: number, step = CHAT_RENDER_WINDOW) {
  return Math.min(Math.max(0, start), step)
}

/** Anchor after loading `step` more messages above the current window start. */
export function earlierChatWindowAnchor(messages: Identified[], start: number, step = CHAT_RENDER_WINDOW): number | null {
  if (start <= 0 || !messages.length) return messages[0]?.id ?? null
  return messages[Math.max(0, start - step)].id
}

/** Anchor that keeps the current window but also includes `index` (search / bookmark jumps). */
export function chatWindowAnchorIncluding(messages: Identified[], start: number, index: number, margin = 10): number | null {
  if (index < 0 || index >= start) return messages[start]?.id ?? null
  return messages[Math.max(0, index - margin)].id
}

/**
 * When she is following the latest message and the rendered rows have grown well
 * past the window, drop back to the newest CHAT_RENDER_WINDOW rows. Returns the
 * new anchor, or undefined when nothing should change.
 */
export function trimmedChatWindowAnchor(messages: Identified[], start: number, atBottom: boolean, limit = CHAT_RENDER_WINDOW, slack = CHAT_WINDOW_TRIM_SLACK): null | undefined {
  if (!atBottom) return undefined
  return messages.length - start > limit + slack ? null : undefined
}
