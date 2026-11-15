import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COMPRESSION_FAILURE_KEY, COMPRESSION_FAILURE_LIMIT, loadCompressionFailures, normalizeCompressionFailures, saveCompressionFailures } from './personaCompressionFailureStore'

const memory = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) }, removeItem: (key: string) => { memory.delete(key) }, key: () => null, length: 0, clear: () => memory.clear() })

const NOW = 1_800_000_000_000
beforeEach(() => memory.clear())

describe('v249 连续性档案失败记录持久化', () => {
  it('survives a reload: what is saved is read back, so the 30-minute cooldown still holds', () => {
    saveCompressionFailures({ t1: { at: NOW - 60_000, message: 'HTTP 502' } }, NOW)
    expect(memory.has(COMPRESSION_FAILURE_KEY)).toBe(true)
    expect(loadCompressionFailures(NOW)).toEqual({ t1: { at: NOW - 60_000, message: 'HTTP 502' } })
  })

  it('clearing the last failure removes the key', () => {
    saveCompressionFailures({ t1: { at: NOW, message: 'x' } }, NOW)
    saveCompressionFailures({}, NOW)
    expect(memory.has(COMPRESSION_FAILURE_KEY)).toBe(false)
  })

  it('keeps it small: newest 20 windows, reasons clipped to 120 chars, day-old and junk rows dropped', () => {
    const many = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`t${index}`, { at: NOW - index * 1000, message: '错'.repeat(300) }]))
    const kept = normalizeCompressionFailures({ ...many, old: { at: NOW - 2 * 86400_000, message: 'old' }, bad: { at: 'x' }, nil: null }, NOW)
    expect(Object.keys(kept)).toHaveLength(COMPRESSION_FAILURE_LIMIT)
    expect(kept.t0.message).toHaveLength(120)
    expect(kept).not.toHaveProperty('t25')
    expect(kept).not.toHaveProperty('old')
    expect(kept).not.toHaveProperty('bad')
  })

  it('a corrupt value reads as empty instead of throwing', () => {
    memory.set(COMPRESSION_FAILURE_KEY, '{not json')
    expect(loadCompressionFailures(NOW)).toEqual({})
    memory.set(COMPRESSION_FAILURE_KEY, '[1,2]')
    expect(loadCompressionFailures(NOW)).toEqual({})
  })
})
