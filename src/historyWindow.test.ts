import { describe, expect, it } from 'vitest'
import { HISTORY_TOKEN_BUDGET, HISTORY_TRIM_MARKER, evictedRecap, selectHistoryWindow } from './historyWindow'
import { estimateTokens } from './promptBudget'
import { evictedPool, recallEvicted, EVICTED_RECALL_BUDGET } from './evictedRecall'
import { planEvictionCompression, EVICTION_COMPRESSION_TRIGGER } from './contextCompression'
import { activeThread, createPersonaWindow, type PersonaMessage } from './personaWindow'
import { buildPersonaMemoryContext, personaHistoryWindow } from './personaWindowMemory'
import { buildChatPrompt } from './promptBuilder'
import { foldPromptForRelay } from './promptTail'
import { replyText, userText } from './historyWindowBench.fixture'

type Row = { id: number; role: 'user' | 'assistant'; text: string }
const conversation = (exchanges: number, replyChars: number, extra: (index: number) => string = () => ''): Row[] => {
  const rows: Row[] = []
  for (let index = 0; index < exchanges; index++) {
    rows.push({ id: rows.length + 1, role: 'user', text: `${userText(index)}${extra(index)}` })
    rows.push({ id: rows.length + 1, role: 'assistant', text: replyText(replyChars, index) })
  }
  rows.push({ id: rows.length + 1, role: 'user', text: '今天好累，随便聊聊。' })
  return rows
}
const opts = { text: (row: Row) => row.text, role: (row: Row) => row.role }
const cost = (texts: string[]) => texts.reduce((sum, text) => sum + estimateTokens(text) + 4, 0)

describe('v251 最近原文按 token 封顶', () => {
  it('长回复时不超过 8200，且最近 10 轮完整交流都在、最新几条一字不剪', () => {
    const rows = conversation(30, 800)
    const window = selectHistoryWindow(rows, { ...opts, maxMessages: 47 })
    expect(window.tokens).toBeLessThanOrEqual(HISTORY_TOKEN_BUDGET)
    expect(cost(window.texts)).toBe(window.tokens)
    const kept = rows.slice(window.start)
    expect(kept.filter((row) => row.role === 'user').length).toBeGreaterThanOrEqual(10)
    // 最新 4 条原样
    expect(window.texts.slice(-4)).toEqual(kept.slice(-4).map((row) => row.text))
    // 只有最旧那头可能被剪，剪了的带标记、保留结尾
    window.trimmed.forEach((index) => { expect(window.texts[index].startsWith(HISTORY_TRIM_MARKER)).toBe(true); expect(kept[index].text.endsWith(window.texts[index].slice(-20))).toBe(true) })
  })

  it('10 轮本身就超预算时：剪最旧几条长回复的开头，最新 2 轮不动，总量仍守住', () => {
    const rows = conversation(12, 1500)
    const window = selectHistoryWindow(rows, { ...opts, maxMessages: 47 })
    expect(rows.slice(window.start).filter((row) => row.role === 'user').length).toBeGreaterThanOrEqual(10)
    expect(window.tokens).toBeLessThanOrEqual(HISTORY_TOKEN_BUDGET)
    expect(window.trimmed.length).toBeGreaterThan(0)
    expect(window.trimmed.every((index) => index < window.texts.length - 4)).toBe(true)
    expect(window.texts.slice(-4)).toEqual(rows.slice(-4).map((row) => row.text))
  })

  it('她的「记忆长度」仍是条数上限；短回复时按条数取满；预算 0 回到只按条数', () => {
    const rows = conversation(40, 60)
    expect(rows.length - selectHistoryWindow(rows, { ...opts, maxMessages: 47 }).start).toBe(47)
    expect(rows.length - selectHistoryWindow(rows, { ...opts, maxMessages: 12 }).start).toBe(12)
    const long = conversation(40, 800)
    expect(long.length - selectHistoryWindow(long, { ...opts, maxMessages: 47, tokenBudget: 0 }).start).toBe(47)
  })

  it('压缩提要：离窗口近的优先，装不下的写条数', () => {
    const recap = evictedRecap(Array.from({ length: 60 }, (_, index) => ({ speaker: index % 2 ? '他' : '她', text: `第${index}条 ${replyText(200, index)}` })))
    expect(recap.length).toBeLessThanOrEqual(900)
    expect(recap).toContain('第59条')
    expect(recap).toMatch(/更早 \d+ 条从略/)
  })
})

describe('v251 滑出窗口的消息不会掉进空白', () => {
  const now = new Date(2026, 10, 15, 21).getTime()
  const make = (exchanges: number, replyChars: number) => {
    const persona = createPersonaWindow('yu', now)
    const messages: PersonaMessage[] = conversation(exchanges, replyChars, (index) => `（暗记${index}号·${['琥珀', '青瓷', '松烟', '朱砂', '黛蓝', '藕荷', '鸦青', '缃色'][index % 8]}${index}）`).map((row, index) => ({ ...row, createdAt: now - (1000 - index) * 60_000 }))
    const thread = { ...activeThread(persona), messages, contextSummary: '', compressedThroughId: undefined }
    return { persona: { ...persona, threads: [thread] }, thread, messages }
  }

  it('窗口外、档案边界后的每一条：都在召回小段里（可召回），也都进了压缩提要或被计数', () => {
    const { persona, thread, messages } = make(40, 800)
    const window = personaHistoryWindow(messages, thread, 47)
    expect(window.evicted.length).toBeGreaterThan(30)
    const pool = evictedPool(window.evicted.map((message) => ({ id: message.id, role: message.role, speaker: message.role === 'user' ? '惟惟' : '虞山行', text: message.text, createdAt: message.createdAt })))
    const indexed = new Set([...pool.ids.values()].flat())
    for (const message of window.evicted) expect(indexed.has(message.id)).toBe(true)
    const memory = buildPersonaMemoryContext(persona, thread, messages, window.recent, { char: '虞山行', user: '惟惟' }, now, { evictedHandled: true })
    const recap = memory.audit.lanes.find((lane) => lane.key === 'evicted-recap')
    expect(recap?.chars || 0).toBeGreaterThan(0)
    expect(memory.stableText).toContain('刚滑出最近原文')
    // 提要在稳定区，召回不在
    expect(memory.stableText).not.toContain('按需召回｜只读')
  })

  it('点到滑出那段里的专有词就召回（最多 2 段、约 1200 字），同一段 4 轮内不重复', () => {
    const { thread, messages } = make(40, 800)
    const window = personaHistoryWindow(messages, thread, 47)
    const pool = evictedPool(window.evicted.map((message) => ({ id: message.id, role: message.role, speaker: message.role === 'user' ? '惟惟' : '虞山行', text: message.text, createdAt: message.createdAt })))
    const ask = [{ role: 'user' as const, text: '鸦青那个颜色你还喜欢吗' }]
    const first = recallEvicted(pool, { history: ask, turn: 41, ledger: {} })
    expect(first.text).toContain('鸦青')
    expect(first.chunks.length).toBeLessThanOrEqual(2)
    expect(first.text.length).toBeLessThanOrEqual(EVICTED_RECALL_BUDGET)
    const ledger = Object.fromEntries(first.keys.map((key) => [key, 41]))
    expect(recallEvicted(pool, { history: ask, turn: 42, ledger }).keys.filter((key) => first.keys.includes(key))).toEqual([])
    // 普通闲聊不拉
    expect(recallEvicted(pool, { history: [{ role: 'user', text: '晚安啦，明天见' }], turn: 41, ledger: {} }).chunks).toEqual([])
  })

  it('滑出未整理的攒到 40 条就提前整理，整理边界正好是当前原文窗口起点', () => {
    const { thread, messages } = make(40, 800)
    const window = personaHistoryWindow(messages, thread, 47)
    const start = messages.findIndex((message) => message.id === window.recent[0].id)
    const plan = planEvictionCompression(messages, { verbatimStart: start })
    expect(window.evicted.length).toBeGreaterThanOrEqual(EVICTION_COMPRESSION_TRIGGER)
    expect(plan?.targetUntil).toBe(start)
    expect(plan?.pendingMessages.length).toBe(window.evicted.length)
    // 不到 40 条不提前整理
    const few = make(16, 800)
    const fewWindow = personaHistoryWindow(few.messages, few.thread, 47)
    expect(planEvictionCompression(few.messages, { verbatimStart: few.messages.findIndex((message) => message.id === fewWindow.recent[0].id) })).toBeNull()
  })

  it('长剧情：提要在开头 system（稳定），召回只在【本轮背景】尾巴里', () => {
    const rows = conversation(30, 800, (index) => index === 3 ? '（我的车牌尾号是 K7Q9）' : '')
    rows[rows.length - 1] = { ...rows[rows.length - 1], text: '还记得我车牌尾号 K7Q9 吗' }
    const prompt = foldPromptForRelay(buildChatPrompt({
      character: { id: 'c', name: '虞山行', tagline: '', description: '', personality: '', scenario: '', greeting: '', alternateGreetings: [], mesExample: '', systemPrompt: '', postHistoryInstructions: '', creatorNotes: '', creator: '', characterVersion: '', tags: [], regexScripts: [] },
      user: { name: '惟惟', description: '' }, messages: rows, preset: '', globalWorldbook: '', memory: { entries: [], injectPosition: 'none', injectPrompt: '' },
      memoryLength: 47, cacheLayout: true, evictedRecall: { turn: 31 },
    }))
    expect(String(prompt[0].content)).toContain('刚滑出最近原文')
    expect(String(prompt[0].content)).not.toContain('按需召回｜只读')
    const last = String(prompt[prompt.length - 1].content)
    expect(last).toContain('滑出窗口的较早原文')
    expect(last).toContain('K7Q9')
  })
})
