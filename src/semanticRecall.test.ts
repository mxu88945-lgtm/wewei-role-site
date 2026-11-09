import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAllSegments, segmentConversation, segmentKey, segmentTextOf, SEG_MAX_CHARS, type SegmentConversation, type SegmentMessage } from './semanticSegments'
import { idbVectorStore, normalize, type VectorRecord, type VectorStore } from './semanticVectorDb'
import { backoffFor, INDEX_BACKOFF_MS, INDEX_BATCH_SIZE, isTransientError, runIndexPass, TRANSIENT_BACKOFF_MS } from './semanticIndex'
import { renderSemanticRecall, selectTurnHits, semanticQueryText, semanticSearch, SemanticTimeoutError, topSemantic, type SemanticHit } from './semanticRecall'
import { embedTexts, SILICONFLOW_BASE_URL } from './semanticEmbeddings'
import {
  getSemanticState,
  isSemanticReady,
  refreshSemanticCounts,
  registerSemanticSources,
  resetSemanticRuntimeForTest,
  scheduleSemanticIndex,
  semanticRecallForConversation,
  SEMANTIC_CONFIG_KEY,
  updateSemanticConfig,
} from './semanticRuntime'
import { buildChatPrompt } from './promptBuilder'
import type { ApiChannel } from './apiChannels'

class MapStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(key: string) { return this.data.get(key) ?? null }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  removeItem(key: string) { this.data.delete(key) }
  setItem(key: string, value: string) { this.data.set(key, String(value)) }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MapStorage(), configurable: true })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const m = (id: number, role: 'user' | 'assistant', text: string): SegmentMessage => ({ id, role, text })

function rec(key: string, vec: number[], conversationId: string, msgIds: number[], text = ''): VectorRecord {
  return { key, model: 'm', conversationId, dim: vec.length, vec: normalize(vec), text, msgIds, createdAt: 0 }
}

function memStore(initial: VectorRecord[] = []): VectorStore & { data: Map<string, VectorRecord> } {
  const data = new Map(initial.map((r) => [r.key, r]))
  return {
    data,
    keys: async () => new Set(data.keys()),
    forConversation: async (model, conversationId) => [...data.values()].filter((r) => r.model === model && r.conversationId === conversationId),
    put: async (rs) => rs.forEach((r) => data.set(r.key, r)),
    remove: async (ks) => ks.forEach((k) => data.delete(k)),
    clear: async () => data.clear(),
  }
}

const channel: ApiChannel = { id: 'sf', name: '硅基流动', platform: 'custom-openai', protocol: 'openai', baseUrl: 'https://api.siliconflow.cn/v1', apiKey: 'sk-test', modelName: 'x', maxTokenField: 'auto' }

/* ---------------- 切片 ---------------- */

describe('segmentConversation', () => {
  it('groups 2–4 adjacent messages, skips tiny/notice/status-only text, leaves the unfinished tail', () => {
    const long = '她今天说了很多关于工作室和小鸡的事情'.repeat(10)
    const conv: SegmentConversation = { id: 'c1', messages: [
      m(1, 'user', long), m(2, 'assistant', long),
      m(3, 'user', '短'),
      { id: 4, role: 'assistant', text: '群里小字', phoneNotice: true },
      m(5, 'user', '我们去看海吧'), m(6, 'assistant', '好呀<status>心情：好</status>'), m(7, 'user', '明天'), m(8, 'assistant', '嗯嗯'),
      m(9, 'user', '尾巴还没聊完'),
    ] }
    const segs = segmentConversation(conv, 'm')
    expect(segs.map((s) => s.msgIds)).toEqual([[1, 2], [5, 6, 7, 8]])
    expect(segs[1].text).toBe('她：我们去看海吧\n他：好呀\n她：明天\n他：嗯嗯')
    expect(segs.every((s) => s.conversationId === 'c1')).toBe(true)
  })

  it('never lets a multi-message segment grow far past 600 chars', () => {
    const t = '字'.repeat(250)
    const segs = segmentConversation({ id: 'c', messages: [m(1, 'user', t), m(2, 'assistant', t), m(3, 'user', t), m(4, 'assistant', t)] }, 'm')
    for (const s of segs) expect(s.text.length).toBeLessThanOrEqual(SEG_MAX_CHARS + 20)
  })

  it('earlier segment keys stay stable when new messages arrive', () => {
    const base = [m(1, 'user', '一起去看海'), m(2, 'assistant', '好呀'), m(3, 'user', '带上相机'), m(4, 'assistant', '嗯嗯'), m(5, 'user', '还要')]
    const a = segmentConversation({ id: 'c', messages: base }, 'm')
    const b = segmentConversation({ id: 'c', messages: [...base, m(6, 'user', '还有零食'), m(7, 'assistant', '记下了'), m(8, 'user', '出发')] }, 'm')
    expect(a.map((s) => s.msgIds)).toEqual([[1, 2, 3, 4]])
    expect(b[0].key).toBe(a[0].key)
    expect(b.map((s) => s.msgIds)).toEqual([[1, 2, 3, 4], [5, 6, 7, 8]])
  })

  it('same text in two conversations gets two keys (never shared across conversations)', () => {
    const msgs = [m(1, 'user', '一起去看海'), m(2, 'assistant', '好的呀'), m(3, 'user', '带上相机'), m(4, 'assistant', '记下了')]
    const all = buildAllSegments([{ id: 'a', messages: msgs }, { id: 'b', messages: msgs }], 'm')
    expect(all).toHaveLength(2)
    expect(new Set(all.map((s) => s.key)).size).toBe(2)
    expect(segmentKey('m', 'a', 'x')).not.toBe(segmentKey('m', 'b', 'x'))
    expect(segmentKey('m', 'a', 'x')).not.toBe(segmentKey('m2', 'a', 'x'))
  })
})

/* ---------------- 增量索引 ---------------- */

describe('runIndexPass', () => {
  const segs = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, conversationId: 'c', text: `t${i}`, msgIds: [i] }))

  it('embeds only missing keys, in batches of ≤32 with gaps, then prunes stale', async () => {
    const store = memStore([rec('k0', [1, 0], 'c', [0]), rec('old', [1, 0], 'c', [99])])
    const embed = vi.fn(async (texts: string[]) => texts.map(() => [0, 1]))
    const sleep = vi.fn(async () => {})
    const result = await runIndexPass(segs(70), 'm', { store, embed, sleep })
    expect(embed.mock.calls.map((c) => c[0].length)).toEqual([32, 32, 5])
    expect(Math.max(...embed.mock.calls.map((c) => c[0].length))).toBeLessThanOrEqual(INDEX_BATCH_SIZE)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(1500)
    expect(result).toMatchObject({ indexed: 70, total: 70, embedded: 69, pruned: 1 })
    expect(store.data.has('old')).toBe(false)
    expect(store.data.get('k5')?.conversationId).toBe('c')
  })

  it('stops on the first failed batch and reports the error', async () => {
    const store = memStore()
    let calls = 0
    const embed = async (texts: string[]) => { calls += 1; if (calls === 2) throw new Error('HTTP 429 rate limit'); return texts.map(() => [1, 0]) }
    const result = await runIndexPass(segs(70), 'm', { store, embed, sleep: async () => {} })
    expect(result.error).toContain('429')
    expect(result.indexed).toBe(32)
    expect(store.data.size).toBe(32)
  })

  it('never prunes when there are no segments at all (data not loaded yet)', async () => {
    const store = memStore([rec('a', [1], 'c', [1])])
    await runIndexPass([], 'm', { store, embed: async () => [] })
    expect(store.data.has('a')).toBe(true)
  })

  it('backoff: rate-limit / timeout / 5xx / offline = 1 min, others = 30 min', () => {
    expect(backoffFor('HTTP 429 Too Many Requests')).toBe(TRANSIENT_BACKOFF_MS)
    expect(backoffFor('TPM limit reached')).toBe(TRANSIENT_BACKOFF_MS)
    expect(backoffFor('向量请求超时')).toBe(TRANSIENT_BACKOFF_MS)
    expect(backoffFor('HTTP 503')).toBe(TRANSIENT_BACKOFF_MS)
    expect(backoffFor('Failed to fetch')).toBe(TRANSIENT_BACKOFF_MS)
    expect(isTransientError('HTTP 401 invalid key', false)).toBe(true)
    expect(backoffFor('HTTP 401 invalid api key', true)).toBe(INDEX_BACKOFF_MS)
    expect(backoffFor('Model does not exist', true)).toBe(INDEX_BACKOFF_MS)
  })
})

/* ---------------- 检索 ---------------- */

describe('topSemantic / semanticSearch', () => {
  it('keeps ≥0.55 within the active conversation only, sorted, capped', () => {
    const records = [
      rec('a', [1, 0], 'c1', [1]),
      rec('b', [0.8, 0.6], 'c1', [2]),
      rec('c', [0.3, 0.95], 'c1', [3]),
      rec('other', [1, 0], 'c2', [1]),
    ]
    const hits = topSemantic([1, 0], records, { conversationId: 'c1' })
    expect(hits.map((h) => h.record.key)).toEqual(['a', 'b'])
    expect(topSemantic([1, 0], records, { conversationId: 'c1', topK: 1 })).toHaveLength(1)
  })

  it('semanticQueryText uses only the last 1–2 messages', () => {
    expect(semanticQueryText(['一', '二', '三'])).toBe('二\n三')
  })

  it('returns [] after the 4s timeout and reports a SemanticTimeoutError', async () => {
    vi.useFakeTimers()
    let aborted = false
    let reported: unknown
    const pending = semanticSearch('你好', {
      conversationId: 'c',
      embedQuery: (_t, signal) => new Promise((_r, reject) => { signal.addEventListener('abort', () => { aborted = true; reject(new Error('abort')) }) }),
      loadRecords: async () => [],
      onError: (e) => { reported = e },
    })
    await vi.advanceTimersByTimeAsync(4001)
    await expect(pending).resolves.toEqual([])
    expect(aborted).toBe(true)
    expect(reported).toBeInstanceOf(SemanticTimeoutError)
  })

  it('returns [] when the embedding call fails', async () => {
    const hits = await semanticSearch('你好', { conversationId: 'c', embedQuery: async () => { throw new Error('x') }, loadRecords: async () => [] })
    expect(hits).toEqual([])
  })
})

/* ---------------- 选取与渲染 ---------------- */

describe('selectTurnHits + renderSemanticRecall', () => {
  const messages = [
    m(1, 'user', '我小时候养过一只橘猫，叫团子'), m(2, 'assistant', '团子一定很胖吧'),
    m(3, 'user', '今天下雨'), m(4, 'assistant', '记得带伞'),
    m(5, 'user', '最近又想养猫了'), m(6, 'assistant', '想养什么颜色的'),
  ]
  const conv = { id: 'c1', messages }
  const text12 = segmentTextOf(messages.slice(0, 2))
  const text56 = segmentTextOf(messages.slice(4))
  const hit = (record: VectorRecord, score = 0.8): SemanticHit => ({ record, score })

  it('drops other conversations, fully in-context segments, and edited/deleted messages', () => {
    const hits = [
      hit(rec('a', [1], 'c1', [1, 2], text12)),
      hit(rec('b', [1], 'c2', [1, 2], text12)),
      hit(rec('c', [1], 'c1', [5, 6], text56)),
      hit(rec('d', [1], 'c1', [1, 2], '她：别的旧文字\n他：已被改写')),
      hit(rec('e', [1], 'c1', [1, 99], text12)),
    ]
    const selected = selectTurnHits(hits, conv, new Set([5, 6]))
    expect(selected.map((h) => h.record.key)).toEqual(['a'])
  })

  it('renders chronologically with names, merged, without in-context messages', () => {
    const selected = [hit(rec('a', [1], 'c1', [1, 2], text12))]
    const block = renderSemanticRecall(selected, conv, new Set([5, 6]), (msg) => msg.role === 'user' ? '宁梦曦' : '顾祁砚')
    expect(block).toContain('【本对话旧日原文')
    expect(block).toContain('（第 1–2 条）')
    expect(block).toContain('宁梦曦：「我小时候养过一只橘猫，叫团子」')
    expect(block).toContain('顾祁砚：「团子一定很胖吧」')
    expect(block).not.toContain('想养什么颜色')
    expect(renderSemanticRecall([], conv, new Set(), () => 'x')).toBe('')
  })
})

/* ---------------- 接线：关闭时不发请求，开启时只查本对话 ---------------- */

describe('runtime', () => {
  const cat = '我小时候养过一只橘猫，叫团子。' + '它每天趴在窗台上晒太阳。'.repeat(20)
  const reply = '团子一定很胖吧。' + '我想听你多讲讲它。'.repeat(20)
  const conversations = [
    { id: 'c1', messages: [m(1, 'user', cat), m(2, 'assistant', reply), m(3, 'user', '最近又想养猫了'), m(4, 'assistant', '那我们去看看')] },
    { id: 'c2', messages: [m(1, 'user', cat), m(2, 'assistant', reply)] },
  ]

  it('disabled: never calls fetch and returns empty recall', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    resetSemanticRuntimeForTest(memStore())
    registerSemanticSources({ conversations: () => conversations, channels: () => [channel] })
    expect(isSemanticReady()).toBe(false)
    const block = await semanticRecallForConversation({ conversation: conversations[0], inContextIds: new Set([3]), speakerName: () => 'x' })
    expect(block).toBe('')
    scheduleSemanticIndex(0)
    await new Promise((r) => setTimeout(r, 10))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('defaults to the SiliconFlow channel + bge-m3 and recalls only from the active conversation', async () => {
    const store = memStore()
    const bodies: Array<{ model: string; input: string[] }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.siliconflow.cn/v1/embeddings')
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
      const body = JSON.parse(String(init.body)) as { model: string; input: string[] }
      bodies.push(body)
      return new Response(JSON.stringify({ data: body.input.map((_t, index) => ({ index, embedding: [1, 0] })) }), { status: 200 })
    }))
    resetSemanticRuntimeForTest(store)
    registerSemanticSources({ conversations: () => conversations, channels: () => [channel] })
    updateSemanticConfig({ enabled: true })
    expect(JSON.parse(localStorage.getItem(SEMANTIC_CONFIG_KEY) || '{}')).toMatchObject({ enabled: true, model: 'BAAI/bge-m3' })
    expect(isSemanticReady()).toBe(true)
    await refreshSemanticCounts(false)
    expect(getSemanticState().progress).toMatchObject({ indexed: 0, total: 2 })
    scheduleSemanticIndex(0)
    await vi.waitFor(() => expect(getSemanticState().progress).toMatchObject({ indexed: 2, total: 2, running: false }))
    expect(bodies[0].model).toBe('BAAI/bge-m3')
    expect(new Set([...store.data.values()].map((r) => r.conversationId))).toEqual(new Set(['c1', 'c2']))

    const block = await semanticRecallForConversation({ conversation: conversations[0], inContextIds: new Set([3, 4]), speakerName: (msg) => msg.role === 'user' ? '她' : '他' })
    expect(block).toContain('她：「我小时候养过一只橘猫，叫团子。')
    expect(block.match(/养过一只橘猫/g)).toHaveLength(1)
  })

  it('query timeout skips the next queries for 2 minutes', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))))
    vi.stubGlobal('fetch', fetchMock)
    resetSemanticRuntimeForTest(memStore())
    registerSemanticSources({ conversations: () => conversations, channels: () => [channel] })
    updateSemanticConfig({ enabled: true })
    const first = semanticRecallForConversation({ conversation: conversations[0], inContextIds: new Set(), speakerName: () => 'x' })
    await vi.advanceTimersByTimeAsync(4001)
    await expect(first).resolves.toBe('')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await expect(semanticRecallForConversation({ conversation: conversations[0], inContextIds: new Set(), speakerName: () => 'x' })).resolves.toBe('')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('embedTexts routing', () => {
  it('a relay without /embeddings (404) falls back to SiliconFlow direct', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      urls.push(url)
      if (url.startsWith('https://my-worker')) return new Response('{}', { status: 404 })
      const body = JSON.parse(String(init.body)) as { input: string[] }
      return new Response(JSON.stringify({ data: body.input.map((_t, index) => ({ index, embedding: [0.1, 0.2] })) }), { status: 200 })
    }))
    const vecs = await embedTexts({ baseUrl: 'https://my-worker.example.com/v1/', apiKey: 'k' }, 'BAAI/bge-m3', ['a'])
    expect(vecs).toEqual([[0.1, 0.2]])
    expect(urls).toEqual(['https://my-worker.example.com/v1/embeddings', `${SILICONFLOW_BASE_URL}/embeddings`])
  })

  it('anthropic channel is rejected without a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(embedTexts({ baseUrl: 'https://api.anthropic.com/v1', apiKey: 'k', protocol: 'anthropic' }, 'm', ['a'])).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('IndexedDB store', () => {
  it('queries by model + conversation only', async () => {
    await idbVectorStore.put([rec('x1', [1, 0], 'c1', [1]), rec('x2', [1, 0], 'c2', [1])])
    expect((await idbVectorStore.forConversation('m', 'c1')).map((r) => r.key)).toEqual(['x1'])
    expect(await idbVectorStore.keys('m')).toEqual(new Set(['x1', 'x2']))
    await idbVectorStore.clear('m')
    expect((await idbVectorStore.keys('m')).size).toBe(0)
  })
})

describe('prompt injection', () => {
  const character = { name: '顾祁砚', description: '', personality: '', scenario: '', greeting: '', alternateGreetings: [], mesExample: '', systemPrompt: '', postHistoryInstructions: '', tags: [], regexScripts: [], characterBook: undefined } as unknown as Parameters<typeof buildChatPrompt>[0]['character']
  const base = {
    character,
    user: { name: '宁梦曦', description: '' },
    messages: [{ role: 'user' as const, text: '你好' }],
    preset: '', globalWorldbook: '',
    memory: { entries: [], injectPosition: 'none', injectPrompt: '{{memories}}' },
    memoryLength: 20,
  }

  it('without semantic recall the prompt is unchanged; with it the block sits right before chat history', () => {
    const plain = buildChatPrompt(base)
    expect(buildChatPrompt({ ...base, semanticRecall: '' })).toEqual(plain)
    const withRecall = buildChatPrompt({ ...base, semanticRecall: '【本对话旧日原文｜测试】' })
    expect(withRecall).toHaveLength(plain.length + 1)
    const index = withRecall.findIndex((msg) => msg.content === '【本对话旧日原文｜测试】')
    expect(withRecall[index].role).toBe('system')
    expect(withRecall[index + 1]).toEqual({ role: 'user', content: '你好' })
  })
})
