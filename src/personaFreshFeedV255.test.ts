import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { collectFreshFeed, FRESH_FEED_MAX_CHARS, normalizePersonaState } from './personaWindow'
import { personaLoreChunks, personaTriggerableLore } from './personaWindowRuntime'
import { loreKey } from './promptBuilder'
import type { Conversation } from './conversationLifecycle'

const now = 1_800_000_000_000
const him = { id: 'c1', name: '顾廷深' }
const pal = { id: 'c2', name: '沈知意' }
const group = (messages: Conversation['messages'], extra: Partial<Conversation> = {}): Conversation => ({
  id: 'g1', title: '相亲相爱一家人', kind: 'group', characterId: 'c1', participantIds: ['c1', 'c2'], messages, updatedAt: now - 1000,
  phone: { dm: false } as Conversation['phone'], ...extra,
} as Conversation)

describe('v255 新动态', () => {
  it('pushes only unseen messages once, then the cursor moves past them', () => {
    const conv = group([
      { id: now - 3 * 3600_000, role: 'user', text: '今晚吃火锅吗' },
      { id: now - 3 * 3600_000 + 1, role: 'assistant', characterId: 'c2', text: '我要毛肚' },
      { id: now - 3 * 3600_000 + 2, role: 'assistant', characterId: 'c1', text: '我订位' },
    ])
    const first = collectFreshFeed({ character: him, characters: [him, pal], conversations: [conv], userName: '惟惟', now })
    expect(first.text).toContain('【新动态')
    expect(first.text).toContain('惟惟：今晚吃火锅吗')
    expect(first.text).toContain('沈知意：我要毛肚')
    expect(first.text).toContain('顾廷深：我订位')
    expect(first.count).toBe(3)
    const second = collectFreshFeed({ character: him, characters: [him, pal], conversations: [conv], userName: '惟惟', now, cursor: first.cursor })
    expect(second.text).toBe('')
    const more = group([...conv.messages, { id: now - 10, role: 'user', text: '定在七点' }])
    const third = collectFreshFeed({ character: him, characters: [him, pal], conversations: [more], userName: '惟惟', now, cursor: first.cursor })
    expect(third.count).toBe(1)
    expect(third.text).toContain('定在七点')
    expect(third.text).not.toContain('毛肚')
  })

  it('first look only covers the last 6 hours; skips notices, errors and pending placeholders', () => {
    const conv = group([
      { id: now - 30 * 3600_000, role: 'user', text: '很久以前' },
      { id: now - 60_000, role: 'assistant', characterId: 'c2', text: '更新提醒', phoneNotice: true },
      { id: now - 50_000, role: 'assistant', characterId: 'c2', text: '失败了', finishReason: 'error' },
      { id: now - 40_000, role: 'assistant', characterId: 'c1', text: '正在回应…' },
      { id: now - 30_000, role: 'user', text: '在吗' },
    ])
    const feed = collectFreshFeed({ character: him, characters: [him, pal], conversations: [conv], userName: '惟惟', now })
    expect(feed.text).toContain('在吗')
    expect(feed.text).not.toMatch(/很久以前|更新提醒|失败了|正在回应/)
  })

  it('stays within the char cap and ignores stale unbound conversations unless bound', () => {
    const long = group(Array.from({ length: 40 }, (_, i) => ({ id: now - 100_000 + i, role: 'user' as const, text: '长'.repeat(150) })))
    const feed = collectFreshFeed({ character: him, characters: [him, pal], conversations: [long], userName: '惟惟', now })
    expect(feed.text.length).toBeLessThanOrEqual(FRESH_FEED_MAX_CHARS + 200)
    expect(feed.omitted).toBeGreaterThan(0)
    const stale = group([{ id: now - 100, role: 'user', text: '老群新话' }], { updatedAt: now - 3 * 86400_000 })
    expect(collectFreshFeed({ character: him, characters: [him], conversations: [stale], now }).text).toBe('')
    expect(collectFreshFeed({ character: him, characters: [him], conversations: [stale], now, boundGroupIds: ['g1'] }).text).toContain('老群新话')
  })

  it('cursor survives a reload', () => {
    const state = normalizePersonaState({ personas: [{ id: 'p1', characterId: 'c1', threads: [{ id: 't1', title: 'x', messages: [], feedCursor: { g1: 123, bad: 'x' } }] }] })
    expect(state.personas[0].threads[0].feedCursor).toEqual({ g1: 123 })
  })
})

describe('v255 人格窗口世界书语义触发', () => {
  it('only triggerable entries become semantic chunks keyed by loreKey', () => {
    const base = { enabled: true, keys: ['云顶'], insertion_order: 1, extensions: {}, comment: '云顶山庄', position: 'before_char' }
    const book = { entries: [
      { ...base, content: '云顶山庄在城北半山腰。', constant: false },
      { ...base, content: '他本人常驻', constant: true },
      { ...base, content: '概率条', constant: false, extensions: { useProbability: true, probability: 30 } },
    ] } as never
    const chunks = personaLoreChunks(book)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].key).toBe(loreKey(personaTriggerableLore(book)[0]))
    expect(chunks[0].text).toContain('云顶山庄在城北')
  })

  it('semantic runtime scores lore chunks; planner merges keyword and semantic hits', () => {
    const runtime = readFileSync(new URL('./semanticRuntime.ts', import.meta.url), 'utf8')
    expect(runtime).toContain('...(input.pools.lore || [])')
    const planner = readFileSync(new URL('./personaWindowRuntime.ts', import.meta.url), 'utf8')
    expect(planner).toContain('LORE_SEMANTIC_MIN')
    expect(planner).toMatch(/\['fresh-feed'/)
  })
})

describe('v255 启动秒开', () => {
  it('hashed assets are cache-first and the shell falls back to cache after a short wait', () => {
    const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
    expect(sw).toMatch(/weijing-shell-v2\d\d/)
    expect(sw).toMatch(/isHashedAsset\(url\)[\s\S]*caches\.match\(request\)[\s\S]*if \(cached\) return cached/)
    expect(sw).toContain('SHELL_NETWORK_WAIT_MS = 1500')
  })
})
