/**
 * v253 世界书审计（长剧情）：常驻 vs 关键词各占多少、关键词扫多深、重复条目只发一次、卡自带扫描深度照办。
 * MEASURE=1 打印 v252 夹具的分项。
 */
import { describe, expect, it, vi } from 'vitest'
import type { CharacterBook, WorldBookEntry } from './characterCard'
import { activeEntries, buildChatPrompt, entryScanDepth, isSteadyLoreEntry } from './promptBuilder'
import { estimateTokens } from './promptBudget'
import { selectHistoryWindow } from './historyWindow'
import { longReplyHistory } from './historyWindowBench.fixture'
import { FIXTURE_NOW } from './personaPromptFixture'
import { storyCharacter, storyUser } from './storyPromptBench.fixture'

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env || {}
const log = (...args: unknown[]) => { if (env.MEASURE) console.log(...args) }
const lore = (id: number, keys: string[], content: string, extra: Partial<WorldBookEntry> = {}, extensions: WorldBookEntry['extensions'] = {}): WorldBookEntry => ({ id, keys, secondary_keys: [], comment: `#${id}`, content, constant: false, selective: true, insertion_order: id, enabled: true, position: 'before_char', use_regex: false, extensions, ...extra })

describe('v253 长剧情世界书', () => {
  it('夹具分项：常驻每轮都发，关键词按整段最近原文（≤47 条/≈8200 token）扫', () => {
    vi.useFakeTimers(); vi.setSystemTime(FIXTURE_NOW)
    const book = storyCharacter.characterBook!
    const steady = book.entries.filter(isSteadyLoreEntry)
    const keyed = book.entries.filter((entry) => !entry.constant)
    log(`常驻 ${steady.length} 条 = ${steady.reduce((sum, entry) => sum + estimateTokens(entry.content), 0)} token/轮；关键词 ${keyed.length} 条（每条 ≈${estimateTokens(keyed[0].content)} token）`)
    const history = longReplyHistory(60, 500, FIXTURE_NOW).map((message) => ({ ...message, text: message.role === 'assistant' ? `<scene>时间：冬夜｜地点：书院</scene>\n${message.text}` : message.text }))
    const fired = { window: new Map<number, number>(), last2: new Map<number, number>() }
    let turns = 0
    for (let end = 21; end <= history.length; end += 2) {
      const messages = history.slice(0, end)
      const window = selectHistoryWindow(messages, { text: (message) => message.text, role: (message) => message.role, maxMessages: 47, tokenBudget: 8200 })
      const texts = messages.slice(window.start).map((message) => message.text)
      turns++
      for (const entry of activeEntries(book, texts.join('\n'))) if (!entry.constant) fired.window.set(entry.id, (fired.window.get(entry.id) || 0) + 1)
      for (const entry of activeEntries(book, texts.slice(-2).join('\n'))) if (!entry.constant) fired.last2.set(entry.id, (fired.last2.get(entry.id) || 0) + 1)
    }
    for (const entry of keyed) log(`  #${entry.id} ${entry.comment}［${entry.keys.join('/')}］整段扫 ${fired.window.get(entry.id) || 0}/${turns} 轮触发；只扫最近 2 条 ${fired.last2.get(entry.id) || 0}/${turns}`)
    expect(steady.length).toBe(3)
    vi.useRealTimers()
  })

  it('同一内容的条目只发一次，常驻那份优先', () => {
    const book: CharacterBook = { name: 't', entries: [
      lore(1, ['书院'], '书院戌时落锁。'),
      lore(2, [], '书院戌时落锁。', { constant: true }),
      lore(3, ['书院'], '书院  戌时落锁。'),
      lore(4, ['书院'], '藏书楼归老周管。'),
    ] }
    expect(activeEntries(book, '去书院').map((entry) => entry.id)).toEqual([2, 4])
  })

  it('卡自带扫描深度就照办（条目优先、其次整本）；没写的照旧扫整段', () => {
    const messages = ['我们去江南吧', '好', '今天下雨', '嗯']
    const source = messages.join('\n')
    const plain: CharacterBook = { name: 't', entries: [lore(1, ['江南'], '江南水网密布。')] }
    expect(activeEntries(plain, source, messages)).toHaveLength(1)
    const bookDepth: CharacterBook = { name: 't', scan_depth: 2, entries: [lore(1, ['江南'], '江南水网密布。')] }
    expect(activeEntries(bookDepth, source, messages)).toHaveLength(0)
    expect(activeEntries(bookDepth, source)).toHaveLength(1) // 不传 messages（人格窗口自有线索扫描）不变
    const entryDepth: CharacterBook = { name: 't', scan_depth: 2, entries: [lore(1, ['江南'], '江南水网密布。', {}, { scan_depth: 4 })] }
    expect(entryScanDepth(entryDepth, entryDepth.entries[0])).toBe(4)
    expect(activeEntries(entryDepth, source, messages)).toHaveLength(1)
    const nullDepth: CharacterBook = { name: 't', entries: [lore(1, ['江南'], '江南水网密布。', {}, { scan_depth: null })] }
    expect(activeEntries(nullDepth, source, messages)).toHaveLength(1)
  })

  it('长剧情请求里卡的 scan_depth 生效', () => {
    vi.useFakeTimers(); vi.setSystemTime(FIXTURE_NOW)
    const history = [
      { role: 'user' as const, text: '想去江南看看' }, { role: 'assistant' as const, text: '好。' },
      { role: 'user' as const, text: '今天下雨了' }, { role: 'assistant' as const, text: '带伞。' }, { role: 'user' as const, text: '嗯' },
    ]
    const build = (book: CharacterBook) => buildChatPrompt({ mode: 'story', character: { ...storyCharacter, characterBook: book }, user: storyUser, messages: history, preset: '', globalWorldbook: '', memory: { entries: [], injectPosition: 'none', injectPrompt: '' }, memoryLength: 47, cacheLayout: true }).map((message) => String(message.content)).join('\n')
    expect(build({ name: 't', entries: [lore(1, ['江南'], '江南水网密布ZZ。')] })).toContain('江南水网密布ZZ')
    expect(build({ name: 't', scan_depth: 2, entries: [lore(1, ['江南'], '江南水网密布ZZ。')] })).not.toContain('江南水网密布ZZ')
    vi.useRealTimers()
  })
})
