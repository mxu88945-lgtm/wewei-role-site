import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readRelayConfig, readRelayPending, startRelay, writeRelayConfig } from './relayService'

const store = new Map<string, string>()
const storage = { getItem: (key: string) => store.get(key) || null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key), clear: () => store.clear() }
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
beforeEach(() => { storage.clear(); vi.restoreAllMocks() })

describe('weijing local relay', () => {
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
        return new Response('accepted', { status: 200 })
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
