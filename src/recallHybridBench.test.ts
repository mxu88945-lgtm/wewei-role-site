/**
 * v252 评测：纯线索 vs 混合（线索 + 语义向量）召回。向量用确定性假向量（fakeEmbedder.fixture.ts），只比判法。
 * - 前世记忆：v249 的 32 句评测集（18 句该想起、14 句闲聊）；
 * - 滑出窗口的原文：v251 的 10 件埋好的事 + 10 句普通闲聊（人格窗口 / 长剧情各一遍）。
 * MEASURE=1 打印明细。
 */
import { describe, expect, it, vi } from 'vitest'
import type { ChatApiMessage } from './chatApi'
import { activeThread, type PersonaMessage } from './personaWindow'
import { planPersonaRequest } from './personaWindowRuntime'
import { buildChatPrompt } from './promptBuilder'
import { foldPromptForRelay } from './promptTail'
import { EVICTED_RECALL_HEADER } from './evictedRecall'
import { HISTORY_TOKEN_BUDGET } from './historyWindow'
import { chunkScoringUnits, recallPastLife, type PastLifeChunk } from './personaPastLifeRecall'
import { runPastLifeBench } from './personaPastLifeRecallBench.test'
import { FIXTURE_NOW, fixtureCharacter, fixtureDeps, fixturePersona, fixtureUser } from './personaPromptFixture'
import { ORDINARY, PLANTED, plantedHistory } from './historyWindowBench.fixture'
import { fakeCosine } from './fakeEmbedder.fixture'

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env || {}
const log = (...args: unknown[]) => { if (env.MEASURE) console.log(...args) }
const textOf = (message: ChatApiMessage) => typeof message.content === 'string' ? message.content : message.content.map((part) => part.type === 'text' ? part.text : '').join('')
const latestUser = (history: readonly PersonaMessage[]) => [...history].reverse().find((message) => message.role === 'user')?.text || ''

/** 混合：每段都有向量（假向量），段分 = 她最新一句和段内各行单元余弦的最高值（和 semanticRuntime.scoreChunks 同口径）。 */
const hybridPastLife: typeof recallPastLife = (chunks, options) => {
  const query = latestUser(options.history)
  const semantic = new Map((chunks as PastLifeChunk[]).map((chunk) => [chunk.key, Math.max(...chunkScoringUnits(chunk).map((unit) => fakeCosine(query, unit.text)))]))
  return recallPastLife(chunks, { ...options, semantic })
}

/** 滑出窗口：向量库的片段大多是「她一句 + 他一条回复」（≤600 字），分按片段算，再落到片段里每条消息上（同 messageScores）。 */
const scoresFor = (history: PersonaMessage[]) => {
  const query = latestUser(history)
  const out = new Map<number, number>()
  const past = history.slice(0, -1)
  for (let index = 0; index < past.length; index++) {
    if (past[index].role !== 'user') continue
    const segment = [past[index], past[index + 1]].filter(Boolean)
    const score = fakeCosine(query, segment.map((message) => message.text).join('\n').slice(0, 600))
    segment.forEach((message) => out.set(message.id, score))
  }
  return out
}

function personaTail(history: PersonaMessage[], hybrid: boolean) {
  const persona = fixturePersona()
  const thread = { ...activeThread(persona), messages: history, compressedThroughId: 0, recallLedger: {} }
  const scores = scoresFor(history)
  const semantic = hybrid ? { messages: new Map<string, number>(), memories: new Map<string, number>(), chunks: new Map<string, number>(), messageScores: new Map([...scores].map(([id, score]) => [`${thread.id}|${id}`, score])) } : null
  const plan = planPersonaRequest({ ...persona, threads: [thread, ...persona.threads.slice(1)] }, history, fixtureDeps({ memoryLength: 47, historyTokenBudget: HISTORY_TOKEN_BUDGET }), thread, { semantic })
  return plan.memory.audit.lanes.find((lane) => lane.key === 'evicted')?.chars ? plan.memory.audit.lanes.find((lane) => lane.key === 'evicted')!.preview : ''
}

function storyTail(history: PersonaMessage[], hybrid: boolean) {
  const messages = history.map((message) => ({ id: message.id, createdAt: message.createdAt, role: message.role, text: message.text }))
  const prompt = foldPromptForRelay(buildChatPrompt({
    character: fixtureCharacter, user: fixtureUser, messages, preset: '', globalWorldbook: '',
    memory: { entries: [], injectPosition: 'before-chat-history', injectPrompt: '{{memories}}' },
    memoryLength: 47, cacheLayout: true, historyTokenBudget: HISTORY_TOKEN_BUDGET,
    evictedRecall: { turn: history.filter((message) => message.role === 'user').length, semantic: hybrid ? scoresFor(history) : undefined },
  }))
  const last = textOf(prompt[prompt.length - 1])
  const at = last.indexOf(EVICTED_RECALL_HEADER)
  return at < 0 ? '' : last.slice(at).split('\n\n【')[0]
}

export function evictedBench(engine: 'persona' | 'story', hybrid: boolean) {
  const tail = engine === 'persona' ? personaTail : storyTail
  let hits = 0, falsePositives = 0
  const detail: string[] = []
  for (const fact of PLANTED) {
    const ok = tail(plantedHistory(36, 500, FIXTURE_NOW, fact.ask), hybrid).includes(fact.marker)
    if (ok) hits++
    detail.push(`${ok ? '命中' : '漏召'}\t${fact.ask}`)
  }
  for (const line of ORDINARY) {
    const pulled = tail(plantedHistory(36, 500, FIXTURE_NOW, line), hybrid).length
    if (pulled) falsePositives++
    detail.push(`${pulled ? `误召 ${pulled}字` : '安静'}\t${line}`)
  }
  return { hits, misses: PLANTED.length - hits, falsePositives, detail }
}

describe('v252 混合召回评测（假向量）', () => {
  it('前世记忆：纯线索 vs 混合', () => {
    const keyword = runPastLifeBench()
    const hybrid = runPastLifeBench(hybridPastLife)
    const line = (name: string, bench: ReturnType<typeof runPastLifeBench>) => `${name}：命中 ${bench.hit}/18 漏 ${bench.miss} 跑偏 ${bench.offTarget} 误召 ${bench.falsePositive}/14`
    log(`\n${line('前世·纯线索', keyword)}\n${line('前世·混合', hybrid)}`)
    for (const row of hybrid.rows.filter((item) => item.outcome !== 'hit' && item.outcome !== 'correct-silence')) log('   混合', row.outcome, row.text)
    expect(keyword.hit).toBeGreaterThanOrEqual(17)
    // 「上次你说你怕什么来着」→「怕打雷」：混合能想起来
    expect(hybrid.rows.find((row) => row.text === '上次你说你怕什么来着')?.outcome).toBe('hit')
    expect(hybrid.hit).toBeGreaterThanOrEqual(keyword.hit)
    expect(hybrid.offTarget).toBe(0)
    expect(hybrid.falsePositive).toBe(0)
    expect(hybrid.rows.every((row) => row.chunks <= 4 && row.chars <= 1800)).toBe(true)
  })

  for (const engine of ['persona', 'story'] as const) {
    it(`滑出窗口（${engine === 'persona' ? '人格窗口' : '长剧情'}）：纯线索 vs 混合`, () => {
      vi.useFakeTimers(); vi.setSystemTime(FIXTURE_NOW)
      const keyword = evictedBench(engine, false)
      const hybrid = evictedBench(engine, true)
      log(`\n${engine} 滑出·纯线索：命中 ${keyword.hits}/10 误召 ${keyword.falsePositives}/10\n${engine} 滑出·混合：命中 ${hybrid.hits}/10 误召 ${hybrid.falsePositives}/10\n${hybrid.detail.join('\n')}`)
      expect(hybrid.hits).toBeGreaterThanOrEqual(keyword.hits)
      // 「工作好烦，不想上班」只靠一个短词「上班」对上，向量不认，不再带旧原文。
      expect(hybrid.detail).toContain('安静\t工作好烦，不想上班')
      expect(hybrid.falsePositives).toBe(0)
      vi.useRealTimers()
    })
  }

  it('向量缺席（没开 / 超时 / 还没算好）时和纯线索一模一样', () => {
    const keyword = runPastLifeBench()
    const empty = runPastLifeBench((chunks, options) => recallPastLife(chunks, { ...options, semantic: new Map() }))
    expect(empty.rows.map((row) => row.outcome)).toEqual(keyword.rows.map((row) => row.outcome))
  })
})
