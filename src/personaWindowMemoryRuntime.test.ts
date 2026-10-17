import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiConfig, ChatApiMessage } from './chatApi'
import type { Character } from './characterCard'
import { createPersonaWindow, deletePersonaMessage, emptyPersonaState, normalizePersonaState, type PersonaMessage, type PersonaWindow } from './personaWindow'
import { getPersonaState, setPersonaState } from './personaWindowStore'
import { generatePersonaReply, maybeCompressPersonaContext, stopPersonaReply, type PersonaRuntimeDeps } from './personaWindowRuntime'

type Options = { api: ApiConfig; messages: ChatApiMessage[]; maxTokens: number; signal: AbortSignal; onDelta: (delta: string) => void }
type Reply = string | Error | ((options: Options) => Promise<void>)
const mock = vi.hoisted(() => ({ calls: [] as Options[], replies: [] as Reply[] }))
vi.mock('./chatApi', () => ({ completeChat: vi.fn(async (options: Options) => {
  mock.calls.push({ ...options, messages: JSON.parse(JSON.stringify(options.messages)) })
  const reply = mock.replies.shift() ?? '自然回复。'
  if (reply instanceof Error) throw reply
  if (typeof reply === 'function') await reply(options)
  else options.onDelta(reply)
  return { finishReason: 'stop' }
}) }))

let sequence = 0
let persona: PersonaWindow
let deps: PersonaRuntimeDeps
const say = (id: number, text = `原话${id}`): PersonaMessage => ({ id, role: id % 2 ? 'user' : 'assistant', text, createdAt: Date.now() - 10000 + id })
const fill = (count: number) => setPersonaState((state) => ({ ...state, personas: state.personas.map((item) => ({ ...item, threads: [{ ...item.threads[0], messages: Array.from({ length: count }, (_, index) => say(index + 1)) }] })) }))
const current = () => getPersonaState().personas[0]

beforeEach(() => {
  vi.useFakeTimers()
  mock.calls.length = 0; mock.replies.length = 0
  persona = createPersonaWindow(`runtime-${++sequence}`)
  const character: Character = { id: persona.characterId, name: '虞山行', tagline: '', description: '寡言护短', personality: '', scenario: '', greeting: '', alternateGreetings: [], mesExample: '', systemPrompt: '', postHistoryInstructions: '', creatorNotes: '', creator: '', characterVersion: '', tags: [], regexScripts: [] }
  const api = { baseUrl: 'https://chat.test/v1', apiKey: 'test', modelName: 'chat' }
  deps = { character, user: { name: '惟惟', description: '' }, api, memoryApi: { ...api, baseUrl: 'https://memory.test/v1', modelName: 'memory' }, temperature: 1, topP: 1, maxTokens: 2000, streaming: false, memoryLength: 40, pastLife: () => '' }
  setPersonaState(() => ({ ...emptyPersonaState(), activeId: persona.id, personas: [persona] }))
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('人格分层记忆的实际运行流程 (v139)', () => {
  it('does not run the retired 12-message extraction or compact before 240', async () => {
    fill(11)
    await generatePersonaReply(persona.id, deps, { text: '今天聊点别的' })
    await vi.advanceTimersByTimeAsync(1300)
    expect(mock.calls).toHaveLength(1)
    fill(239)
    await maybeCompressPersonaContext(persona.id, deps)
    expect(mock.calls).toHaveLength(1)
  })

  it('compacts at 240 through the memory channel, preserves every raw message and at least 96 recent turns', async () => {
    fill(240)
    const originals = JSON.stringify(current().threads[0].messages)
    mock.replies.push('已确认的约定与关系。')
    await maybeCompressPersonaContext(persona.id, deps)
    expect(mock.calls).toHaveLength(1)
    expect(mock.calls[0].api.modelName).toBe('memory')
    expect(mock.calls[0].maxTokens).toBe(1400)
    expect(current().threads[0].compressedThroughId).toBe(144)
    expect(current().threads[0].contextSummary).toBe('已确认的约定与关系。')
    expect(JSON.stringify(current().threads[0].messages)).toBe(originals)
    await maybeCompressPersonaContext(persona.id, deps)
    expect(mock.calls).toHaveLength(1)
  })

  it('respects the maintenance off switch', async () => {
    fill(240)
    setPersonaState((state) => ({ ...state, personas: [{ ...current(), autoMemory: false }] }))
    await maybeCompressPersonaContext(persona.id, deps)
    expect(mock.calls).toHaveLength(0)
  })

  it.each(['模型只返回了思考数据，没有返回可显示的正文。', 'HTTP 402 — Insufficient balance'])('keeps exact local fallback for %s without another costly call', async (error) => {
    fill(240)
    mock.replies.push(new Error(error))
    await maybeCompressPersonaContext(persona.id, deps)
    expect(mock.calls).toHaveLength(1)
    expect(current().threads[0].summaryFallback).toBe(true)
    expect(current().threads[0].contextSummary).toContain('原话144')
    expect(current().threads[0].messages).toHaveLength(240)
  })

  it('retries a token-affordability failure once with the smaller budget', async () => {
    fill(240)
    mock.replies.push(new Error('more credits, or fewer max_tokens'), '精简累计档案。')
    await maybeCompressPersonaContext(persona.id, deps)
    expect(mock.calls.map((call) => call.maxTokens)).toEqual([1400, 900])
    expect(current().threads[0].contextSummary).toBe('精简累计档案。')
  })

  it('transport failures preserve cursors and cool down for 30 minutes', async () => {
    fill(240)
    mock.replies.push(new Error('relay unavailable'))
    await maybeCompressPersonaContext(persona.id, deps)
    expect(current().threads[0].compressedThroughId).toBeUndefined()
    await maybeCompressPersonaContext(persona.id, deps)
    expect(mock.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 1)
    mock.replies.push('恢复后的档案')
    await maybeCompressPersonaContext(persona.id, deps)
    expect(mock.calls).toHaveLength(2)
  })

  it('a source deleted in flight cannot be committed as a fresh continuity archive', async () => {
    fill(240)
    let release: () => void = () => undefined
    mock.replies.push((options) => new Promise<void>((resolve) => { release = () => { options.onDelta('不能写回的旧档案'); resolve() } }))
    const pending = maybeCompressPersonaContext(persona.id, deps)
    setPersonaState((state) => deletePersonaMessage(state, persona.id, persona.threads[0].id, 42))
    release()
    await pending
    expect(current().threads[0].contextSummary).toBeUndefined()
    expect(current().threads[0].messages.some((message) => message.id === 42)).toBe(false)
  })

  it('active search and paged originals feed the model, hide tool commands, and attach only real source receipts', async () => {
    const oldId = `${persona.id}-old`
    const old = { ...persona.threads[0], id: oldId, title: '旧窗口', messages: [say(1, '茉莉花茶的约定：下次去山间喝茶。')] }
    setPersonaState((state) => ({ ...state, personas: [{ ...current(), recallEnabled: false, threads: [current().threads[0], old] }] }))
    mock.replies.push('[搜索:茉莉花茶]', `[旧文:${oldId}|1|0]`, '你说过，下次去山间喝茉莉花茶。')
    await generatePersonaReply(persona.id, deps, { text: '我们那个约定呢？' })
    expect(mock.calls).toHaveLength(3)
    expect(JSON.stringify(mock.calls[1].messages)).toContain('下次去山间喝茶')
    expect(JSON.stringify(mock.calls[2].messages)).toContain('只读原文')
    const saved = current().threads[0].messages
    expect(saved).toHaveLength(2)
    expect(saved[1].recallSources).toHaveLength(1)
    expect(saved[1].recallSources![0].threadId).toBe(oldId)
    expect(saved[1].text).not.toMatch(/搜索:|旧文:/)
    expect(current().threads[0].recallLedger?.[`${oldId}|1`]).toBe(1)
  })

  it('caps search rounds and never reads a different persona or an excluded thread', async () => {
    setPersonaState((state) => ({ ...state, personas: [{ ...current(), recallScope: 'thread' }] }))
    mock.replies.push('[旧文:other-persona|1|0]', '[搜索:不存在的暗号]', '[搜索:仍然找不到]')
    await generatePersonaReply(persona.id, deps, { text: '你记得以前那个暗号吗？' })
    expect(mock.calls).toHaveLength(3)
    expect(JSON.stringify(mock.calls[1].messages)).toContain('当前范围没有可读原文')
    expect(current().threads[0].messages[1].text).toContain('不乱说')
    expect(current().threads[0].messages[1].recallSources).toBeUndefined()
  })

  it('important reply saves have provenance and no second extraction call; stopped replies never save memories', async () => {
    mock.replies.push('我记下了。[记忆:她养九只玄凤]')
    await generatePersonaReply(persona.id, deps, { text: '记住我养了九只玄凤' })
    expect(current().memories[0]).toMatchObject({ content: '她养九只玄凤', autoGenerated: true, sourceThreadId: persona.threads[0].id, sourceMessageIds: [1, 2] })
    expect(current().threads[0].messages[1].text).toBe('我记下了。')
    await vi.advanceTimersByTimeAsync(1300)
    expect(mock.calls).toHaveLength(1)
    let release: () => void = () => undefined
    mock.replies.push((options) => new Promise<void>((resolve) => { options.onDelta('未完成。[记忆:这条不能保存]'); release = resolve }))
    const pending = generatePersonaReply(persona.id, deps, { text: '继续' })
    stopPersonaReply(persona.threads[0].id)
    release()
    await pending
    expect(current().memories).toHaveLength(1)
  })

  it('deleting a reply does not recycle its source number after restore and resend', async () => {
    await generatePersonaReply(persona.id, deps, { text: '第一条' })
    setPersonaState((state) => deletePersonaMessage(state, persona.id, persona.threads[0].id, 2))
    setPersonaState((state) => normalizePersonaState(JSON.parse(JSON.stringify(state))))
    await generatePersonaReply(persona.id, deps, { text: '第二条' })
    expect(current().threads[0].messages.map((message) => message.id)).toEqual([1, 3, 4])
  })
})
