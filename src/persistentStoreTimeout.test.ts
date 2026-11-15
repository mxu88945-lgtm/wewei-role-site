import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DB_OPEN_TIMEOUT_MS, durableGet, durableSet } from './persistentStore'

describe('IndexedDB never wedges the save queue (v250)', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('an open that hangs is abandoned after the cap and a fresh connection is used', async () => {
    const realOpen = indexedDB.open.bind(indexedDB)
    let calls = 0
    vi.spyOn(indexedDB, 'open').mockImplementation((...args: Parameters<typeof indexedDB.open>) => {
      calls++
      // First open never answers (what iOS sometimes does after the app was backgrounded).
      if (calls === 1) return {} as IDBOpenDBRequest
      return realOpen(...args)
    })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const saving = durableSet('weijing.test-timeout', { ok: 1 })
    await vi.advanceTimersByTimeAsync(DB_OPEN_TIMEOUT_MS + 10)
    vi.useRealTimers()
    await saving
    expect(calls).toBeGreaterThanOrEqual(2)
    expect(await durableGet('weijing.test-timeout')).toEqual({ ok: 1 })
  })

  it('a failed save does not block the next save of the same key', async () => {
    let fail = true
    const realOpen = indexedDB.open.bind(indexedDB)
    vi.spyOn(indexedDB, 'open').mockImplementation((...args: Parameters<typeof indexedDB.open>) => {
      if (fail) { const request = {} as IDBOpenDBRequest & { error: Error }; Object.assign(request, { error: new Error('boom') }); queueMicrotask(() => request.onerror?.(new Event('error'))); return request }
      return realOpen(...args)
    })
    await expect(durableSet('weijing.test-queue', 1)).rejects.toBeTruthy()
    fail = false
    await durableSet('weijing.test-queue', 2)
    expect(await durableGet('weijing.test-queue')).toBe(2)
  })
})
