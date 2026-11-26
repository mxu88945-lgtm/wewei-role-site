import type { ApiConfig, ChatApiMessage, ChatToolDefinition, CompletionResult } from './chatApi'
import { noteSamplingRejection, samplingRejectedFor } from './chatApi'
import { pushAppUrl, pushDeviceId, pushOn } from './personaPush'

export const RELAY_STORAGE_KEY = 'weijing-local.relay'
export type RelayConfig = { enabled: boolean; url: string; key: string }
export type RelayPending = { id: string; conversationId: string; assistantId: number; createdAt: number }
export type RelayResult = { status: 'running' | 'done' | 'error'; text?: string; error?: string; toolCalls?: Array<{ id: string; name: string; arguments: string }> }
export const RELAY_IDLE_MS = 20_000
export const RELAY_TOTAL_MS = 240_000
const RELAY_POLLS = 5
/** 中继一直没动静：让调用方改走直连。shown 是已经显示出去的半截。 */
export class RelayStalledError extends Error { constructor(readonly shown: string) { super('中继没有动静，改走直连') } }
const cleanUrl = (value: string) => value.trim().replace(/\/+$/, '')
function readStored(): { config?: Partial<RelayConfig>; pending?: RelayPending[] } {
  try { return JSON.parse(localStorage.getItem(RELAY_STORAGE_KEY) || '{}') as { config?: Partial<RelayConfig>; pending?: RelayPending[] } } catch { return {} }
}
function writeStored(value: { config: RelayConfig; pending: RelayPending[] }) { try { localStorage.setItem(RELAY_STORAGE_KEY, JSON.stringify(value)) } catch { /* private mode */ } }
export function readRelayConfig(): RelayConfig { const config = readStored().config || {}; return { enabled: config.enabled === true, url: cleanUrl(config.url || ''), key: config.key || '' } }
export function writeRelayConfig(patch: Partial<RelayConfig>): RelayConfig { const next = { ...readRelayConfig(), ...patch, url: cleanUrl(patch.url ?? readRelayConfig().url) }; writeStored({ config: next, pending: readRelayPending() }); return next }
export function readRelayPending(): RelayPending[] { const pending = readStored().pending; return Array.isArray(pending) ? pending : [] }
function savePending(pending: RelayPending[]) { writeStored({ config: readRelayConfig(), pending }) }
export function clearRelayPending(id: string) { savePending(readRelayPending().filter((item) => item.id !== id)) }
function auth(key: string) { return { Authorization: `Bearer ${key}` } }
function endpoint(api: ApiConfig) { return `${cleanUrl(api.baseUrl)}/${api.protocol === 'anthropic' ? 'messages' : 'chat/completions'}` }
function requestBody(api: ApiConfig, messages: ChatApiMessage[], temperature: number, topP: number, maxTokens: number, tools?: ChatToolDefinition[]) {
  // v339：这个渠道+模型已知不认的 temperature / top_p 不再带（和直连共用一份记录）。
  const rejected = samplingRejectedFor(api)
  const sampling = { ...(rejected.temperature ? {} : { temperature }), ...(rejected.topP ? {} : { top_p: topP }) }
  if (api.protocol === 'anthropic') {
    const system = messages.filter((item) => item.role === 'system').map((item) => typeof item.content === 'string' ? item.content : '').filter(Boolean).join('\n\n')
    return { model: api.modelName, ...(system ? { system } : {}), messages: messages.filter((item) => item.role !== 'system'), ...sampling, max_tokens: maxTokens, stream: true }
  }
  return { model: api.modelName, messages, ...sampling, max_tokens: maxTokens, stream: true, ...(tools?.length ? { tools } : {}) }
}
export async function getRelayResult(id: string): Promise<RelayResult> {
  const config = readRelayConfig(); if (!config.url || !config.key) throw new Error('锁屏中继未配置')
  const response = await fetch(`${config.url}/result/${encodeURIComponent(id)}`, { headers: auth(config.key) })
  const data = await response.json().catch(() => ({})) as RelayResult
  if (!response.ok) throw new Error(data.error || `中继 HTTP ${response.status}`)
  return data
}
export async function startRelay(args: { id: string; conversationId: string; assistantId: number; api: ApiConfig; messages: ChatApiMessage[]; temperature: number; topP: number; maxTokens: number; tools?: ChatToolDefinition[]; signal: AbortSignal; onDelta: (text: string) => void; samplingRetried?: boolean }): Promise<CompletionResult> {
  const config = readRelayConfig(); if (!config.enabled || !config.url || !config.key) throw new Error('锁屏中继未配置')
  const pending = [...readRelayPending().filter((item) => item.id !== args.id), { id: args.id, conversationId: args.conversationId, assistantId: args.assistantId, createdAt: Date.now() }]
  savePending(pending)
  const payload: Record<string, unknown> = { id: args.id, base: endpoint(args.api), key: args.api.apiKey, body: requestBody(args.api, args.messages, args.temperature, args.topP, args.maxTokens, args.tools), title: '惟境' }
  const device = pushOn() ? pushDeviceId() : ''
  if (device) { payload.pushDevice = device; payload.pushUrl = pushAppUrl() }
  // v325：中继卡住时不再无限等。整段最多 4 分钟；连续 20 秒一个字都没来就停下去问 /result。
  const local = new AbortController()
  const abortLocal = () => local.abort()
  args.signal.addEventListener('abort', abortLocal, { once: true })
  const overall = setTimeout(abortLocal, RELAY_TOTAL_MS)
  let idle: ReturnType<typeof setTimeout> | undefined
  const kick = () => { if (idle) clearTimeout(idle); idle = setTimeout(abortLocal, RELAY_IDLE_MS) }
  try {
    kick()
    const response = await fetch(`${config.url}/start`, { method: 'POST', headers: { ...auth(config.key), 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: local.signal })
    if (!response.ok) throw new Error(`中继 HTTP ${response.status}`)
    // v323：中继边跑边把字传回来，这里一段段显示；最后用 /result 补齐没收到的尾巴。
    let shown = ''
    try {
      const reader = response.body?.getReader()
      if (reader) {
        const decoder = new TextDecoder()
        while (true) { kick(); const { done, value } = await reader.read(); if (done) break; const piece = decoder.decode(value, { stream: true }).replace(/\u2060/g, ''); if (piece) { shown += piece; args.onDelta(piece) } }
      } else await response.text()
    } catch (error) { if (args.signal.aborted) throw error }
    if (idle) clearTimeout(idle)
    let result = await getRelayResult(args.id)
    for (let i = 0; i < RELAY_POLLS && result.status === 'running' && !args.signal.aborted; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      result = await getRelayResult(args.id)
    }
    if (result.status === 'error') {
      // v339：上游说不认 temperature / top_p：记下来，换个 id 去掉再走一次中继（只重试一次）。
      if (!args.samplingRetried && noteSamplingRejection(args.api, result.error || shown)) {
        clearRelayPending(args.id)
        clearTimeout(overall); if (idle) clearTimeout(idle)
        args.signal.removeEventListener('abort', abortLocal)
        return startRelay({ ...args, id: `${args.id}-s`, samplingRetried: true })
      }
      throw new Error(result.error || '中继生成失败')
    }
    if (result.status !== 'done') throw new RelayStalledError(shown)
    if (result.text && !shown) args.onDelta(result.text)
    else if (result.text && result.text.length > shown.length && result.text.startsWith(shown)) args.onDelta(result.text.slice(shown.length))
    clearRelayPending(args.id)
    return { finishReason: null, toolCalls: result.toolCalls }
  } catch (error) {
    if (error instanceof RelayStalledError) { clearRelayPending(args.id); throw error }
    // Abort/network errors intentionally leave pending; the next foreground visit can recover it.
    if (args.signal.aborted) throw error
    clearRelayPending(args.id)
    throw error
  } finally {
    clearTimeout(overall); if (idle) clearTimeout(idle)
    args.signal.removeEventListener('abort', abortLocal)
  }
}
export async function recoverRelayPending(): Promise<Array<RelayPending & { result: RelayResult }>> {
  const recovered: Array<RelayPending & { result: RelayResult }> = []
  for (const item of readRelayPending()) {
    try { const result = await getRelayResult(item.id); if (result.status === 'done' || result.status === 'error') { clearRelayPending(item.id); recovered.push({ ...item, result }) } } catch { /* retry on next foreground */ }
  }
  return recovered
}
