/**
 * Keeps the chat message list pinned to its newest message while the iOS soft
 * keyboard opens or closes.
 *
 * In the iPhone home-screen PWA, index.html shrinks --app-h to the visual
 * viewport when the keyboard opens. The message list gets shorter but its
 * scrollTop stays where it was, so the last message / status card ends up
 * hidden behind the composer and keyboard. If the list was at (or near) the
 * bottom just before the viewport changed, we re-pin it to the bottom across
 * the whole keyboard animation. If she had scrolled up to read history, we
 * leave her where she is.
 */

/** How close to the bottom (px) still counts as "reading the latest message". */
export const KEYBOARD_PIN_THRESHOLD = 120
/** Extra re-pins after a viewport change: iOS animates the keyboard and can land
    its final visualViewport resize late. */
export const KEYBOARD_PIN_DELAYS = [120, 360] as const
/** How long (ms) after the last viewport change / composer focus the pin stays armed. */
export const KEYBOARD_PIN_WINDOW_MS = 900
/** Scroll events within this many ms of a programmatic pin are ours, not hers. */
export const KEYBOARD_PIN_ECHO_MS = 200

/** Events dispatched on window by index.html's visualViewport sync. */
export const VIEWPORT_WILL_CHANGE_EVENT = 'weijing:viewport-will-change'
export const VIEWPORT_CHANGE_EVENT = 'weijing:viewport-change'

export interface ScrollBox {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export function distanceToBottom(box: ScrollBox): number {
  return Math.max(0, box.scrollHeight - box.scrollTop - box.clientHeight)
}

export function isNearBottom(box: ScrollBox, threshold = KEYBOARD_PIN_THRESHOLD): boolean {
  return distanceToBottom(box) <= threshold
}

export interface PinHost {
  now: () => number
  requestAnimationFrame: (callback: () => void) => unknown
  setTimeout: (callback: () => void, ms: number) => unknown
}

export interface KeyboardScrollPin {
  /** Record whether the list is at the bottom right now (before the viewport
      shrinks or grows). While a pin is already armed and within its window the
      original decision is kept and only the window is extended. */
  arm: () => boolean
  /** Viewport / list size changed: if armed and stuck, scroll to the bottom now,
      on the next frame and after the delayed re-pins. */
  pin: () => boolean
  /** She started scrolling herself: stop pinning until the next arm. */
  release: () => void
  /** True right after a programmatic pin, so scroll handlers can ignore the echo. */
  recentlyPinned: () => boolean
  isArmed: () => boolean
}

export function createKeyboardScrollPin(getList: () => ScrollBox | null | undefined, host: PinHost): KeyboardScrollPin {
  let stuck = false
  let armedUntil = -Infinity
  let lastPinAt = -Infinity
  let generation = 0

  const active = () => stuck && host.now() <= armedUntil

  const toBottom = (expected: number) => {
    if (expected !== generation || !stuck) return
    const list = getList()
    if (!list) return
    const target = Math.max(0, list.scrollHeight - list.clientHeight)
    if (Math.abs(list.scrollTop - target) < 1) return
    lastPinAt = host.now()
    list.scrollTop = target
  }

  return {
    arm() {
      const now = host.now()
      if (now <= armedUntil) {
        armedUntil = now + KEYBOARD_PIN_WINDOW_MS
        return stuck
      }
      const list = getList()
      stuck = Boolean(list && isNearBottom(list))
      armedUntil = now + KEYBOARD_PIN_WINDOW_MS
      generation += 1
      return stuck
    },
    pin() {
      if (!active()) return false
      const expected = generation
      toBottom(expected)
      host.requestAnimationFrame(() => toBottom(expected))
      for (const delay of KEYBOARD_PIN_DELAYS) host.setTimeout(() => toBottom(expected), delay)
      return true
    },
    release() {
      stuck = false
      armedUntil = -Infinity
      generation += 1
    },
    recentlyPinned() {
      return host.now() - lastPinAt <= KEYBOARD_PIN_ECHO_MS
    },
    isArmed: active,
  }
}
