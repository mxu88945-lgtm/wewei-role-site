export type ApiConfig = { baseUrl: string; apiKey: string; modelName: string }
export type ChatApiMessage = { role: 'system' | 'user' | 'assistant'; content: string }

type CompletionOptions = {
  api: ApiConfig
  messages: ChatApiMessage[]
  temperature: number
  topP: number
  maxTokens: number
  streaming: boolean
  signal: AbortSignal
  onDelta: (delta: string) => void
}

function endpoint(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

async function readError(response: Response) {
  try {
    const data = await response.json()
    return data?.error?.message || data?.message || `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

export async function testApiConnection(api: ApiConfig, signal?: AbortSignal) {
  if (!api.baseUrl.trim() || !api.apiKey.trim() || !api.modelName.trim()) throw new Error('请先完整填写 Base URL、API Key 和模型名称')
  const response = await fetch(endpoint(api.baseUrl, 'models'), {
    headers: { Authorization: `Bearer ${api.apiKey}` },
    signal,
  })
  if (!response.ok) throw new Error(await readError(response))
  return true
}

async function consumeJson(response: Response, onDelta: (delta: string) => void) {
  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content) throw new Error('接口返回成功，但没有回复内容')
  onDelta(content)
}

async function consumeEventStream(response: Response, onDelta: (delta: string) => void) {
  if (!response.body) return consumeJson(response, onDelta)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() || ''
    for (const event of events) {
      for (const line of event.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const data = JSON.parse(payload)
          const delta = data?.choices?.[0]?.delta?.content ?? data?.choices?.[0]?.message?.content
          if (typeof delta === 'string' && delta) onDelta(delta)
        } catch {
          // Ignore provider keep-alive events that are not JSON.
        }
      }
    }
    if (done) break
  }
}

export async function completeChat(options: CompletionOptions) {
  const { api, messages, temperature, topP, maxTokens, streaming, signal, onDelta } = options
  const response = await fetch(endpoint(api.baseUrl, 'chat/completions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey}` },
    body: JSON.stringify({
      model: api.modelName,
      messages,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      stream: streaming,
    }),
    signal,
  })
  if (!response.ok) throw new Error(await readError(response))

  const contentType = response.headers.get('content-type') || ''
  if (streaming && contentType.includes('text/event-stream')) await consumeEventStream(response, onDelta)
  else await consumeJson(response, onDelta)
}
