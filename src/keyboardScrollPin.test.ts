import { describe, expect, it } from 'vitest'
import { createKeyboardScrollPin, isNearBottom, KEYBOARD_PIN_DELAYS, KEYBOARD_PIN_WINDOW_MS, type ScrollBox } from './keyboardScrollPin'

const harness = (box: ScrollBox) => {
  let now = 0
  const frames: Array<() => void> = []
  const timers: Array<{ at: number, callback: () => void }> = []
  const pin = createKeyboardScrollPin(() => box, {
    now: () => now,
    requestAnimationFrame: (callback) => { frames.push(callback) },
    setTimeout: (callback, ms) => { timers.push({ at: now + ms, callback }) },
  })
  const flush = () => {
    frames.splice(0).forEach((frame) => frame())
    timers.splice(0).sort((a, b) => a.at - b.at).forEach((timer) => { now = Math.max(now, timer.at); timer.callback() })
  }
  return { pin, flush, advance: (ms: number) => { now += ms }, frames, timers }
}

describe('keyboard scroll pin', () => {
  it('measures closeness to the bottom', () => {
    expect(isNearBottom({ scrollTop: 880, scrollHeight: 1600, clientHeight: 600 })).toBe(true)
    expect(isNearBottom({ scrollTop: 700, scrollHeight: 1600, clientHeight: 600 })).toBe(false)
  })

  it('keeps the list at the bottom when the keyboard shrinks it', () => {
    const box = { scrollTop: 1000, scrollHeight: 1600, clientHeight: 600 }
    const { pin, flush, timers } = harness(box)
    expect(pin.arm()).toBe(true)
    box.clientHeight = 300 // keyboard opened, scrollTop unchanged
    expect(pin.pin()).toBe(true)
    expect(box.scrollTop).toBe(1300)
    expect(pin.recentlyPinned()).toBe(true)
    expect(timers.map((timer) => timer.at)).toEqual([...KEYBOARD_PIN_DELAYS])
    box.clientHeight = 280 // animation keeps going after the first pin
    flush()
    expect(box.scrollTop).toBe(1320)
    expect(pin.recentlyPinned()).toBe(false) // echo window has passed by the last re-pin
  })

  it('leaves her reading history alone', () => {
    const box = { scrollTop: 200, scrollHeight: 1600, clientHeight: 600 }
    const { pin, flush } = harness(box)
    expect(pin.arm()).toBe(false)
    box.clientHeight = 300
    expect(pin.pin()).toBe(false)
    flush()
    expect(box.scrollTop).toBe(200)
  })

  it('keeps the first decision across a multi-step keyboard animation', () => {
    const box = { scrollTop: 1000, scrollHeight: 1600, clientHeight: 600 }
    const { pin, advance } = harness(box)
    pin.arm()
    box.clientHeight = 450 // first resize step, not pinned yet: now 150px from bottom
    advance(16)
    expect(pin.arm()).toBe(true)
    pin.pin()
    expect(box.scrollTop).toBe(1150)
  })

  it('stops pinning once she scrolls herself or the window expires', () => {
    const box = { scrollTop: 1000, scrollHeight: 1600, clientHeight: 600 }
    const { pin, flush, advance } = harness(box)
    pin.arm()
    box.clientHeight = 300
    pin.pin()
    pin.release()
    box.scrollTop = 500
    flush()
    expect(box.scrollTop).toBe(500)
    expect(pin.pin()).toBe(false)

    box.scrollTop = 1300
    pin.arm()
    advance(KEYBOARD_PIN_WINDOW_MS + 1)
    box.clientHeight = 200
    expect(pin.pin()).toBe(false)
    expect(box.scrollTop).toBe(1300)
  })
})
