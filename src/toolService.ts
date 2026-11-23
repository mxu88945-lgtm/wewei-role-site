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

/**
 * v320：工具回合只能整段返回（不能边写边显示），以前每条都走，回复显得很慢。
 * 现在只有像要查东西的话（带链接、或说了查/搜/新闻/天气/最新/价格之类）才带工具，其余照常流式。
 */
const TOOL_INTENT = /https?:\/\/|www\.|查一?下|查查|帮我查|搜一?下|搜搜|搜索|上网|网上|百度|谷歌|google|新闻|热搜|天气|气温|最新|今天几号|现在几点|汇率|股价|价格|多少钱|链接|网址|网页|这篇|看看这个/i
export function wantsRoleTools(text: string | undefined | null) {
  return Boolean(text && TOOL_INTENT.test(text))
}
