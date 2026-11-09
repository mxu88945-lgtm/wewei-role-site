/**
 * 向量嵌入请求：OpenAI 兼容 POST {baseUrl}/embeddings，请求体 {model, input:[...]}。
 * Key 复用 API 渠道里那把。渠道如果走的是自己的中转（没有 /embeddings，返回 404/405），
 * 自动退回硅基流动直连 https://api.siliconflow.cn/v1。
 */
export const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1'

export type EmbedChannel = { baseUrl: string; apiKey: string; protocol?: 'openai' | 'anthropic' }

function trim(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

async function errorText(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } | string; message?: string }
  const detail = typeof data.error === 'string' ? data.error : data.error?.message || data.message || ''
  return `HTTP ${res.status}${detail ? ` ${detail}` : ''}`
}

function parse(data: unknown, count: number): number[][] {
  const rows = (data as { data?: Array<{ embedding?: number[]; index?: number }> })?.data
  if (!Array.isArray(rows) || rows.length !== count) throw new Error('向量接口返回的条数不对')
  return [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((row) => {
    if (!Array.isArray(row.embedding) || !row.embedding.length) throw new Error('向量接口没有返回 embedding')
    return row.embedding
  })
}

async function post(baseUrl: string, apiKey: string, model: string, input: string[], signal?: AbortSignal): Promise<Response> {
  return fetch(`${trim(baseUrl)}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
    body: JSON.stringify({ model, input }),
    signal,
  })
}

export async function embedTexts(channel: EmbedChannel, model: string, input: string[], signal?: AbortSignal): Promise<number[][]> {
  if (!input.length) return []
  if (channel.protocol === 'anthropic') throw new Error('Claude 原生渠道没有向量接口，请选 OpenAI 兼容渠道（如硅基流动）')
  if (!channel.baseUrl.trim() || !channel.apiKey.trim()) throw new Error('这个渠道还没填接口地址或 Key')
  let res = await post(channel.baseUrl, channel.apiKey, model, input, signal)
  if ((res.status === 404 || res.status === 405) && trim(channel.baseUrl).toLowerCase() !== SILICONFLOW_BASE_URL) {
    // 中转没有 /embeddings：直连硅基流动
    res = await post(SILICONFLOW_BASE_URL, channel.apiKey, model, input, signal)
  }
  if (!res.ok) throw new Error(await errorText(res))
  return parse(await res.json(), input.length)
}
