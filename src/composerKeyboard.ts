/**
 * After a composer send on a touch device (iPhone home-screen PWA in particular)
 * the soft keyboard should close by itself instead of waiting for the keyboard's
 * own ✓ / Done key. Desktop keeps focus so typing the next line just works.
 */

export interface KeyboardEnvironment {
  navigator?: { standalone?: boolean } | null
  matchMedia?: ((query: string) => { matches: boolean }) | null
}

export function isTouchKeyboardEnvironment(env: KeyboardEnvironment | undefined | null): boolean {
  if (!env) return false
  if (env.navigator?.standalone === true) return true
  try {
    return Boolean(env.matchMedia?.('(pointer: coarse)').matches)
  } catch {
    return false
  }
}

/** Delays at which index.html's visualViewport sync is re-run after the blur:
    iOS sometimes skips the final visualViewport resize when the keyboard closes. */
export const KEYBOARD_RESYNC_DELAYS = [120, 360, 700] as const

type BlurTarget = { blur: () => void } | null | undefined

interface DismissWindow extends KeyboardEnvironment {
  setTimeout: (callback: () => void, ms: number) => unknown
  __weijingSyncViewport?: () => void
}

/** Blurs the given composer fields on touch devices and re-syncs the app height.
    Returns true when the keyboard was dismissed. */
export function dismissComposerKeyboard(targets: BlurTarget[], win: DismissWindow | undefined | null = typeof window === 'undefined' ? undefined : (window as unknown as DismissWindow)): boolean {
  if (!win || !isTouchKeyboardEnvironment(win)) return false
  for (const target of targets) {
    try { target?.blur() } catch { /* element already gone */ }
  }
  for (const delay of KEYBOARD_RESYNC_DELAYS) {
    win.setTimeout(() => { win.__weijingSyncViewport?.() }, delay)
  }
  return true
}
