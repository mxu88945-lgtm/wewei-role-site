/**
 * v252 评测：主剧情窗口（长剧情单聊）每轮输入 token 按块拆开。MEASURE=1 打印明细；平时只做断言，防止悄悄长回去。
 * 请求按 App.prepareAssistantRequest 的顺序拼：buildChatPrompt + 幕后近况 + 美化卡完整规则/尾巴提醒 + 状态栏校验，再 foldPromptForRelay。
 */
import { describe, expect, it, vi } from 'vitest'
import type { ChatApiMessage } from './chatApi'
import { CORE_RECALL_HEADER } from './promptBuilder'
import { EVICTED_RECALL_HEADER } from './evictedRecall'
import { estimateTokens } from './promptBudget'
import { HISTORY_TOKEN_BUDGET } from './historyWindow'
import { FIXTURE_NOW } from './personaPromptFixture'
import { blockBreakdown, storyRequest } from './storyPromptRequest.fixture'

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env || {}
const log = (...args: unknown[]) => { if (env.MEASURE) console.log(...args) }
const textOf = (message: ChatApiMessage) => typeof message.content === 'string' ? message.content : message.content.map((part) => part.type === 'text' ? part.text : '').join('')
const tokensOf = (messages: ChatApiMessage[]) => messages.reduce((sum, message) => sum + estimateTokens(textOf(message)), 0)

/** v251（acecaad）同一夹具、同一份对话量出来的每轮输入 token（估算），改动前基线。 */
const V251: Record<number, number> = { 300: 51430, 500: 51448, 800: 51079 }

describe('v252 主剧情窗口 · 每轮输入 token 分块', () => {
  it('300/500/800 字回复、60 轮长会话', () => {
    vi.useFakeTimers(); vi.setSystemTime(FIXTURE_NOW)
    for (const replyChars of [300, 500, 800]) {
      const { raw, wire } = storyRequest(replyChars)
      const total = tokensOf(wire)
      log(`\n主剧情 ${replyChars}字：总 ${V251[replyChars]} → ${total}（${wire.length} 条消息）`)
      for (const [key, tokens] of blockBreakdown(raw)) log(`  ${String(tokens).padStart(6)}  ${key}`)
      // 核心记忆不再整份 12000 字每轮重发、普通记忆按最新一轮挑、尾巴重复规则只留一句：每轮至少省 7000（估算）。
      expect(total).toBeLessThan(V251[replyChars] - 7000)
      const breakdown = new Map(blockBreakdown(raw))
      expect(breakdown.get('稳定·本会话角色核心记忆') || 0).toBeLessThan(6000)
      expect(breakdown.get('最近原文（历史）') || 0).toBeLessThanOrEqual(HISTORY_TOKEN_BUDGET)
    }
    vi.useRealTimers()
  })

  it('语义召回开着（假向量）：普通的一句不额外带滑出原文或核心记忆原文', () => {
    vi.useFakeTimers(); vi.setSystemTime(FIXTURE_NOW)
    const off = storyRequest(500, { latest: '晚安啦，明天见' })
    const on = storyRequest(500, { semantic: true, latest: '晚安啦，明天见' })
    const tail = (wire: ChatApiMessage[]) => textOf(wire[wire.length - 1])
    log(`\n主剧情 500字 纯线索 ${tokensOf(off.wire)} / 混合 ${tokensOf(on.wire)}`)
    expect(tail(on.wire)).not.toContain(EVICTED_RECALL_HEADER)
    expect(tail(on.wire)).not.toContain(CORE_RECALL_HEADER)
    expect(tokensOf(on.wire)).toBeLessThanOrEqual(tokensOf(off.wire))
    vi.useRealTimers()
  })
})
