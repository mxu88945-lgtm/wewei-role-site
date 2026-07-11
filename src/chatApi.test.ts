import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeChat, testApiConnection } from './chatApi'

afterEach(() => vi.unstubAllGlobals())

describe('chatApi', () => {
  it('解析 OpenAI 兼容的 SSE 流', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response([
      'data: {"choices":[{"delta":{"content":"你"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"来了"}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n'), { headers: { 'content-type': 'text/event-stream' } })))

    let output = ''
    const result = await completeChat({
      api: { baseUrl: 'https://example.com/v1', apiKey: 'test', modelName: 'model' },
      messages: [{ role: 'user', content: '你好' }],
      temperature: 1,
      topP: 1,
      maxTokens: 100,
      streaming: true,
      signal: new AbortController().signal,
      onDelta: (delta) => { output += delta },
    })
    expect(output).toBe('你来了')
    expect(result.finishReason).toBeNull()
  })

  it('保留最后一个未闭合分片并识别长度截断', async () => {
    let requestBody: Record<string, unknown> = {}
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body))
      return new Response('data: {"choices":[{"delta":{"content":"未完"},"finish_reason":"length"}]}', { headers: { 'content-type': 'text/event-stream' } })
    }))
    let output = ''
    const result = await completeChat({
      api: { baseUrl: 'https://example.com/v1', apiKey: 'test', modelName: 'gpt-5-mini', maxTokenField: 'auto' },
      messages: [{ role: 'user', content: '继续' }], temperature: 1, topP: 1, maxTokens: 16000, streaming: true,
      signal: new AbortController().signal, onDelta: (delta) => { output += delta },
    })
    expect(output).toBe('未完')
    expect(result.finishReason).toBe('length')
    expect(requestBody.max_completion_tokens).toBe(16000)
    expect(requestBody.max_tokens).toBeUndefined()
  })

  it('连接测试返回服务端错误信息', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: '密钥无效' } }), { status: 401, headers: { 'content-type': 'application/json' } })))
    await expect(testApiConnection({ baseUrl: 'https://example.com/v1', apiKey: 'bad', modelName: 'model' })).rejects.toThrow('密钥无效')
  })
})
