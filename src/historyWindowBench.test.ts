/**
 * v251 评测：最近原文 token 封顶前后，每轮输入 token（人格窗口 / 长剧情），以及滑出窗口的事实能不能被召回。
 * MEASURE=1 npx vitest run src/historyWindowBench.test.ts 打印明细；平时只做断言，防止悄悄长回去。
 */
import { describe, expect, it, vi } from 'vitest'
import type { ChatApiMessage } from './chatApi'
import { activeThread, type PersonaMessage } from './personaWindow'
import { planPersonaRequest } from './personaWindowRuntime'
import { buildChatPrompt } from './promptBuilder'
import { foldPromptForRelay } from './promptTail'
import { estimateTokens } from './promptBudget'
import { EVICTED_RECALL_HEADER } from './evictedRecall'
import { HISTORY_TOKEN_BUDGET } from './historyWindow'
import { FIXTURE_NOW, fixtureCharacter, fixtureDeps, fixturePersona, fixtureUser } from './personaPromptFixture'
import { ORDINARY, PLANTED, longReplyHistory, plantedHistory } from './historyWindowBench.fixture'

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env || {}
const log = (...args: unknown[]) => { if (env.MEASURE) console.log(...args) }
const textOf = (message: ChatApiMessage) => typeof message.content === 'string' ? message.content : message.content.map((part) => part.type === 'text' ? part.text : '').join('')
const tokensOf = (messages: ChatApiMessage[]) => messages.reduce((sum, message) => sum + estimateTokens(textOf(message)), 0)
const MEMORY_LENGTH = 47

function personaPlan(history: PersonaMessage[], budget: number) {
  const persona = fixturePersona()
  const thread = { ...activeThread(persona), messages: history, compressedThroughId: 0, recallLedger: {} }
  const next = { ...persona, threads: [thread, ...persona.threads.slice(1)] }
  return planPersonaRequest(next, history, fixtureDeps({ memoryLength: MEMORY_LENGTH, historyTokenBudget: budget }), thread)
}

function storyPrompt(history: PersonaMessage[], budget: number, recall = true) {
  const messages = history.map((message) => ({ id: message.id, createdAt: message.createdAt, role: message.role, text: message.text }))
  return foldPromptForRelay(buildChatPrompt({
    character: fixtureCharacter, user: fixtureUser, messages, preset: '【文风】小说正文，第三人称，细腻克制。', globalWorldbook: '',
    memory: { entries: [], injectPosition: 'before-chat-history', injectPrompt: '{{memories}}' },
    memoryLength: MEMORY_LENGTH, cacheLayout: true, historyTokenBudget: budget,
    contextSummary: '她和虞山行在书院相处已久，关系稳定，最近在筹备冬至。',
    evictedRecall: recall ? { turn: history.filter((message) => message.role === 'user').length } : undefined,
  }))
}

const historyTokens = (messages: ChatApiMessage[]) => tokensOf(messages.filter((message, index) => message.role !== 'system' && index < messages.length - 1))

/**
 * v250（73bfec4）同一份夹具、同一份对话量出来的每轮输入 token（估算）：[人格窗口总, 人格历史, 长剧情总, 长剧情历史]。
 * v250 没有 token 封顶，也没有滑出提要/召回，所以「之前」只能用当时的代码量好写在这里。
 */
const V250: Record<number, [number, number, number, number]> = { 300: [22145, 7492, 13312, 7492], 500: [26633, 11980, 17800, 11980], 800: [33355, 18702, 24522, 18702] }

describe('v251 最近原文 token 封顶 · 每轮输入 token', () => {
  it('人格窗口与长剧情：300/500/800 字回复、47 条记忆长度', () => {
    vi.useFakeTimers(); vi.setSystemTime(FIXTURE_NOW)
    const rows: string[] = []
    for (const replyChars of [300, 500, 800]) {
      const history = longReplyHistory(30, replyChars, FIXTURE_NOW)
      const afterP = personaPlan(history, HISTORY_TOKEN_BUDGET).messages
      const afterS = storyPrompt(history, HISTORY_TOKEN_BUDGET)
      const [p0, ph0, s0, sh0] = V250[replyChars]
      rows.push(`人格窗口 ${replyChars}字\t总 ${p0} → ${tokensOf(afterP)}\t历史 ${ph0} → ${historyTokens(afterP)}\t条数 47 → ${afterP.length - 1}`)
      rows.push(`长剧情   ${replyChars}字\t总 ${s0} → ${tokensOf(afterS)}\t历史 ${sh0} → ${historyTokens(afterS)}\t条数 47 → ${afterS.length - 1}`)
      log(rows.slice(-2).join('\n'))
      // 历史（不含最新一句和尾巴）不超过 8200 token（估算），且至少 10 轮完整交流还在。
      expect(historyTokens(afterP)).toBeLessThanOrEqual(HISTORY_TOKEN_BUDGET)
      expect(historyTokens(afterS)).toBeLessThanOrEqual(HISTORY_TOKEN_BUDGET)
      expect(afterP.filter((message) => message.role === 'user').length).toBeGreaterThanOrEqual(10)
      expect(afterS.filter((message) => message.role === 'user').length).toBeGreaterThanOrEqual(10)
      // 长回复省下来的量；短回复（条数先到上限）只多出完整档案 + 滑出提要，控制在 2000 以内。
      if (replyChars === 300) { expect(tokensOf(afterP) - p0).toBeLessThan(2000); expect(tokensOf(afterS) - s0).toBeLessThan(2000) }
      if (replyChars === 500) { expect(tokensOf(afterP)).toBeLessThan(p0 - 1500); expect(tokensOf(afterS)).toBeLessThan(s0 - 1500) }
      if (replyChars === 800) { expect(tokensOf(afterP)).toBeLessThan(p0 - 8000); expect(tokensOf(afterS)).toBeLessThan(s0 - 8000) }
    }
    vi.useRealTimers()
  })
})

describe('v251 滑出窗口的事实 · 按需召回评测（20 轮）', () => {
  const evaluate = (engine: 'persona' | 'story') => {
    let hits = 0, misses = 0, falsePositives = 0, ordinaryExtra = 0
    const detail: string[] = []
    for (const fact of PLANTED) {
      const history = plantedHistory(36, 500, FIXTURE_NOW, fact.ask)
      const tail = engine === 'persona'
        ? (() => { const plan = personaPlan(history, HISTORY_TOKEN_BUDGET); return plan.memory.audit.lanes.find((lane) => lane.key === 'evicted')?.preview || '' })()
        : (() => { const prompt = storyPrompt(history, HISTORY_TOKEN_BUDGET); const last = textOf(prompt[prompt.length - 1]); const at = last.indexOf(EVICTED_RECALL_HEADER); return at < 0 ? '' : last.slice(at) })()
      // 这件事确实滑出了最近原文
      const sent = engine === 'persona' ? personaPlan(history, HISTORY_TOKEN_BUDGET).messages : storyPrompt(history, HISTORY_TOKEN_BUDGET)
      expect(sent.slice(1, -1).some((message) => textOf(message).includes(fact.user))).toBe(false)
      const ok = tail.includes(fact.marker)
      if (ok) hits++; else misses++
      detail.push(`${ok ? '命中' : '漏召'}\t${fact.ask}`)
    }
    for (const line of ORDINARY) {
      const history = plantedHistory(36, 500, FIXTURE_NOW, line)
      const tail = engine === 'persona'
        ? personaPlan(history, HISTORY_TOKEN_BUDGET).memory.audit.lanes.find((lane) => lane.key === 'evicted')
        : null
      const storyTail = engine === 'story' ? textOf(storyPrompt(history, HISTORY_TOKEN_BUDGET).slice(-1)[0]) : ''
      const storyRecall = storyTail.includes(EVICTED_RECALL_HEADER) ? storyTail.slice(storyTail.indexOf(EVICTED_RECALL_HEADER)).split('\n\n【上下文优先级')[0] : ''
      const pulled = engine === 'persona' ? (tail?.chars || 0) : storyRecall.length
      if (pulled) { falsePositives++; ordinaryExtra += pulled }
      detail.push(`${pulled ? `误召 ${pulled}字` : '安静'}\t${line}`)
    }
    return { hits, misses, falsePositives, ordinaryExtra, detail }
  }

  it('人格窗口', () => {
    vi.useFakeTimers(); vi.setSystemTime(FIXTURE_NOW)
    const result = evaluate('persona')
    log(`\n人格窗口召回：命中 ${result.hits}/10 漏召 ${result.misses} 误召 ${result.falsePositives}/10（多带 ${result.ordinaryExtra} 字）\n${result.detail.join('\n')}`)
    expect(result.hits).toBeGreaterThanOrEqual(8)
    expect(result.falsePositives).toBeLessThanOrEqual(1)
    vi.useRealTimers()
  })

  it('长剧情', () => {
    vi.useFakeTimers(); vi.setSystemTime(FIXTURE_NOW)
    const result = evaluate('story')
    log(`\n长剧情召回：命中 ${result.hits}/10 漏召 ${result.misses} 误召 ${result.falsePositives}/10（多带 ${result.ordinaryExtra} 字）\n${result.detail.join('\n')}`)
    expect(result.hits).toBeGreaterThanOrEqual(8)
    expect(result.falsePositives).toBeLessThanOrEqual(1)
    vi.useRealTimers()
  })
})
