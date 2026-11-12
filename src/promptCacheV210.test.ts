import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Character } from './characterCard'
import type { ChatApiMessage } from './chatApi'
import { completeChat, resetStreamOptionsMemory } from './chatApi'
import { buildChatPrompt } from './promptBuilder'
import { resetPromptCacheMemory, withPromptCache } from './promptCache'
import { foldPromptForRelay, stripTurnContext, TURN_CONTEXT_CLOSE, TURN_CONTEXT_OPEN } from './promptTail'
import { formatPromptUsage, mergeUsage, readUsage } from './promptUsage'
import { sanitizeAssistantOutput } from './outputSanitizer'
import { modelVisibleMessageText } from './modelContext'

const lore = (id: number, extra: Record<string, unknown>) => ({ id, keys: [] as string[], secondary_keys: [], comment: '', content: '', constant: false, selective: false, insertion_order: id, enabled: true, position: 'after_char', use_regex: false, extensions: {}, ...extra })

const card: Character = {
  id: 'gu', name: '顾荒', tagline: '', description: '乐队主唱。', personality: '克制。', scenario: '后台。', greeting: '', alternateGreetings: [], mesExample: '',
  creatorNotes: '', systemPrompt: '保持角色口吻。', postHistoryInstructions: '缓慢推进。', tags: [], creator: '', characterVersion: '', regexScripts: [],
  characterBook: { name: 'b', entries: [
    lore(1, { constant: true, content: '常驻：乐队叫回声。' }),
    lore(2, { keys: ['钥匙'], content: '触发：后台留了一把钥匙。' }),
    lore(3, { constant: true, content: '概率：他偶尔会哼歌。', extensions: { useProbability: true, probability: 50 } }),
    lore(4, { constant: true, content: '深度：严禁代替惟惟行动。', extensions: { position: 4, depth: 1, role: 0 } }),
  ] },
}

type Turn = { role: 'user' | 'assistant'; text: string }
const build = (messages: Turn[], extra: Partial<Parameters<typeof buildChatPrompt>[0]> = {}) => foldPromptForRelay(buildChatPrompt({
  character: card, user: { name: '惟惟', description: '主角' }, messages, preset: '预设。', globalWorldbook: '世界。',
  memory: { entries: [{ content: '核心：她怕打雷。', pinned: true, createdAt: 1 }, { content: '普通：钥匙在鼓手那里。', createdAt: 2 }, { content: '普通：昨天下雨。', createdAt: 3 }], injectPosition: 'after-main-prompt', injectPrompt: '{{memories}}' },
  memoryLength: 40, cacheLayout: true, ...extra,
}))

describe('v210 长剧情提示词缓存布局', () => {
  it('keeps the first system byte-stable across turns while triggered lore, picked memories, anchors and recall ride in the latest user turn', () => {
    const random = vi.spyOn(Math, 'random')
    random.mockReturnValue(0.1)
    const first = build([{ role: 'user', text: '你好' }], { sceneContinuityAnchor: '【最新场景锚点】排练室', semanticRecall: '【召回】旧原话一' })
    random.mockReturnValue(0.9)
    const second = build([{ role: 'user', text: '你好' }, { role: 'assistant', text: '嗯。' }, { role: 'user', text: '钥匙呢？' }], { sceneContinuityAnchor: '【最新场景锚点】走廊', semanticRecall: '【召回】旧原话二', storyProjectContext: '【剧本项目场记】第二幕' })
    random.mockRestore()
    expect(first.filter((message) => message.role === 'system')).toHaveLength(1)
    expect(second[0]).toEqual(first[0])
    const head = String(second[0].content)
    for (const piece of ['常驻：乐队叫回声。', '核心：她怕打雷。', '乐队主唱。', '预设。']) expect(head).toContain(piece)
    for (const piece of ['触发：', '概率：', '深度：', '普通：', '排练室', '走廊', '旧原话', '第二幕']) expect(head).not.toContain(piece)
    // Earlier turns go out exactly as stored.
    expect(second[1]).toEqual({ role: 'user', content: '你好' })
    expect(second[2]).toEqual({ role: 'assistant', content: '嗯。' })
    const last = String(second[second.length - 1].content)
    expect(last.startsWith(`钥匙呢？\n\n${TURN_CONTEXT_OPEN}`)).toBe(true)
    expect(last.endsWith(TURN_CONTEXT_CLOSE)).toBe(true)
    for (const piece of ['触发：后台留了一把钥匙。', '深度：严禁代替惟惟行动。', '普通：钥匙在鼓手那里。', '【最新场景锚点】走廊', '【召回】旧原话二', '【剧本项目场记】第二幕', '缓慢推进。', '【用户主角控制权']) expect(last).toContain(piece)
    expect(last).not.toContain('概率：')
    expect(stripTurnContext(last)).toBe('钥匙呢？')
  })

  it('leaves the phone prompt and the old layout untouched', () => {
    const input = { character: card, user: { name: '惟惟', description: '' }, messages: [{ role: 'user' as const, text: '钥匙' }], preset: '', globalWorldbook: '', memory: { entries: [], injectPosition: 'after-main-prompt', injectPrompt: '' }, memoryLength: 10 }
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    expect(buildChatPrompt({ ...input, mode: 'phone', cacheLayout: true })).toEqual(buildChatPrompt({ ...input, mode: 'phone' }))
    vi.restoreAllMocks()
  })

  it('memory set to 不注入 stays out of the tail too', () => {
    const out = build([{ role: 'user', text: '钥匙' }], { memory: { entries: [{ content: '普通：钥匙在鼓手那里。' }], injectPosition: 'none', injectPrompt: '' } })
    expect(JSON.stringify(out)).not.toContain('钥匙在鼓手那里')
  })
})

describe('v210 fold + Claude breakpoints', () => {
  const api = { baseUrl: 'https://relay.test/v1', modelName: 'claude-sonnet-4.5', protocol: 'openai' as const }
  afterEach(() => resetPromptCacheMemory())

  it('marks the first system and the turn right before the latest user turn', () => {
    const wire = withPromptCache(foldPromptForRelay([
      { role: 'system', content: 'S' }, { role: 'user', content: 'u1' }, { role: 'assistant', content: 'a1' }, { role: 'user', content: 'u2' }, { role: 'system', content: 'T' },
    ]), api)
    expect(wire.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(wire[0].content).toEqual([{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }])
    expect(wire[2].content).toEqual([{ type: 'text', text: 'a1', cache_control: { type: 'ephemeral' } }])
    expect(wire[3].content).toBe(`u2\n\n${TURN_CONTEXT_OPEN}\nT\n${TURN_CONTEXT_CLOSE}`)
  })

  it('strips the marker from model echoes, history and partial streams', () => {
    const echoed = `正文。\n\n${TURN_CONTEXT_OPEN}\n不该出现\n${TURN_CONTEXT_CLOSE}`
    expect(sanitizeAssistantOutput(echoed)).toBe('正文。')
    expect(modelVisibleMessageText({ role: 'user', text: echoed })).toBe('正文。')
    expect(stripTurnContext('正文。\n【本轮背')).toBe('正文。')
    expect(stripTurnContext(`正文。${TURN_CONTEXT_OPEN}写到一半`)).toBe('正文。')
  })
})

describe('v210 用量读数', () => {
  afterEach(() => { vi.unstubAllGlobals(); resetStreamOptionsMemory() })

  it('reads OpenAI, Anthropic and Gemini usage shapes', () => {
    expect(readUsage({ usage: { prompt_tokens: 12340, prompt_tokens_details: { cached_tokens: 9800 } } })).toEqual({ promptTokens: 12340, cachedTokens: 9800, cacheReported: true })
    expect(readUsage({ type: 'message_start', message: { usage: { input_tokens: 40, cache_read_input_tokens: 900, cache_creation_input_tokens: 60 } } })).toEqual({ promptTokens: 1000, cachedTokens: 900, cacheWriteTokens: 60, cacheReported: true })
    expect(readUsage({ usageMetadata: { promptTokenCount: 2000, cachedContentTokenCount: 1500 } })).toEqual({ promptTokens: 2000, cachedTokens: 1500, cacheReported: true })
    expect(readUsage({ usage: { prompt_tokens: 500, cached_content_token_count: 100 } })).toEqual({ promptTokens: 500, cachedTokens: 100, cacheReported: true })
    expect(readUsage({ choices: [] })).toBeNull()
    expect(formatPromptUsage({ promptTokens: 12340, cached: 9800, at: 1 })).toBe('最近一次：输入 12,340 tokens · 缓存命中 9,800（79%）')
    expect(formatPromptUsage({ none: true, at: 1 })).toBe('这个渠道没有返回用量信息')
  })

  it('v212: tells "no cache hit" apart from "relay does not report cache"', () => {
    expect(readUsage({ usage: { prompt_tokens: 44880 } })).toEqual({ promptTokens: 44880, cachedTokens: 0, cacheReported: false })
    expect(readUsage({ usage: { prompt_tokens: 44880, prompt_tokens_details: { cached_tokens: 0 } } })).toEqual({ promptTokens: 44880, cachedTokens: 0, cacheReported: true })
    expect(readUsage({ usage: { prompt_tokens: 44880, prompt_cache_miss_tokens: 44880 } })?.cacheReported).toBe(true)
    expect(readUsage({ usage: { input_tokens: 100, cache_creation_input_tokens: 0 } })?.cacheReported).toBe(true)
    expect(mergeUsage({ promptTokens: 10, cachedTokens: 0, cacheReported: true }, { promptTokens: 20, cachedTokens: 0, cacheReported: false })?.cacheReported).toBe(true)
    expect(mergeUsage({ promptTokens: 10, cachedTokens: 0, cacheReported: false }, { promptTokens: 20, cachedTokens: 0, cacheReported: false })?.cacheReported).toBe(false)
    expect(formatPromptUsage({ promptTokens: 44880, cached: 0, cacheReported: false, at: 1 })).toBe('最近一次：输入 44,880 tokens · 这个渠道不报缓存')
    expect(formatPromptUsage({ promptTokens: 44880, cached: 0, cacheReported: true, at: 1 })).toBe('最近一次：输入 44,880 tokens · 缓存命中 0（0%）')
    expect(formatPromptUsage({ promptTokens: 44880, cached: 0, at: 1 })).toBe('最近一次：输入 44,880 tokens · 缓存命中 0（0%）')
  })

  const base = { api: { baseUrl: 'https://relay.test/v1', apiKey: 'k', modelName: 'gemini-3.8-flash-lite' }, messages: [{ role: 'user', content: 'hi' }] as ChatApiMessage[], temperature: 1, topP: 1, maxTokens: 100, signal: new AbortController().signal }

  it('non-streaming: reports usage from the JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '好' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 80 } } }), { headers: { 'content-type': 'application/json' } })))
    const onUsage = vi.fn()
    await completeChat({ ...base, streaming: false, onDelta: () => {}, onUsage })
    expect(onUsage).toHaveBeenCalledWith({ promptTokens: 100, cachedTokens: 80, cacheReported: true })
  })

  it('streaming: asks for include_usage and reads the trailing usage chunk after finish_reason', async () => {
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return new Response([
        'data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}',
        '',
        'data: {"choices":[],"usage":{"prompt_tokens":300,"prompt_tokens_details":{"cached_tokens":240}}}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'), { headers: { 'content-type': 'text/event-stream' } })
    }))
    const usage = await new Promise((resolve) => { void completeChat({ ...base, streaming: true, onDelta: () => {}, onUsage: resolve }) })
    expect(bodies[0].stream_options).toEqual({ include_usage: true })
    expect(usage).toEqual({ promptTokens: 300, cachedTokens: 240, cacheReported: true })
  })

  it('streaming: a relay that rejects stream_options is retried without it and remembered; no usage → null', async () => {
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      bodies.push(body)
      if (body.stream_options) return new Response(JSON.stringify({ error: { message: 'Unknown parameter: stream_options' } }), { status: 400, headers: { 'content-type': 'application/json' } })
      return new Response('data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
    }))
    const first = await new Promise((resolve) => { void completeChat({ ...base, streaming: true, onDelta: () => {}, onUsage: resolve }) })
    expect(first).toBeNull()
    expect(bodies.map((body) => Boolean(body.stream_options))).toEqual([true, false])
    await new Promise((resolve) => { void completeChat({ ...base, streaming: true, onDelta: () => {}, onUsage: resolve }) })
    expect(bodies.map((body) => Boolean(body.stream_options))).toEqual([true, false, false])
  })

  it('callers without onUsage send exactly what they sent before', async () => {
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)))
      return new Response('data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}\n\n', { headers: { 'content-type': 'text/event-stream' } })
    }))
    await completeChat({ ...base, streaming: true, onDelta: () => {} })
    expect(bodies[0]).not.toHaveProperty('stream_options')
  })
})
