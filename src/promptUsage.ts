/**
 * v210：缓存命中读数。她用中转站，看不到 OpenRouter 后台，所以从接口返回的 usage 里读：
 * 输入 token 数、缓存命中 token 数。每个入口（长剧情 / 人格窗口）只记最近一次，存一个很小的 localStorage 键。
 */
/** v212: cacheReported = the relay sent any cache field at all (0 hits vs. not reported). */
export type PromptUsage = { promptTokens: number; cachedTokens: number; cacheWriteTokens?: number; cacheReported: boolean }
export type PromptUsageSurface = 'main' | 'persona'
export type PromptUsageRecord = { promptTokens: number; cached: number; cacheReported?: boolean; at: number } | { none: true; at: number }

const KEY = 'weijing.promptUsage'

const num = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined

/** Normalize the usage shapes OpenAI-compatible relays, Anthropic and Gemini bridges send back. */
export function readUsage(data: unknown): PromptUsage | null {
  if (!data || typeof data !== 'object') return null
  const source = data as Record<string, any>
  const candidates = [source.usage, source.message?.usage, source.response?.usage, source.usageMetadata, source.usage_metadata, source.response?.usageMetadata]
    .filter((item) => item && typeof item === 'object')
  let best: PromptUsage | null = null
  let anyReported = false
  for (const usage of candidates) {
    const openAiPrompt = num(usage.prompt_tokens) ?? num(usage.promptTokenCount) ?? num(usage.prompt_token_count)
    const input = num(usage.input_tokens)
    const cacheRead = num(usage.prompt_tokens_details?.cached_tokens) ?? num(usage.cache_read_input_tokens) ?? num(usage.cached_content_token_count)
      ?? num(usage.cachedContentTokenCount) ?? num(usage.input_tokens_details?.cached_tokens) ?? num(usage.prompt_cache_hit_tokens) ?? 0
    const cacheWrite = num(usage.cache_creation_input_tokens) ?? 0
    const cacheReported = [usage.prompt_tokens_details?.cached_tokens, usage.cache_read_input_tokens, usage.cached_content_token_count, usage.cachedContentTokenCount,
      usage.input_tokens_details?.cached_tokens, usage.prompt_cache_hit_tokens, usage.cache_creation_input_tokens, usage.prompt_cache_miss_tokens].some((value) => num(value) !== undefined)
    let promptTokens: number | undefined
    if (openAiPrompt !== undefined) promptTokens = openAiPrompt < cacheRead ? openAiPrompt + cacheRead + cacheWrite : openAiPrompt
    // Anthropic: input_tokens excludes cache reads/writes.
    else if (input !== undefined) promptTokens = input + cacheRead + cacheWrite
    if (!promptTokens) continue
    const next: PromptUsage = { promptTokens, cachedTokens: Math.min(cacheRead, promptTokens), ...(cacheWrite ? { cacheWriteTokens: cacheWrite } : {}), cacheReported }
    if (cacheReported) anyReported = true
    if (!best || next.promptTokens >= best.promptTokens) best = next
  }
  return best ? { ...best, cacheReported: anyReported } : null
}

/** Later stream events may repeat or extend usage; keep the most complete reading. */
export function mergeUsage(current: PromptUsage | null, next: PromptUsage | null): PromptUsage | null {
  if (!next) return current
  if (!current) return next
  return {
    promptTokens: Math.max(current.promptTokens, next.promptTokens),
    cachedTokens: Math.max(current.cachedTokens, next.cachedTokens),
    ...((current.cacheWriteTokens || next.cacheWriteTokens) ? { cacheWriteTokens: Math.max(current.cacheWriteTokens || 0, next.cacheWriteTokens || 0) } : {}),
    cacheReported: current.cacheReported || next.cacheReported,
  }
}

const listeners = new Set<() => void>()

export function readPromptUsage(): Partial<Record<PromptUsageSurface, PromptUsageRecord>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function recordPromptUsage(surface: PromptUsageSurface, usage: PromptUsage | null, at = Date.now()) {
  const record: PromptUsageRecord = usage ? { promptTokens: usage.promptTokens, cached: usage.cachedTokens, cacheReported: usage.cacheReported, at } : { none: true, at }
  try { localStorage.setItem(KEY, JSON.stringify({ ...readPromptUsage(), [surface]: record })) } catch { /* tiny key; never block a reply */ }
  listeners.forEach((listener) => listener())
}

export const subscribePromptUsage = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export function formatPromptUsage(record: PromptUsageRecord | undefined) {
  if (!record) return '还没有记录（发一条消息后显示）'
  if ('none' in record) return '这个渠道没有返回用量信息'
  // Records stored before v212 have no flag; treat them as reported.
  if (record.cacheReported === false) return `最近一次：输入 ${record.promptTokens.toLocaleString('en-US')} tokens · 这个渠道不报缓存`
  const percent = record.promptTokens ? Math.round((record.cached / record.promptTokens) * 100) : 0
  return `最近一次：输入 ${record.promptTokens.toLocaleString('en-US')} tokens · 缓存命中 ${record.cached.toLocaleString('en-US')}（${percent}%）`
}
