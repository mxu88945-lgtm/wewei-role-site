export const DEFAULT_TOOL_SERVICE_URL = 'https://tools.zhouweiweihome.top'
// 不用 weijing.* 前缀：工具密钥只存本机，不能被备份带走。
const URL_KEY = 'weijing-local.toolServiceUrl'
const KEY_KEY = 'weijing-local.toolServiceKey'

export type ToolServiceConfig = { url: string; key: string }
export type OpenAITool = { type: 'function'; function: { name: string; description?: string; parameters?: Record<string, unknown> } }
export type ToolCall = { id: string; name: string; arguments: string }

export function readToolServiceConfig(storage: Pick<Storage, 'getItem'> = localStorage): ToolServiceConfig {
  let url = DEFAULT_TOOL_SERVICE_URL
  let key = ''
  try { url = storage.getItem(URL_KEY)?.trim() || DEFAULT_TOOL_SERVICE_URL; key = storage.getItem(KEY_KEY) || '' } catch { /* private mode */ }
  return { url: url.replace(/\/$/, ''), key }
}

export function saveToolServiceConfig(config: ToolServiceConfig, storage: Pick<Storage, 'setItem'> = localStorage) {
  try {
    storage.setItem(URL_KEY, (config.url.trim() || DEFAULT_TOOL_SERVICE_URL).replace(/\/$/, ''))
    storage.setItem(KEY_KEY, config.key)
  } catch { /* settings are optional */ }
}

export async function fetchToolDefinitions(config: ToolServiceConfig, signal?: AbortSignal): Promise<OpenAITool[]> {
  if (!config.key.trim() || !config.url.trim()) return []
  const response = await fetch(`${config.url.replace(/\/$/, '')}/tools`, { headers: { Authorization: `Bearer ${config.key}` }, signal })
  if (!response.ok) throw new Error(`工具服务暂不可用（HTTP ${response.status}）`)
  const payload = await response.json() as unknown[] | { tools?: unknown[] }
  const list = Array.isArray(payload) ? payload : payload?.tools
  return Array.isArray(list) ? list.filter((item): item is OpenAITool => Boolean(item && typeof item === 'object' && (item as OpenAITool).type === 'function' && typeof (item as OpenAITool).function?.name === 'string')).slice(0, 16) : []
}

export async function callTool(config: ToolServiceConfig, call: ToolCall, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`${config.url.replace(/\/$/, '')}/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
    body: JSON.stringify({ name: call.name, arguments: parseArguments(call.arguments) }), signal,
  })
  if (!response.ok) throw new Error(`工具调用失败（HTTP ${response.status}）`)
  const payload = await response.json() as { ok?: boolean; result?: unknown; error?: unknown }
  if (payload.ok === false) throw new Error(typeof payload.error === 'string' ? payload.error : '工具返回失败')
  return typeof payload.result === 'string' ? payload.result : JSON.stringify(payload.result ?? '')
}

function parseArguments(value: string) {
  try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' ? parsed : {} } catch { return {} }
}
