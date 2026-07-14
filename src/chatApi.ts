export type ApiConfig = { baseUrl: string; apiKey: string; modelName: string; maxTokenField?: 'auto' | 'max_tokens' | 'max_completion_tokens' }
export type ChatApiMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type CompletionResult = { finishReason: string | null }

export type ApiModel = {
  id: string
  ownedBy?: string
}

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

export async function fetchApiModels(api: Pick<ApiConfig, 'baseUrl' | 'apiKey'>, signal?: AbortSignal): Promise<ApiModel[]> {
  if (!api.baseUrl.trim() || !api.apiKey.trim()) throw new Error('请先填写 Base URL 和 API Key')
  const response = await fetch(endpoint(api.baseUrl, 'models'), {
    headers: { Authorization: `Bearer ${api.apiKey}` },
    signal,
  })
  if (!response.ok) throw new Error(await readError(response))

  const payload: unknown = await response.json()
  const source = payload && typeof payload === 'object' ? payload as { data?: unknown; models?: unknown } : {}
  const rawModels: unknown[] = Array.isArray(source.data) ? source.data : Array.isArray(source.models) ? source.models : []
  const models: ApiModel[] = []

  for (const item of rawModels) {
    if (typeof item === 'string') {
      models.push({ id: item })
      continue
    }
    if (!item || typeof item !== 'object') continue

    const model = item as { id?: unknown; name?: unknown; owned_by?: unknown; ownedBy?: unknown }
    const id = typeof model.id === 'string' ? model.id : typeof model.name === 'string' ? model.name : ''
    if (!id) continue

    const ownedBy = typeof model.owned_by === 'string' ? model.owned_by : typeof model.ownedBy === 'string' ? model.ownedBy : undefined
    models.push(ownedBy ? { id, ownedBy } : { id })
  }

  const unique = new Map<string, ApiModel>()
  for (const model of models) unique.set(model.id, model)
  return Array.from(unique.values()).sort((a, b) => a.id.localeCompare(b.id))
}

export async function testApiConnection(api: ApiConfig, signal?: AbortSignal) {
  if (!api.modelName.trim()) throw new Error('请先选择或填写模型名称')
  await fetchApiModels(api, signal)
  return true
}

function messageContent(value: unknown) {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value.map((part) => part && typeof part === 'object' && 'text' in part && typeof part.text === 'string' ? part.text : '').join('')
}

async function consumeJson(response: Response, onDelta: (delta: string) => void): Promise<CompletionResult> {
  const data = await response.json()
  const choice = data?.choices?.[0]
  const content = messageContent(choice?.message?.content ?? choice?.text ?? data?.content ?? data?.output_text)
  if (!content) throw new Error('接口返回成功，但没有回复内容')
  onDelta(content)
  const finishReason = choice?.finish_reason ?? data?.stop_reason
  return { finishReason: typeof finishReason === 'string' ? finishReason : null }
}

async function consumeEventStream(response: Response, onDelta: (delta: string) => void): Promise<CompletionResult> {
  if (!response.body) return consumeJson(response, onDelta)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finishReason: string | null = null

  const consumeEvent = (event: string) => {
    for (const line of event.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const data = JSON.parse(payload)
        const choice = data?.choices?.[0]
        const delta = messageContent(
          choice?.delta?.content
          ?? choice?.message?.content
          ?? choice?.delta?.text
          ?? choice?.text
          ?? data?.delta?.text
          ?? data?.delta
          ?? data?.output_text
          ?? data?.response?.output_text,
        )
        if (delta) onDelta(delta)
        const nextFinishReason = choice?.finish_reason ?? data?.stop_reason
        if (typeof nextFinishReason === 'string') finishReason = nextFinishReason
      } catch {
        // Ignore provider keep-alive events that are not JSON.
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const events = buffer.split(/\r?\n\r?\n/)
    buffer = events.pop() || ''
    events.forEach(consumeEvent)
    if (done) break
  }
  if (buffer.trim()) consumeEvent(buffer)
  return { finishReason }
}

function tokenField(api: ApiConfig) {
  if (api.maxTokenField && api.maxTokenField !== 'auto') return api.maxTokenField
  return /(^|[\/_-])(?:o[1-9]|gpt-5)(?:$|[\/_-])/i.test(api.modelName) ? 'max_completion_tokens' : 'max_tokens'
}

export async function completeChat(options: CompletionOptions) {
  const { api, messages, temperature, topP, maxTokens, streaming, signal, onDelta } = options
  const limitField = tokenField(api)
  const response = await fetch(endpoint(api.baseUrl, 'chat/completions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.apiKey}` },
    body: JSON.stringify({
      model: api.modelName,
      messages,
      temperature,
      top_p: topP,
      [limitField]: maxTokens,
      stream: streaming,
    }),
    signal,
  })
  if (!response.ok) throw new Error(await readError(response))

  const contentType = response.headers.get('content-type') || ''
  if (streaming && (contentType.includes('text/event-stream') || !contentType.includes('application/json'))) return consumeEventStream(response, onDelta)
  return consumeJson(response, onDelta)
}
