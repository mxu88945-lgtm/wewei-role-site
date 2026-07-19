import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeChat, testApiConnection } from './chatApi'

afterEach(() => vi.unstubAllGlobals())

describe('chatApi', () => {
  it('原样发送 OpenAI 兼容的图文消息数组', async () => {
    let requestBody: { messages?: unknown[] } = {}
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ choices: [{ message: { content: '看到了截图。' } }] }), { headers: { 'content-type': 'application/json' } })
    }))
    let output = ''
    const imageUrl = 'data:image/jpeg;base64,abc'
    await completeChat({
      api: { baseUrl: 'https://example.com/v1', apiKey: 'test', modelName: 'vision-model' },
      messages: [{ role: 'user', content: [{ type: 'text', text: '哪里不对？' }, { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }] }],
      temperature: 1, topP: 1, maxTokens: 100, streaming: false,
      signal: new AbortController().signal, onDelta: (delta) => { output += delta },
    })
    expect(output).toBe('看到了截图。')
    expect(requestBody.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: '哪里不对？' }, { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }] }])
  })

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

  it('解析使用 delta.text 的兼容流', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response([
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"旁白"}}',
      '',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"推进"}}',
      '',
    ].join('\n'), { headers: { 'content-type': 'text/event-stream' } })))

    let output = ''
    await completeChat({
      api: { baseUrl: 'https://example.com/v1', apiKey: 'test', modelName: 'director-model' },
      messages: [{ role: 'user', content: '继续' }], temperature: 1, topP: 1, maxTokens: 100, streaming: true,
      signal: new AbortController().signal, onDelta: (delta) => { output += delta },
    })
    expect(output).toBe('旁白推进')
  })

  it('解析 Responses 风格的 output_text delta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response([
      'data: {"type":"response.output_text.delta","delta":"场景继续。"}',
      '',
    ].join('\n'), { headers: { 'content-type': 'text/event-stream' } })))

    let output = ''
    await completeChat({
      api: { baseUrl: 'https://example.com/v1', apiKey: 'test', modelName: 'director-model' },
      messages: [{ role: 'user', content: '继续' }], temperature: 1, topP: 1, maxTokens: 100, streaming: true,
      signal: new AbortController().signal, onDelta: (delta) => { output += delta },
    })
    expect(output).toBe('场景继续。')
  })

  it('使用 Claude 官方 Messages 协议并转换系统提示与图片', async () => {
    let requestUrl = ''
    let requestHeaders: HeadersInit | undefined
    let requestBody: Record<string, unknown> = {}
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      requestUrl = url
      requestHeaders = init?.headers
      requestBody = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '收到。' }], stop_reason: 'end_turn' }), { headers: { 'content-type': 'application/json' } })
    }))

    let output = ''
    const result = await completeChat({
      api: { protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: 'claude-key', modelName: 'claude-model' },
      messages: [
        { role: 'system', content: '只扮演男主。' },
        { role: 'assistant', content: '已经发生的开场。' },
        { role: 'user', content: [{ type: 'text', text: '继续' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }] },
      ],
      temperature: 1, topP: 1, maxTokens: 1200, streaming: false,
      signal: new AbortController().signal, onDelta: (delta) => { output += delta },
    })

    expect(requestUrl).toBe('https://api.anthropic.com/v1/messages')
    expect(requestHeaders).toMatchObject({ 'x-api-key': 'claude-key', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' })
    expect(requestBody).toMatchObject({ system: '只扮演男主。', model: 'claude-model', max_tokens: 1200 })
    expect(requestBody.messages).toEqual([
      { role: 'user', content: '以下是已经发生的对话记录。' },
      { role: 'assistant', content: '已经发生的开场。' },
      { role: 'user', content: [{ type: 'text', text: '继续' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } }] },
    ])
    expect(output).toBe('收到。')
    expect(result.finishReason).toBe('end_turn')
  })

  it('识别 Claude 流式结束原因', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response([
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"未完"}}',
      '',
      'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}',
      '',
    ].join('\n'), { headers: { 'content-type': 'text/event-stream' } })))
    let output = ''
    const result = await completeChat({
      api: { protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: 'test', modelName: 'claude-model' },
      messages: [{ role: 'user', content: '继续' }], temperature: 1, topP: 1, maxTokens: 100, streaming: true,
      signal: new AbortController().signal, onDelta: (delta) => { output += delta },
    })
    expect(output).toBe('未完')
    expect(result.finishReason).toBe('max_tokens')
  })

  it('连接测试返回服务端错误信息', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: '密钥无效' } }), { status: 401, headers: { 'content-type': 'application/json' } })))
    await expect(testApiConnection({ baseUrl: 'https://example.com/v1', apiKey: 'bad', modelName: 'model' })).rejects.toThrow('密钥无效')
  })
})
