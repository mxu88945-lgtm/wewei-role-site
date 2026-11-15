/**
 * v254 长剧情世界书：常驻里的世界/地点/配角条目只留一行摘要，提到（关键词/标题/语义）才附全文、粘滞 3 轮；
 * 关键词默认只扫最近 4 条。守护：他本人、规则类、短条目、小世界书照旧整条；被提到时条目全文一个字不少。
 * MEASURE=1 打印省下的量。
 */
import { describe, expect, it, vi } from 'vitest'
import type { CharacterBook, WorldBookEntry } from './characterCard'
import { buildChatPrompt, LORE_STICKY_TURNS, loreKey, planStoryLore, storyLoreChunks, storyLoreSummarized } from './promptBuilder'
import { estimateTokens } from './promptBudget'
import { FIXTURE_NOW } from './personaPromptFixture'
import { storyCharacter, storyUser } from './storyPromptBench.fixture'

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env || {}
const log = (...args: unknown[]) => { if (env.MEASURE) console.log(...args) }
const lore = (id: number, comment: string, keys: string[], content: string, extra: Partial<WorldBookEntry> = {}, extensions: WorldBookEntry['extensions'] = {}): WorldBookEntry => ({ id, keys, secondary_keys: [], comment, content, constant: false, selective: false, insertion_order: id, enabled: true, position: 'before_char', use_regex: false, extensions, ...extra })
const long = (head: string, fact: string) => `${head}。${fact}。${'城中旧事层层叠叠，街巷与人情都有来历，'.repeat(30)}末句保留：${fact}。`

const name = '虞山行'
const book: CharacterBook = { name: 't', entries: [
  lore(1, '虞山行本人', [name], long('虞山行左手有旧伤', '雨天会疼却从不说'), { constant: true }),
  lore(2, '输出规则', [], long('每轮结尾输出状态栏', '字段不得省略'), { constant: true }),
  lore(3, '临江书院', ['书院'], long('临江书院建在江心洲上', '戌时落锁、藏书楼归老周管'), { constant: true }),
  lore(4, '北境军', ['北境', '军中'], long('北境军驻在雁回关', '主帅姓沈、冬天最难熬'), { constant: true }),
  lore(5, '江南盐商', ['盐商', '扬州'], long('江南盐商以扬州为首', '沈家与盐帮有旧怨'), { constant: true }),
  lore(6, '短条目', ['短'], '天下分十三州。', { constant: true }),
  lore(7, '老周', ['老周'], '老周是书院看门人，瘸一条腿。'),
  lore(8, '雁回关', ['雁回关'], '雁回关常年积雪。'),
] }
const byId = (id: number) => book.entries.find((entry) => entry.id === id)!

describe('v254 长剧情世界书：摘要常驻 + 提到才附全文', () => {
  it('哪些改摘要：世界/地点/势力改；他本人、规则、短条目照旧整条', () => {
    const ids = [...storyLoreSummarized(book, name)].map((entry) => entry.id).sort()
    expect(ids).toEqual([3, 4, 5])
    const small: CharacterBook = { name: 's', entries: [lore(3, '临江书院', ['书院'], '临江书院建在江心洲上。'.repeat(20), { constant: true })] }
    expect(storyLoreSummarized(small, name).size).toBe(0) // 常驻部分 ≤2500 字的整本不动
    const anonymous: CharacterBook = { name: 'a', entries: [...book.entries.filter((entry) => entry.constant), lore(9, '', [], long('无名条目', '没有关键词也没有标题'), { constant: true })] }
    expect([...storyLoreSummarized(anonymous, name)].map((entry) => entry.id)).not.toContain(9) // 召回不到的不摘
  })

  it('没提到：稳定区只有一行摘要；提到标题/关键词：本轮附全文，一字不少', () => {
    const quiet = planStoryLore(book, { messages: ['今天天气好', '嗯。', '去散步吧'], name, turn: 3, ledger: {} })
    const stableText = quiet.stable.map((entry) => entry.content).join('\n')
    expect(stableText).toContain('〔世界书·临江书院〕')
    expect(stableText).not.toContain('戌时落锁')
    expect(stableText).toContain('雨天会疼却从不说') // 他本人整条
    expect(stableText).toContain('字段不得省略') // 规则整条
    expect(quiet.turn).toHaveLength(0)
    const mention = planStoryLore(book, { messages: ['今天天气好', '嗯。', '我想去扬州看看'], name, turn: 4, ledger: {} })
    expect(mention.turn.map((entry) => entry.id)).toEqual([5])
    expect(mention.turn[0].content).toBe(byId(5).content)
    expect(mention.keys).toEqual([loreKey(byId(5))])
    // 稳定区和没提到时逐字一样（缓存不动）
    expect(mention.stable.map((entry) => entry.content)).toEqual(quiet.stable.map((entry) => entry.content))
  })

  it('关键词默认只扫最近 4 条；粘滞 3 轮；卡写了扫描深度照卡', () => {
    const messages = ['老周今天又骂人了', '是吗', '嗯', '后来呢', '没了']
    expect(planStoryLore(book, { messages, name, turn: 9 }).turn.map((entry) => entry.id)).toEqual([])
    const deep = { ...book, scan_depth: 6 }
    expect(planStoryLore(deep, { messages, name, turn: 9 }).turn.map((entry) => entry.id)).toEqual([7])
    const ledger = { [loreKey(byId(7))]: 6, [loreKey(byId(3))]: 6 }
    for (let turn = 7; turn <= 6 + LORE_STICKY_TURNS; turn++) {
      const plan = planStoryLore(book, { messages, name, turn, ledger })
      expect(plan.turn.map((entry) => entry.id)).toEqual([3, 7])
      expect(plan.keys).toEqual([]) // 只靠粘滞的不续期
    }
    expect(planStoryLore(book, { messages, name, turn: 7 + LORE_STICKY_TURNS, ledger }).turn).toHaveLength(0)
  })

  it('语义相近也能带出全文（≥0.72）', () => {
    const messages = ['边关冬天是不是很冷']
    const key = loreKey(byId(4))
    expect(planStoryLore(book, { messages, name, turn: 2, semantic: new Map([[key, 0.6]]) }).turn).toHaveLength(0)
    expect(planStoryLore(book, { messages, name, turn: 2, semantic: new Map([[key, 0.8]]) }).turn.map((entry) => entry.id)).toEqual([4])
    expect(storyLoreChunks(book, name).map((chunk) => chunk.key).sort()).toEqual([3, 4, 5].map((id) => loreKey(byId(id))).sort())
  })

  it('整条请求：稳定前缀两轮一样；提到的条目全文在本轮背景；回退开关恢复 v253', () => {
    vi.useFakeTimers(); vi.setSystemTime(FIXTURE_NOW)
    const run = (last: string, loreIndex?: boolean) => buildChatPrompt({ mode: 'story', character: { ...storyCharacter, characterBook: book }, user: storyUser, messages: [{ role: 'user', text: '早' }, { role: 'assistant', text: '早。' }, { role: 'user', text: last }], preset: '', globalWorldbook: '', memory: { entries: [], injectPosition: 'none', injectPrompt: '' }, memoryLength: 47, cacheLayout: true, loreIndex, evictedRecall: { turn: 2, ledger: {} } })
    const a = run('今天做什么')
    const b = run('去书院找老周')
    expect(a[0].content).toBe(b[0].content)
    const tail = b.map((message) => String(message.content)).join('\n')
    expect(tail).toContain('【本轮触发的世界书】')
    expect(tail).toContain('戌时落锁、藏书楼归老周管')
    expect(tail).toContain('老周是书院看门人')
    const before = run('今天做什么', false).map((message) => String(message.content)).join('\n')
    const after = a.map((message) => String(message.content)).join('\n')
    expect(before).toContain('主帅姓沈、冬天最难熬')
    expect(after).not.toContain('主帅姓沈、冬天最难熬')
    log(`v254 夹具：没提到时世界书 ${estimateTokens(before) - estimateTokens(after)} token/轮更少（整条请求 ${estimateTokens(before)} → ${estimateTokens(after)}）`)
    vi.useRealTimers()
  })
})
