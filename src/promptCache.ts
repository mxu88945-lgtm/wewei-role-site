import type { ApiConfig, ChatApiContentPart, ChatApiMessage } from './chatApi'

/**
 * v209：Claude 提示词缓存（OpenAI 兼容格式，OpenRouter 认的写法）。
 * 第一条 system 打 cache_control；最新一条用户消息（v210 起动态尾巴并在它里面）之前的那条消息再打一个。
 * 只对模型名含 claude 的 OpenAI 兼容渠道生效；Gemini 等靠隐式前缀缓存，保持纯字符串。
 * 某个中转站不认数组内容时，chatApi 会去掉标记重试一次，并在本次会话里记住这个渠道。
 */
const unsupportedChannels = new Set<string>()

const channelKey = (api: Pick<ApiConfig, 'baseUrl' | 'modelName'>) => `${api.baseUrl.trim().replace(/\/+$/, '')}|${api.modelName.trim()}`

export const isClaudeModel = (modelName: string | undefined) => /claude/i.test(modelName || '')

export function promptCacheEnabled(api: Pick<ApiConfig, 'baseUrl' | 'modelName' | 'protocol'>) {
  return api.protocol !== 'anthropic' && isClaudeModel(api.modelName) && !unsupportedChannels.has(channelKey(api))
}

export function markPromptCacheUnsupported(api: Pick<ApiConfig, 'baseUrl' | 'modelName'>) {
  unsupportedChannels.add(channelKey(api))
}

export function promptCacheUnsupported(api: Pick<ApiConfig, 'baseUrl' | 'modelName'>) {
  return unsupportedChannels.has(channelKey(api))
}

/** Test helper. */
export function resetPromptCacheMemory() {
  unsupportedChannels.clear()
}

const EPHEMERAL = { type: 'ephemeral' as const }

function markLastText(content: ChatApiMessage['content']): ChatApiMessage['content'] | null {
  if (typeof content === 'string') return content ? [{ type: 'text', text: content, cache_control: EPHEMERAL }] : null
  let index = -1
  content.forEach((part, at) => { if (part.type === 'text' && part.text) index = at })
  if (index < 0) return null
  return content.map((part, at) => at === index && part.type === 'text' ? { ...part, cache_control: EPHEMERAL } : part)
}

/**
 * Up to two breakpoints: the stable first system message, and the conversation turn right
 * before the latest user turn (which carries the per-turn tail since v210). Never mutates the input.
 */
export function withPromptCache(messages: ChatApiMessage[], api: Pick<ApiConfig, 'baseUrl' | 'modelName' | 'protocol'>): ChatApiMessage[] {
  if (!promptCacheEnabled(api) || messages[0]?.role !== 'system') return messages
  const result = messages.slice()
  const first = markLastText(result[0].content)
  if (!first) return messages
  result[0] = { ...result[0], content: first }
  // v210：动态尾巴已经并进最新一条用户消息；第二个断点打在它前一条（上一轮的最后一条消息）。
  let latestUser = -1
  for (let index = result.length - 1; index > 0; index -= 1) if (result[index].role === 'user') { latestUser = index; break }
  const before = latestUser - 1
  if (before > 0 && result[before].role !== 'system') {
    const marked = markLastText(result[before].content)
    if (marked) result[before] = { ...result[before], content: marked }
  }
  return result
}

export function hasPromptCache(messages: ChatApiMessage[]) {
  return messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === 'text' && part.cache_control))
}

/** Back to plain content: text-only arrays collapse to the original string; image turns keep their parts. */
export function stripPromptCache(messages: ChatApiMessage[]): ChatApiMessage[] {
  if (!hasPromptCache(messages)) return messages
  return messages.map((message) => {
    if (typeof message.content === 'string' || !message.content.some((part) => part.type === 'text' && part.cache_control)) return message
    const parts = message.content.map((part): ChatApiContentPart => {
      if (part.type !== 'text' || !part.cache_control) return part
      const { cache_control: _drop, ...rest } = part
      void _drop
      return rest
    })
    return { ...message, content: parts.every((part) => part.type === 'text') ? parts.map((part) => part.type === 'text' ? part.text : '').join('') : parts }
  })
}
