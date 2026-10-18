import { describe, expect, it } from 'vitest'
import { DEFAULT_PHONE_AUTO, dueRunAt, isQuietHour, pickAutoGroup } from './phoneAuto'
import type { Conversation } from './conversationLifecycle'

describe('phone auto', () => {
  const on = { ...DEFAULT_PHONE_AUTO, enabled: true, intervalMinutes: 60 }
  it('runs right away the first time and waits for the interval after', () => {
    expect(dueRunAt({ ...on, lastRun: 0 }, 5000)).toBe(5000)
    expect(dueRunAt({ ...on, lastRun: 1000 }, 1000 + 30 * 60000)).toBeNull()
    expect(dueRunAt({ ...on, enabled: false }, 5000)).toBeNull()
    expect(dueRunAt({ ...on, forum: false, moments: false, groups: false }, 5000)).toBeNull()
  })
  it('catches up once, dated to the latest missed slot', () => {
    expect(dueRunAt({ ...on, lastRun: 0 + 1 }, 1 + 3.5 * 3600000)).toBe(1 + 3 * 3600000)
  })
  it('knows night hours', () => {
    expect(isQuietHour(new Date(2026, 9, 14, 3).getTime())).toBe(true)
    expect(isQuietHour(new Date(2026, 9, 14, 13).getTime())).toBe(false)
  })
  it('only picks phone groups with members', () => {
    const convs = [{ id: 'a', phone: undefined, participantIds: ['x'], messages: [] }, { id: 'b', phone: { bindings: {} }, participantIds: ['x'], messages: [] }] as unknown as Conversation[]
    expect(pickAutoGroup(convs, () => .9)?.id).toBe('b')
    expect(pickAutoGroup([], () => .5)).toBeUndefined()
  })
})
