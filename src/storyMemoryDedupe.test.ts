/**
 * v253 评测：长剧情三层记忆（压缩摘要 / 角色核心记忆 / 长期记忆）去重。MEASURE=1 打印明细。
 * ① v252 夹具（每份记忆内部大量重复、核心记忆 48 条只有 6 种内容）：去重前后每轮 token；
 * ② 「像真的」夹具（storyMemoryDedupe.fixture）：去重前后 token + 15 个种下的事实一个不少（在请求里，或在核心记忆按需召回池里），两处「差一点」的句子必须保留。
 */
import { describe, expect, it, vi } from 'vitest'
import type { ChatApiMessage } from './chatApi'
import { coreMemoryChunks } from './promptBuilder'
import { estimateTokens } from './promptBudget'
import { FIXTURE_NOW } from './personaPromptFixture'
import { storyCharacter } from './storyPromptBench.fixture'
import { blockBreakdown, storyRequest } from './storyPromptRequest.fixture'
import { dedupeContextSummary, dedupeCoreMemory, dedupeMemories, NEAR_MISSES, SEEDED_FACTS } from './storyMemoryDedupe.fixture'
import { CoverageIndex, dedupeAgainst } from './memoryDedupe'

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env || {}
const log = (...args: unknown[]) => { if (env.MEASURE) console.log(...args) }
const textOf = (message: ChatApiMessage) => typeof message.content === 'string' ? message.content : message.content.map((part) => part.type === 'text' ? part.text : '').join('')
const tokensOf = (messages: ChatApiMessage[]) => messages.reduce((sum, message) => sum + estimateTokens(textOf(message)), 0)
const MEMORY_BLOCKS = /核心记忆|长期记忆|压缩摘要|阶段/
const memoryTokens = (raw: ChatApiMessage[]) => blockBreakdown(raw).filter(([key]) => MEMORY_BLOCKS.test(key) && !key.includes('最终校准')).reduce((sum, [, tokens]) => sum + tokens, 0)

const LATEST = '糯米今天又偷啄了一口桂花糕，柳先生说下旬开始教我阳关三叠，你那天要不要来听？'
const realistic = (dedupe: boolean) => storyRequest(500, { latest: LATEST, coreMemory: dedupeCoreMemory(FIXTURE_NOW), memories: dedupeMemories(FIXTURE_NOW), contextSummary: dedupeContextSummary, dedupe })

describe('v253 长剧情三层记忆去重', () => {
  it('v252 夹具：每轮至少省 5000（估算），核心记忆 + 长期记忆合计至少省一半（摘要整份照发）', () => {
    vi.useFakeTimers(); vi.setSystemTime(FIXTURE_NOW)
    for (const replyChars of [300, 500, 800]) {
      const before = storyRequest(replyChars, { dedupe: false })
      const after = storyRequest(replyChars)
      log(`v252夹具 ${replyChars}字：总 ${tokensOf(before.wire)} → ${tokensOf(after.wire)}；三层记忆 ${memoryTokens(before.raw)} → ${memoryTokens(after.raw)}`)
      expect(tokensOf(after.wire)).toBeLessThan(tokensOf(before.wire) - 5000)
      const nonSummary = (raw: ChatApiMessage[]) => memoryTokens(raw) - (new Map(blockBreakdown(raw)).get('稳定·较早对话压缩摘要') || 0)
      expect(nonSummary(after.raw)).toBeLessThan(nonSummary(before.raw) / 2)
      expect(new Map(blockBreakdown(after.raw)).get('稳定·较早对话压缩摘要')).toBe(new Map(blockBreakdown(before.raw)).get('稳定·较早对话压缩摘要'))
    }
    vi.useRealTimers()
  })

  it('像真的夹具：15 个事实一个不少，差一点的句子保留，token 变少', () => {
    vi.useFakeTimers(); vi.setSystemTime(FIXTURE_NOW)
    const before = realistic(false)
    const after = realistic(true)
    const recallPool = coreMemoryChunks({ ...storyCharacter, characterMemory: dedupeCoreMemory(FIXTURE_NOW) }, dedupeContextSummary).map((chunk) => chunk.text).join('\n')
    const beforeText = before.wire.map(textOf).join('\n')
    const afterText = after.wire.map(textOf).join('\n')
    log(`\n像真的夹具：总 ${tokensOf(before.wire)} → ${tokensOf(after.wire)}；三层记忆 ${memoryTokens(before.raw)} → ${memoryTokens(after.raw)}`)
    for (const [key, tokens] of blockBreakdown(after.raw).filter(([key]) => MEMORY_BLOCKS.test(key))) log(`  ${String(tokens).padStart(6)}  ${key}（去重前 ${new Map(blockBreakdown(before.raw)).get(key) ?? 0}）`)
    if (env.MEASURE) { const s = textOf(after.wire[0]); log(s.slice(s.indexOf('【本会话角色核心记忆'), s.indexOf('使用规则'))); const t = textOf(after.wire[after.wire.length - 1]); log(t.slice(t.indexOf('【长期记忆'), t.indexOf('【', t.indexOf('【长期记忆') + 300))); log(s.slice(s.indexOf('【长期记忆'), s.indexOf('【较早对话压缩摘要'))) }
    const missing: string[] = []
    for (const [key, fact] of SEEDED_FACTS) {
      expect(beforeText, `去重前就该有：${fact}`).toContain(key)
      const inRequest = afterText.includes(key)
      log(`  ${inRequest ? '在请求里' : recallPool.includes(key) ? '可召回' : '丢了！'}  ${fact}`)
      if (!inRequest && !recallPool.includes(key)) missing.push(fact)
    }
    expect(missing).toEqual([])
    for (const phrase of NEAR_MISSES) expect(afterText, phrase).toContain(phrase)
    expect(tokensOf(after.wire)).toBeLessThan(tokensOf(before.wire))
    vi.useRealTimers()
  })

  it('判法：换一个字、多一个否定、换个数字都不算重复；整句照抄、拆成几段照抄算重复', () => {
    const index = new CoverageIndex('他答应冬至那天带她下山看灯，已经和老周说好替他守藏书楼。琴谱最后一次出现在西厢第三格书架。')
    expect(index.covers('他答应冬至那天带她下山看灯，已经和老周说好替他守藏书楼。')).toBe(true)
    expect(index.covers('他答应冬至那天带她下山看灯。')).toBe(true)
    expect(index.covers('他没答应冬至那天带她下山看灯。')).toBe(false)
    expect(index.covers('他答应冬至前夜带她下山看灯。')).toBe(false)
    expect(index.covers('琴谱最后一次出现在西厢第四格书架。')).toBe(false)
    expect(index.covers('林栖答应冬至那天带她下山看灯。')).toBe(false)
    expect(index.covers('下山看灯。')).toBe(false) // 太短不判
    const { text } = dedupeAgainst('【冬至】\n- 冬月二十九：他答应冬至那天带她下山看灯，已经和老周说好替他守藏书楼。她很高兴。\n- 冬月三十：琴谱最后一次出现在西厢第三格书架。', index)
    // 时间点没在上文出现过：留「时间 + 正文开头 14 字…」指针，时间点不丢。
    expect(text).toBe('【冬至】\n- 冬月二十九：她很高兴。\n- 冬月三十：琴谱最后一次出现在西厢第三格…')
    const known = new CoverageIndex('冬月三十：琴谱最后一次出现在西厢第三格书架。')
    expect(dedupeAgainst('- 冬月三十：琴谱最后一次出现在西厢第三格书架。', known).text).toBe('')
  })
})
