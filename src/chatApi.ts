export type ApiConfig = { baseUrl: string; apiKey: string; modelName: string; protocol?: 'openai' | 'anthropic'; maxTokenField?: 'auto' | 'max_tokens' | 'max_completion_tokens' }
export type ChatApiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }
export type ChatApiMessage = { role: 'system' | 'user' | 'assistant'; content: string | ChatApiContentPart[] }
export type CompletionActivity = 'thinking' | 'content'
export type CompletionResult = { finishReason: string | null }
export type ConnectionTestResult = { method: 'models' | 'chat'; modelListError?: string }

export class ChatApiError extends Error {
  constructor(
    message: string,
    public readonly phase: 'connect' | 'response' | 'stream',
    public readonly retryable = false,
  ) {
    super(message)
    this.name = 'ChatApiError'
  }
}

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
  onActivity?: (activity: CompletionActivity) => void
}

const CONNECT_TIMEOUT_MS = 45_000
const NON_STREAM_RESPONSE_TIMEOUT_MS = 180_000
const FIRST_STREAM_ACTIVITY_TIMEOUT_MS = 45_000
const STREAM_IDLE_TIMEOUT_MS = 60_000

function endpoint(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.trim().replace(/\/$/, '')
  const normalizedPath = path.replace(/^\//, '')
  // Accept the two URL shapes users commonly paste: an API root ending in
  // /v1, or the complete chat/messages endpoint copied from a provider doc.
  // The latter previously became .../chat/completions/chat/completions.
  if (normalizedBase.endsWith(`/${normalizedPath}`)) return normalizedBase
  return `${normalizedBase}/${normalizedPath}`
}

function transportError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return error
  const message = error instanceof Error ? error.message : String(error || '')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new ChatApiError('设备当前处于离线状态。请恢复网络后重试，已发送的聊天内容不会丢失。', 'connect', true)
  }
  if (/failed to fetch|fetch failed|networkerror|load failed|network request failed|internet connection appears to be offline|network connection was lost|specified hostname could not be found|could not connect to the server/i.test(message)) {
    return new ChatApiError('浏览器无法连到该 API（常见原因：Base URL 不可访问、接口未开放 CORS、网络/VPN 或证书异常）。请先在 API 页面测试此渠道；若测试仍失败，需要换支持浏览器直连的中转地址。', 'connect', true)
  }
  return error instanceof Error ? error : new Error('API 请求失败')
}

async function requestApi(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = CONNECT_TIMEOUT_MS) {
  const controller = new AbortController()
  const externalSignal = init.signal
  let timedOut = false
  const forwardAbort = () => controller.abort(externalSignal?.reason)
  if (externalSignal?.aborted) forwardAbort()
  else externalSignal?.addEventListener('abort', forwardAbort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new DOMException('Timed out', 'TimeoutError'))
  }, timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (externalSignal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (timedOut) throw new ChatApiError(`API 连接超时（${Math.round(timeoutMs / 1000)} 秒内没有建立响应），请检查网络/VPN 或稍后重试。`, 'connect', true)
    throw transportError(error)
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', forwardAbort)
  }
}

const TRANSIENT_COMPLETION_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 522, 524])

function waitForRetry(signal: AbortSignal, delay: number) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delay)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function retryDelay(response: Response, attempt: number) {
  const value = response.headers.get('retry-after')?.trim()
  if (value) {
    const seconds = Number(value)
    const at = Date.parse(value)
    const parsed = Number.isFinite(seconds) ? seconds * 1000 : Number.isFinite(at) ? at - Date.now() : NaN
    if (Number.isFinite(parsed)) return Math.min(8_000, Math.max(250, parsed))
  }
  return attempt * 700
}

async function readError(response: Response) {
  try {
    const data = await response.json()
    return data?.error?.message || data?.message || `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

function affordableTokenLimit(message: string, requested: number) {
  const match = message.match(/requested\s+up\s+to\s+([\d,]+)\s+tokens?[,;]?\s+but\s+can\s+only\s+afford\s+([\d,]+)/i)
  if (!match) return null
  const reportedRequested = Number(match[1].replace(/,/g, ''))
  const affordable = Number(match[2].replace(/,/g, ''))
  if (!Number.isFinite(reportedRequested) || !Number.isFinite(affordable) || affordable < 1) return null
  const current = Math.max(1, Math.floor(requested))
  const next = Math.min(current - 1, Math.floor(affordable))
  return next >= 1 ? next : null
}

function apiHeaders(api: Pick<ApiConfig, 'apiKey' | 'protocol'>): Record<string, string> {
  if (api.protocol === 'anthropic') return {
    'x-api-key': api.apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
  return { Authorization: `Bearer ${api.apiKey}` }
}

export async function fetchApiModels(api: Pick<ApiConfig, 'baseUrl' | 'apiKey' | 'protocol'>, signal?: AbortSignal): Promise<ApiModel[]> {
  if (!api.baseUrl.trim() || !api.apiKey.trim()) throw new Error('请先填写 Base URL 和 API Key')
  const response = await requestApi(endpoint(api.baseUrl, 'models'), {
    headers: apiHeaders(api),
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

async function probeChatCompletion(api: ApiConfig, signal?: AbortSignal) {
  const anthropic = api.protocol === 'anthropic'
  const response = await requestApi(endpoint(api.baseUrl, anthropic ? 'messages' : 'chat/completions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...apiHeaders(api) },
    body: JSON.stringify(anthropic ? {
      model: api.modelName,
      messages: [{ role: 'user', content: 'Reply OK.' }],
      max_tokens: 16,
      temperature: 0,
      stream: false,
    } : {
      model: api.modelName,
      messages: [{ role: 'user', content: 'Reply OK.' }],
      [tokenField(api)]: 16,
      temperature: 0,
      stream: false,
    }),
    signal,
  })
  if (!response.ok) throw new Error(await readError(response))
}

export async function testApiConnection(api: ApiConfig, signal?: AbortSignal): Promise<ConnectionTestResult> {
  if (!api.modelName.trim()) throw new Error('请先选择或填写模型名称')
  let modelListError = ''
  try {
    await fetchApiModels(api, signal)
    return { method: 'models' }
  } catch (error) {
    modelListError = error instanceof Error ? error.message : '模型列表请求失败'
  }

  try {
    await probeChatCompletion(api, signal)
    return { method: 'chat', modelListError }
  } catch (error) {
    const chatError = error instanceof Error ? error.message : '对话接口请求失败'
    throw new Error(`模型列表不可用：${modelListError}；对话接口也不可用：${chatError}`)
  }
}

function messageContent(value: unknown) {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value.map((part) => {
    if (!part || typeof part !== 'object') return ''
    const typed = part as { type?: unknown; text?: unknown; content?: unknown }
    const type = typeof typed.type === 'string' ? typed.type : ''
    if (/thinking|reasoning|analysis/i.test(type)) return ''
    if (typeof typed.text === 'string') return typed.text
    return typeof typed.content === 'string' ? typed.content : ''
  }).join('')
}

function reasoningActivity(data: any) {
  const choice = data?.choices?.[0]
  const delta = choice?.delta
  const type = [data?.type, delta?.type, data?.delta?.type, data?.content_block?.type]
    .filter((value) => typeof value === 'string')
    .join(' ')
  if (/thinking|reasoning|analysis/i.test(type)) return true
  if (delta?.reasoning_content || delta?.reasoning || delta?.analysis || delta?.thinking) return true
  if (data?.reasoning || data?.thinking || data?.analysis) return true
  const parts = Array.isArray(delta?.content) ? delta.content : Array.isArray(data?.content) ? data.content : []
  return parts.some((part: any) => /thinking|reasoning|analysis/i.test(String(part?.type || '')))
}

function streamDelta(data: any) {
  if (reasoningActivity(data) && /thinking|reasoning|analysis/i.test(String(data?.type || data?.delta?.type || ''))) return ''
  const choice = data?.choices?.[0]
  const choiceDelta = choice?.delta
  if (typeof choiceDelta?.content === 'string') return choiceDelta.content
  if (Array.isArray(choiceDelta?.content)) return messageContent(choiceDelta.content)
  if (typeof choice?.message?.content === 'string' || Array.isArray(choice?.message?.content)) return messageContent(choice.message.content)
  if (typeof choiceDelta?.text === 'string' && !/thinking|reasoning|analysis/i.test(String(choiceDelta?.type || ''))) return choiceDelta.text
  if (typeof choice?.text === 'string') return choice.text
  if (typeof data?.delta?.text === 'string' && !/thinking|reasoning|analysis/i.test(String(data?.delta?.type || data?.type || ''))) return data.delta.text
  if (typeof data?.delta === 'string' && !/thinking|reasoning|analysis/i.test(String(data?.type || ''))) return data.delta
  if (typeof data?.output_text === 'string') return data.output_text
  return typeof data?.response?.output_text === 'string' ? data.response.output_text : ''
}

async function consumeJson(response: Response, onDelta: (delta: string) => void, onActivity?: (activity: CompletionActivity) => void): Promise<CompletionResult> {
  let data: any
  try {
    data = await response.json()
  } catch {
    throw new ChatApiError('接口返回了无法解析的内容，可能是中转页、网关错误或响应格式不兼容。', 'response', true)
  }
  const choice = data?.choices?.[0]
  const content = messageContent(choice?.message?.content ?? choice?.text ?? data?.content ?? data?.output_text)
  if (!content) throw new ChatApiError(reasoningActivity(data) ? '模型只返回了思考数据，没有返回可显示的正文。' : '接口返回成功，但没有回复内容。', 'response', true)
  onActivity?.('content')
  onDelta(content)
  const finishReason = choice?.finish_reason ?? data?.stop_reason
  return { finishReason: typeof finishReason === 'string' ? finishReason : null }
}

async function readStreamChunk(reader: ReadableStreamDefaultReader<Uint8Array>, signal: AbortSignal, timeoutMs: number) {
  return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      callback()
    }
    const onAbort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')))
    const timer = setTimeout(() => finish(() => reject(new ChatApiError(`模型数据流超过 ${Math.round(timeoutMs / 1000)} 秒没有新数据，连接可能已中断。`, 'stream', true))), timeoutMs)
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    reader.read().then((value) => finish(() => resolve(value)), (error) => finish(() => reject(error)))
  })
}

async function consumeEventStream(
  response: Response,
  onDelta: (delta: string) => void,
  signal: AbortSignal,
  onActivity?: (activity: CompletionActivity) => void,
): Promise<CompletionResult> {
  if (!response.body) return consumeJson(response, onDelta, onActivity)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finishReason: string | null = null
  let streamEnded = false
  let contentReceived = false
  let meaningfulActivity = false
  const firstActivityDeadline = Date.now() + FIRST_STREAM_ACTIVITY_TIMEOUT_MS

  const consumeEvent = (event: string) => {
    for (const line of event.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      // Many OpenAI-compatible relays keep the HTTP connection alive after the
      // SSE protocol has already finished. Treat [DONE] as the real completion
      // boundary instead of waiting forever for reader.read() to return done.
      if (payload === '[DONE]') {
        streamEnded = true
        return
      }
      try {
        const data = JSON.parse(payload)
        const choice = data?.choices?.[0]
        if (reasoningActivity(data)) {
          meaningfulActivity = true
          onActivity?.('thinking')
        }
        const delta = streamDelta(data)
        if (delta) {
          meaningfulActivity = true
          contentReceived = true
          onActivity?.('content')
          onDelta(delta)
        }
        const nextFinishReason = choice?.finish_reason ?? data?.stop_reason ?? data?.delta?.stop_reason
        if (typeof nextFinishReason === 'string') {
          finishReason = nextFinishReason
          streamEnded = true
          return
        }
      } catch {
        // Ignore provider keep-alive events that are not JSON.
      }
    }
  }

  try {
    while (!streamEnded) {
      const untilFirstActivity = meaningfulActivity ? STREAM_IDLE_TIMEOUT_MS : Math.max(1, firstActivityDeadline - Date.now())
      const { done, value } = await readStreamChunk(reader, signal, Math.min(STREAM_IDLE_TIMEOUT_MS, untilFirstActivity))
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() || ''
      for (const event of events) {
        consumeEvent(event)
        if (streamEnded) break
      }
      if (!meaningfulActivity && Date.now() >= firstActivityDeadline) {
        throw new ChatApiError('接口已连接，但 45 秒内没有返回正文或思考活动。', 'stream', true)
      }
      if (done) break
    }
    if (!streamEnded && buffer.trim()) consumeEvent(buffer)
    if (!contentReceived) {
      throw new ChatApiError(meaningfulActivity ? '模型结束了思考流，但没有返回可显示的正文。' : '接口数据流已结束，但没有回复内容。', 'stream', true)
    }
    return { finishReason }
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
    if (error instanceof ChatApiError) {
      if (contentReceived && error.retryable) throw new ChatApiError(`${error.message} 已保留当前收到的部分回复。`, 'stream', false)
      throw error
    }
    const converted = transportError(error)
    const detail = converted instanceof Error ? converted.message : '数据流意外中断。'
    throw new ChatApiError(contentReceived ? `${detail} 已保留当前收到的部分回复。` : detail, 'stream', !contentReceived)
  } finally {
    // A few relay/browser combinations leave cancel() pending even after [DONE].
    // The response is already complete (or failed); never keep the UI waiting
    // for transport cleanup.
    void reader.cancel().catch(() => {})
  }
}

function tokenField(api: ApiConfig) {
  if (api.maxTokenField && api.maxTokenField !== 'auto') return api.maxTokenField
  return /(^|[/_-])(?:o[1-9]|gpt-5)(?:$|[/_-])/i.test(api.modelName) ? 'max_completion_tokens' : 'max_tokens'
}

function anthropicContent(content: ChatApiMessage['content']) {
  if (typeof content === 'string') return content
  return content.map((part) => {
    if (part.type === 'text') return part
    const dataUrl = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/)
    if (dataUrl) return { type: 'image', source: { type: 'base64', media_type: dataUrl[1], data: dataUrl[2] } }
    return { type: 'image', source: { type: 'url', url: part.image_url.url } }
  })
}

type RequestCompatibility = {
  tokenField: 'max_tokens' | 'max_completion_tokens'
  omitTemperature: boolean
  omitTopP: boolean
}

function unsupportedParameter(message: string, parameter: string) {
  const escaped = parameter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:unsupported|not supported|invalid|unknown|unrecognized|not allowed)[^\\n]{0,100}${escaped}|${escaped}[^\\n]{0,100}(?:unsupported|not supported|invalid|unknown|unrecognized|not allowed)`, 'i').test(message)
}

function tokenFieldMismatch(message: string) {
  return /max_tokens|max_completion_tokens/i.test(message)
    && /unsupported|not supported|deprecated|invalid|unknown|unrecognized|not allowed|use\s+max_/i.test(message)
}

function anthropicPayload(options: CompletionOptions, maxTokens: number, compatibility: RequestCompatibility) {
  const system = options.messages.filter((message) => message.role === 'system').map((message) => messageContent(message.content)).filter(Boolean).join('\n\n')
  const messages = options.messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role, content: anthropicContent(message.content) }))
  if (messages[0]?.role === 'assistant') messages.unshift({ role: 'user', content: '以下是已经发生的对话记录。' })
  return {
    model: options.api.modelName,
    ...(system ? { system } : {}),
    messages,
    ...(!compatibility.omitTemperature ? { temperature: options.temperature } : {}),
    ...(!compatibility.omitTopP ? { top_p: options.topP } : {}),
    max_tokens: maxTokens,
    stream: options.streaming,
  }
}

export async function completeChat(options: CompletionOptions) {
  const { api, messages, temperature, topP, maxTokens, streaming, signal, onDelta, onActivity } = options
  const anthropic = api.protocol === 'anthropic'
  const compatibility: RequestCompatibility = {
    tokenField: tokenField(api),
    omitTemperature: false,
    omitTopP: false,
  }

  const request = async (effectiveMaxTokens: number) => {
    let lastError: unknown
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await requestApi(endpoint(api.baseUrl, anthropic ? 'messages' : 'chat/completions'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...apiHeaders(api) },
          body: JSON.stringify(anthropic ? anthropicPayload(options, effectiveMaxTokens, compatibility) : {
            model: api.modelName,
            messages,
            ...(!compatibility.omitTemperature ? { temperature } : {}),
            ...(!compatibility.omitTopP ? { top_p: topP } : {}),
            [compatibility.tokenField]: effectiveMaxTokens,
            stream: streaming,
          }),
          signal,
        }, streaming ? CONNECT_TIMEOUT_MS : NON_STREAM_RESPONSE_TIMEOUT_MS)
        if (!TRANSIENT_COMPLETION_STATUSES.has(response.status) || attempt === 3) return response
        const delay = retryDelay(response, attempt)
        void response.body?.cancel().catch(() => {})
        await waitForRetry(signal, delay)
        continue
      } catch (error) {
        if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error
        lastError = error
        if (attempt === 3) throw error
      }
      // Match the stable behaviour of the older port: short backoff absorbs a
      // relay's one-off overload without making the user resend the turn.
      await waitForRetry(signal, attempt * 700)
    }
    throw lastError instanceof Error ? lastError : new Error('API 请求失败')
  }

  let effectiveMaxTokens = maxTokens
  let affordableAdjusted = false
  let tokenFieldAdjusted = false

  const compatibleResponse = async () => {
    for (let adjustment = 0; adjustment < 5; adjustment += 1) {
      const response = await request(effectiveMaxTokens)
      if (response.ok) return response
      const status = response.status
      const message = await readError(response)
      const affordable = affordableTokenLimit(message, effectiveMaxTokens)
      // Some credit-metered relays price the request from its maximum possible
      // output, then tell us the smaller budget the account can currently fund.
      if (!affordableAdjusted && affordable !== null) {
        affordableAdjusted = true
        effectiveMaxTokens = affordable
        continue
      }
      if (!anthropic && !tokenFieldAdjusted && tokenFieldMismatch(message)) {
        tokenFieldAdjusted = true
        compatibility.tokenField = compatibility.tokenField === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens'
        continue
      }
      if (!compatibility.omitTemperature && unsupportedParameter(message, 'temperature')) {
        compatibility.omitTemperature = true
        continue
      }
      if (!compatibility.omitTopP && unsupportedParameter(message, 'top_p')) {
        compatibility.omitTopP = true
        continue
      }
      const detail = /\bHTTP\s+\d+/i.test(message) ? message : `${message}（HTTP ${status}）`
      throw new ChatApiError(detail, 'response', TRANSIENT_COMPLETION_STATUSES.has(status))
    }
    throw new ChatApiError('接口连续拒绝了兼容参数，请检查模型名称与渠道格式。', 'response')
  }

  for (let streamAttempt = 1; streamAttempt <= 2; streamAttempt += 1) {
    const response = await compatibleResponse()
    const contentType = response.headers.get('content-type') || ''
    try {
      // Some OpenAI-compatible relays ignore `stream: false` and still answer
      // with SSE. Trust the actual response format before the requested mode.
      if (contentType.includes('text/event-stream') || (streaming && !contentType.includes('application/json'))) {
        return await consumeEventStream(response, onDelta, signal, onActivity)
      }
      return await consumeJson(response, onDelta, onActivity)
    } catch (error) {
      if (!(error instanceof ChatApiError) || !error.retryable || streamAttempt === 2 || signal.aborted) throw error
      await waitForRetry(signal, 700)
    }
  }
  throw new ChatApiError('API 请求失败', 'response')
}
