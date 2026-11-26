import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readRelayConfig, readRelayPending, startRelay, writeRelayConfig } from './relayService'
import { resetStreamOptionsMemory } from './chatApi'

const store = new Map<string, string>()
const storage = { getItem: (key: string) => store.get(key) || null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key), clear: () => store.clear() }
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
beforeEach(() => { storage.clear(); vi.restoreAllMocks() })

describe('weijing local relay', () => {

  it('v339：上游回 temperature is deprecated 时去掉温度再走一次中继，之后也不带', async () => {
    resetStreamOptionsMemory()
    writeRelayConfig({ enabled: true, url: 'https://relay.example', key: 'relay-key' })
    const bodies: Record<string, unknown>[] = []
    const results = new Map<string, unknown>()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/start')) {
        const payload = JSON.parse(String(init?.body))
        bodies.push(payload.body)
        results.set(payload.id, 'temperature' in payload.body ? { status: 'error', error: '`temperature` is deprecated for this model. (HTTP 400)' } : { status: 'done', text: '好。' })
        return new Response('')
      }
      const id = decodeURIComponent(url.split('/result/')[1])
      return new Response(JSON.stringify(results.get(id)), { headers: { 'content-type': 'application/json' } })
    })
    const api = { baseUrl: 'https://model.example/v1', apiKey: 'k', modelName: 'claude-opus-4-7' }
    let output = ''
    await startRelay({ id: 'a', conversationId: 'c', assistantId: 1, api, messages: [{ role: 'user', content: 'hi' }], temperature: .9, topP: 1, maxTokens: 100, signal: new AbortController().signal, onDelta: (text) => { output += text } })
    expect(output).toBe('好。')
    expect(bodies).toHaveLength(2)
    expect('temperature' in bodies[1]).toBe(false)
    await startRelay({ id: 'b', conversationId: 'c', assistantId: 2, api, messages: [{ role: 'user', content: 'hi' }], temperature: .9, topP: 1, maxTokens: 100, signal: new AbortController().signal, onDelta: () => {} })
    expect(bodies).toHaveLength(3)
    expect('temperature' in bodies[2]).toBe(false)
    resetStreamOptionsMemory()
  })
  it('defaults off and stores only under weijing-local.relay', () => {
    expect(readRelayConfig()).toEqual({ enabled: false, url: '', key: '' })
    writeRelayConfig({ enabled: true, url: 'https://relay.example/', key: 'secret' })
    expect(localStorage.getItem('weijing-local.relay')).toContain('relay.example')
    expect(localStorage.getItem('weijing.relay')).toBeNull()
  })

  it('sends Bearer relay auth, model key and returns relay text', async () => {
    writeRelayConfig({ enabled: true, url: 'https://relay.example', key: 'relay-key' })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/start')) {
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer relay-key')
        const body = JSON.parse(String(init?.body))
        expect(body.key).toBe('model-key')
        expect(body.body.model).toBe('model')
        return new Response('你好，', { status: 200 })
      }
      expect(url).toContain('/result/')
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer relay-key')
      return Response.json({ status: 'done', text: '你好，回来啦' })
    })
    let output = ''
    const result = await startRelay({ id: 'r1', conversationId: 'c1', assistantId: 2, api: { baseUrl: 'https://model.example/v1', apiKey: 'model-key', modelName: 'model' }, messages: [{ role: 'user', content: 'hi' }], temperature: .8, topP: .9, maxTokens: 100, signal: new AbortController().signal, onDelta: (text) => { output += text } })
    expect(result.finishReason).toBeNull()
    expect(output).toBe('你好，回来啦')
    expect(readRelayPending()).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
