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
    await completeChat({
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
  })

  it('连接测试返回服务端错误信息', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: '密钥无效' } }), { status: 401, headers: { 'content-type': 'application/json' } })))
    await expect(testApiConnection({ baseUrl: 'https://example.com/v1', apiKey: 'bad', modelName: 'model' })).rejects.toThrow('密钥无效')
  })
})
