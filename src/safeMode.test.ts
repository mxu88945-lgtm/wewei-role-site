import { describe, expect, it } from 'vitest'
import { BOOT_PENDING_KEY, noteBootOk, noteBootStart, SAFE_MODE_KEY } from './safeMode'
import { fitWithin } from './avatarThumbnail'

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) }, m } }

describe('v245 crash safety net', () => {
  it('enters safe mode after two boots that never finished', () => {
    const s = memory()
    expect(noteBootStart(s)).toBe(false)
    expect(noteBootStart(s)).toBe(false)
    expect(noteBootStart(s)).toBe(true)
    expect(s.getItem(SAFE_MODE_KEY)).toBe('1')
  })
  it('a clean run resets the counter', () => {
    const s = memory()
    noteBootStart(s); noteBootOk(s); noteBootStart(s); noteBootOk(s)
    expect(noteBootStart(s)).toBe(false)
    expect(s.getItem(SAFE_MODE_KEY)).toBeNull()
    expect(s.getItem(BOOT_PENDING_KEY)).toBe('1')
  })
  it('opening preview keeps aspect ratio and never upscales', () => {
    expect(fitWithin(3000, 4000, 640)).toEqual({ width: 480, height: 640 })
    expect(fitWithin(200, 100, 640)).toEqual({ width: 200, height: 100 })
  })
})
