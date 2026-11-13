import { beforeEach, describe, expect, it } from 'vitest'
import { MODEL_LIST_CACHE_KEY, MODEL_LIST_CACHE_LIMIT, readCachedModels, readPickedModel, saveCachedModels, savePickedModel } from './modelListCache'
import { clampPan, clampViewerIndex, clampViewerScale, resistedDrag, swipeTargetIndex } from './chatImageViewer'

class MemoryStorage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, String(value)) }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true })
})

describe('per-channel model list cache', () => {
  it('keeps each channel’s fetched list separately', () => {
    saveCachedModels('ch-a', [{ id: 'claude-sonnet' }, { id: 'claude-opus' }])
    saveCachedModels('ch-b', [{ id: 'gpt-5' }])
    expect(readCachedModels('ch-a').map((item) => item.id)).toEqual(['claude-sonnet', 'claude-opus'])
    expect(readCachedModels('ch-b').map((item) => item.id)).toEqual(['gpt-5'])
    expect(readCachedModels('ch-c')).toEqual([])
    expect(readCachedModels(undefined)).toEqual([])
  })

  it('refresh replaces the list, but an empty result keeps the old one', () => {
    saveCachedModels('ch-a', [{ id: 'old' }])
    saveCachedModels('ch-a', [{ id: 'new-1' }, { id: 'new-2' }])
    expect(readCachedModels('ch-a').map((item) => item.id)).toEqual(['new-1', 'new-2'])
    saveCachedModels('ch-a', [])
    expect(readCachedModels('ch-a').map((item) => item.id)).toEqual(['new-1', 'new-2'])
  })

  it('dedupes, drops junk and caps the size', () => {
    const many = Array.from({ length: MODEL_LIST_CACHE_LIMIT + 50 }, (_, i) => ({ id: `m-${i}` }))
    saveCachedModels('ch-a', [{ id: ' x ' }, { id: 'x' }, { id: '' }, ...many])
    const list = readCachedModels('ch-a')
    expect(list[0]).toEqual({ id: 'x' })
    expect(list).toHaveLength(MODEL_LIST_CACHE_LIMIT)
  })

  it('survives corrupt storage and a full quota', () => {
    localStorage.setItem(MODEL_LIST_CACHE_KEY, '{not json')
    expect(readCachedModels('ch-a')).toEqual([])
    localStorage.setItem = () => { throw new Error('QuotaExceededError') }
    expect(() => saveCachedModels('ch-a', [{ id: 'a' }])).not.toThrow()
  })

  it('remembers the chosen model per persona and channel', () => {
    savePickedModel('persona-1', 'ch-a', 'claude-opus')
    savePickedModel('persona-1', 'ch-b', 'gpt-5')
    savePickedModel('persona-2', 'ch-a', 'claude-haiku')
    expect(readPickedModel('persona-1', 'ch-a')).toBe('claude-opus')
    expect(readPickedModel('persona-1', 'ch-b')).toBe('gpt-5')
    expect(readPickedModel('persona-2', 'ch-a')).toBe('claude-haiku')
    savePickedModel('persona-1', 'ch-a', undefined)
    expect(readPickedModel('persona-1', 'ch-a')).toBeUndefined()
    expect(readPickedModel('persona-1', 'ch-b')).toBe('gpt-5')
  })
})

describe('image viewer gestures', () => {
  it('clamps index and scale', () => {
    expect(clampViewerIndex(5, 2)).toBe(1)
    expect(clampViewerIndex(-1, 2)).toBe(0)
    expect(clampViewerIndex(0, 0)).toBe(0)
    expect(clampViewerScale(9)).toBe(4)
    expect(clampViewerScale(0.2)).toBe(1)
  })

  it('pages on a long drag or a fast flick, never past the ends', () => {
    expect(swipeTargetIndex(0, 2, -120, 390, 400)).toBe(1)
    expect(swipeTargetIndex(1, 2, 120, 390, 400)).toBe(0)
    expect(swipeTargetIndex(0, 2, -30, 390, 500)).toBe(0)
    expect(swipeTargetIndex(0, 2, -40, 390, 50)).toBe(1)
    expect(swipeTargetIndex(1, 2, -200, 390, 300)).toBe(1)
    expect(resistedDrag(0, 2, 100)).toBe(30)
    expect(resistedDrag(0, 2, -100)).toBe(-100)
  })

  it('keeps a zoomed image from panning off screen', () => {
    expect(clampPan(500, 2, 390)).toBe(195)
    expect(clampPan(-500, 2, 390)).toBe(-195)
    expect(clampPan(50, 1, 390)).toBe(0)
  })
})
