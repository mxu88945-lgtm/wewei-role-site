/**
 * v252 评测：主剧情窗口（长剧情单聊）每轮输入 token 按块拆开。MEASURE=1 打印明细；平时只做断言，防止悄悄长回去。
 * 请求按 App.prepareAssistantRequest 的顺序拼：buildChatPrompt + 幕后近况 + 美化卡完整规则/尾巴提醒 + 状态栏校验，再 foldPromptForRelay。
 */
import { describe, expect, it, vi } from 'vitest'
import type { ChatApiMessage } from './chatApi'
import { buildChatPrompt, coreMemoryChunks, CORE_RECALL_HEADER } from './promptBuilder'
import { EVICTED_RECALL_HEADER } from './evictedRecall'
import { chunkScoringUnits } from './personaPastLifeRecall'
import { fakeCosine } from './fakeEmbedder.fixture'
import { foldPromptForRelay } from './promptTail'
import { estimateTokens } from './promptBudget'
import { filmCardInstruction, FILM_CARD_REMINDER } from './filmBlock'
import { getStatusProtocol } from './statusProtocol'
import { HISTORY_TOKEN_BUDGET } from './historyWindow'
import { longReplyHistory } from './historyWindowBench.fixture'
import { FIXTURE_NOW } from './personaPromptFixture'
import { storyBackstageNote, storyCharacter, storyContextSummary, storyCoreMemory, storyGlobalWorldbook, storyMemories, storyPreset, storyProjectContext, storyUser } from './storyPromptBench.fixture'

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env || {}
const log = (...args: unknown[]) => { if (env.MEASURE) console.log(...args) }
const textOf = (message: ChatApiMessage) => typeof message.content === 'string' ? message.content : message.content.map((part) => part.type === 'text' ? part.text : '').join('')
const tokensOf = (messages: ChatApiMessage[]) => messages.reduce((sum, message) => sum + estimateTokens(textOf(message)), 0)

export function storyRequest(replyChars: number, options: { budget?: number; exchanges?: number; semantic?: boolean; latest?: string } = {}) {
  const history = longReplyHistory(options.exchanges ?? 60, replyChars, FIXTURE_NOW, options.latest).map((message) => ({ id: message.id, createdAt: message.createdAt, role: message.role, text: message.role === 'assistant' ? `<scene>时间：冬夜｜地点：书院</scene>\n${message.text}\n<status>\n好感度：70\n心理：……\n身体：无碍\n关系进展：暗生情愫\n</status>` : message.text }))
  const character = { ...storyCharacter, characterMemory: storyCoreMemory(FIXTURE_NOW) }
  const status = getStatusProtocol(character)
  const raw = buildChatPrompt({
    mode: 'story', character, user: storyUser, messages: history, preset: storyPreset, globalWorldbook: storyGlobalWorldbook,
    storyProjectContext, sceneContinuityAnchor: '【最新场景锚点】冬夜戌时，藏书楼，她刚推门进来。',
    memory: { entries: storyMemories(FIXTURE_NOW), injectPosition: 'before-chat-history', injectPrompt: '{{memories}}' },
    memoryLength: 47, historyTokenBudget: options.budget ?? HISTORY_TOKEN_BUDGET, cacheLayout: true,
    contextSummary: storyContextSummary, compressedUntil: 20,
    evictedRecall: { turn: history.filter((message) => message.role === 'user').length, ...(options.semantic ? (() => {
      const query = history[history.length - 1].text
      return {
        semantic: new Map(history.map((message) => [message.id, fakeCosine(query, message.text.slice(0, 600))])),
        coreSemantic: new Map(coreMemoryChunks(character).map((chunk) => [chunk.key, Math.max(...chunkScoringUnits(chunk).map((unit) => fakeCosine(query, unit.text)))])),
      }
    })() : {}) },
  })
  raw.push({ role: 'system', content: storyBackstageNote })
  raw.push({ role: 'system', content: `【最终输出结构校验】完成正文后必须检查：回复末尾有且只有一个闭合的 <${status.tag}>...</${status.tag}>。状态栏必须按卡片顺序逐项保留字段：${status.fields.join('、')}。` })
  const firstTurn = raw.findIndex((message) => message.role !== 'system')
  raw.splice(firstTurn, 0, { role: 'system', content: filmCardInstruction(character.name, storyUser.name, true, ['晴天', '稻香', '七里香', '夜曲', '告白气球']) })
  raw.push({ role: 'system', content: FILM_CARD_REMINDER })
  return { raw, wire: foldPromptForRelay(raw) }
}

/** 按块标题（【…】）把 system 内容拆开记 token；对话轮次单独记。 */
export function blockBreakdown(raw: ChatApiMessage[]) {
  const firstTurn = raw.findIndex((message) => message.role !== 'system')
  let lastTurn = -1
  raw.forEach((message, index) => { if (message.role !== 'system') lastTurn = index })
  const rows = new Map<string, number>()
  const add = (key: string, tokens: number) => rows.set(key, (rows.get(key) || 0) + tokens)
  raw.forEach((message, index) => {
    const text = textOf(message)
    if (message.role !== 'system') { add(index === lastTurn ? '她最新一句' : '最近原文（历史）', estimateTokens(text)); return }
    const where = index < firstTurn ? '稳定' : '尾巴'
    for (const part of text.split(/\n\n(?=【)/)) {
      const head = /^【([^】｜\n]{1,16})/.exec(part)?.[1] || '（无标题）'
      add(`${where}·${head}`, estimateTokens(part))
    }
  })
  return [...rows.entries()].sort((a, b) => b[1] - a[1])
}

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
