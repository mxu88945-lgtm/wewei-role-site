import type { ApiConfig, ChatApiMessage, ChatToolDefinition, CompletionResult } from './chatApi'
import { pushAppUrl, pushDeviceId, pushOn } from './personaPush'

export const RELAY_STORAGE_KEY = 'weijing-local.relay'
export type RelayConfig = { enabled: boolean; url: string; key: string }
export type RelayPending = { id: string; conversationId: string; assistantId: number; createdAt: number }
export type RelayResult = { status: 'running' | 'done' | 'error'; text?: string; error?: string; toolCalls?: Array<{ id: string; name: string; arguments: string }> }
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
  if (api.protocol === 'anthropic') {
    const system = messages.filter((item) => item.role === 'system').map((item) => typeof item.content === 'string' ? item.content : '').filter(Boolean).join('\n\n')
    return { model: api.modelName, ...(system ? { system } : {}), messages: messages.filter((item) => item.role !== 'system'), temperature, top_p: topP, max_tokens: maxTokens, stream: true }
  }
  return { model: api.modelName, messages, temperature, top_p: topP, max_tokens: maxTokens, stream: true, ...(tools?.length ? { tools } : {}) }
}
export async function getRelayResult(id: string): Promise<RelayResult> {
  const config = readRelayConfig(); if (!config.url || !config.key) throw new Error('锁屏中继未配置')
  const response = await fetch(`${config.url}/result/${encodeURIComponent(id)}`, { headers: auth(config.key) })
  const data = await response.json().catch(() => ({})) as RelayResult
  if (!response.ok) throw new Error(data.error || `中继 HTTP ${response.status}`)
  return data
}
export async function startRelay(args: { id: string; conversationId: string; assistantId: number; api: ApiConfig; messages: ChatApiMessage[]; temperature: number; topP: number; maxTokens: number; tools?: ChatToolDefinition[]; signal: AbortSignal; onDelta: (text: string) => void }): Promise<CompletionResult> {
  const config = readRelayConfig(); if (!config.enabled || !config.url || !config.key) throw new Error('锁屏中继未配置')
  const pending = [...readRelayPending().filter((item) => item.id !== args.id), { id: args.id, conversationId: args.conversationId, assistantId: args.assistantId, createdAt: Date.now() }]
  savePending(pending)
  const payload: Record<string, unknown> = { id: args.id, base: endpoint(args.api), key: args.api.apiKey, body: requestBody(args.api, args.messages, args.temperature, args.topP, args.maxTokens, args.tools), title: '惟境' }
  const device = pushOn() ? pushDeviceId() : ''
  if (device) { payload.pushDevice = device; payload.pushUrl = pushAppUrl() }
  try {
    const response = await fetch(`${config.url}/start`, { method: 'POST', headers: { ...auth(config.key), 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: args.signal })
    if (!response.ok) throw new Error(`中继 HTTP ${response.status}`)
    // v323：中继边跑边把字传回来，这里一段段显示；最后用 /result 补齐没收到的尾巴。
    let shown = ''
    try {
      const reader = response.body?.getReader()
      if (reader) {
        const decoder = new TextDecoder()
        while (true) { const { done, value } = await reader.read(); if (done) break; const piece = decoder.decode(value, { stream: true }); if (piece) { shown += piece; args.onDelta(piece) } }
      } else await response.text()
    } catch (error) { if (args.signal.aborted) throw error }
    const result = await getRelayResult(args.id)
    if (result.status === 'error') throw new Error(result.error || '中继生成失败')
    if (result.status !== 'done') throw new Error('中继仍在生成，回到前台后会自动取回')
    if (result.text && !shown) args.onDelta(result.text)
    else if (result.text && result.text.length > shown.length && result.text.startsWith(shown)) args.onDelta(result.text.slice(shown.length))
    clearRelayPending(args.id)
    return { finishReason: null, toolCalls: result.toolCalls }
  } catch (error) {
    // Abort/network errors intentionally leave pending; the next foreground visit can recover it.
    if (args.signal.aborted) throw error
    clearRelayPending(args.id)
    throw error
  }
}
export async function recoverRelayPending(): Promise<Array<RelayPending & { result: RelayResult }>> {
  const recovered: Array<RelayPending & { result: RelayResult }> = []
  for (const item of readRelayPending()) {
    try { const result = await getRelayResult(item.id); if (result.status === 'done' || result.status === 'error') { clearRelayPending(item.id); recovered.push({ ...item, result }) } } catch { /* retry on next foreground */ }
  }
  return recovered
}
