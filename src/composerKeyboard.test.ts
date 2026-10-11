import { describe, expect, it } from 'vitest'
import { dismissComposerKeyboard, isTouchKeyboardEnvironment, KEYBOARD_RESYNC_DELAYS } from './composerKeyboard'

const media = (coarse: boolean) => (query: string) => ({ matches: coarse && query === '(pointer: coarse)' })

describe('composer keyboard dismissal', () => {
  it('treats iOS standalone and coarse pointers as touch keyboards', () => {
    expect(isTouchKeyboardEnvironment({ navigator: { standalone: true }, matchMedia: media(false) })).toBe(true)
    expect(isTouchKeyboardEnvironment({ navigator: {}, matchMedia: media(true) })).toBe(true)
    expect(isTouchKeyboardEnvironment({ navigator: { standalone: false }, matchMedia: media(false) })).toBe(false)
    expect(isTouchKeyboardEnvironment(undefined)).toBe(false)
  })

  it('blurs the composer and re-syncs the viewport on touch devices', () => {
    let blurs = 0
    let syncs = 0
    const timers: number[] = []
    const win = {
      navigator: { standalone: true },
      matchMedia: media(false),
      setTimeout: (callback: () => void, ms: number) => { timers.push(ms); callback() },
      __weijingSyncViewport: () => { syncs += 1 },
    }
    expect(dismissComposerKeyboard([{ blur: () => { blurs += 1 } }, null], win)).toBe(true)
    expect(blurs).toBe(1)
    expect(timers).toEqual([...KEYBOARD_RESYNC_DELAYS])
    expect(syncs).toBe(KEYBOARD_RESYNC_DELAYS.length)
  })

  it('keeps focus on desktop', () => {
    let blurs = 0
    const win = { navigator: {}, matchMedia: media(false), setTimeout: () => 0 }
    expect(dismissComposerKeyboard([{ blur: () => { blurs += 1 } }], win)).toBe(false)
    expect(blurs).toBe(0)
  })
})
