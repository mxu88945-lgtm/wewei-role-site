import type { ApiConfig } from './chatApi'

export type MaxTokenField = 'auto' | 'max_tokens' | 'max_completion_tokens'
export type ApiProtocol = 'openai' | 'anthropic'
export type ApiPlatform = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'openrouter' | 'xai' | 'custom-openai' | 'custom-anthropic'

export type ApiPlatformPreset = {
  id: ApiPlatform
  label: string
  shortLabel: string
  protocol: ApiProtocol
  baseUrl?: string
  description: string
}

export const API_PLATFORM_PRESETS: ApiPlatformPreset[] = [
  { id: 'openai', label: 'GPT（OpenAI）', shortLabel: 'OpenAI 官方', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', description: 'OpenAI 官方接口' },
  { id: 'anthropic', label: 'Claude（Anthropic）', shortLabel: 'Claude 官方', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', description: 'Anthropic 原生 Messages 协议' },
  { id: 'gemini', label: 'Gemini（Google AI Studio）', shortLabel: 'Gemini 官方', protocol: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', description: 'Google 官方 OpenAI 兼容接口' },
  { id: 'deepseek', label: 'DeepSeek', shortLabel: 'DeepSeek 官方', protocol: 'openai', baseUrl: 'https://api.deepseek.com', description: 'DeepSeek 官方兼容接口' },
  { id: 'openrouter', label: 'OpenRouter', shortLabel: 'OpenRouter', protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1', description: 'OpenRouter 官方兼容接口' },
  { id: 'xai', label: 'Grok（xAI）', shortLabel: 'Grok 官方', protocol: 'openai', baseUrl: 'https://api.x.ai/v1', description: 'xAI 官方兼容接口' },
  { id: 'custom-openai', label: '自定义（OpenAI 协议）', shortLabel: '自定义 OpenAI', protocol: 'openai', description: '保留自定义地址' },
  { id: 'custom-anthropic', label: '自定义（Anthropic 协议）', shortLabel: '自定义 Claude', protocol: 'anthropic', description: '保留自定义地址' },
]

const PRESET_BY_ID = new Map(API_PLATFORM_PRESETS.map((preset) => [preset.id, preset]))

export type ApiChannel = ApiConfig & {
  id: string
  name: string
  platform: ApiPlatform
  protocol: ApiProtocol
  maxTokenField: MaxTokenField
}

export function getApiPlatformPreset(platform: ApiPlatform) {
  return PRESET_BY_ID.get(platform) || PRESET_BY_ID.get('custom-openai')!
}

export function inferApiPlatform(baseUrl: string, protocol: ApiProtocol = 'openai'): ApiPlatform {
  const normalized = baseUrl.trim().replace(/\/+$/, '').toLowerCase()
  const official = API_PLATFORM_PRESETS.find((preset) => preset.baseUrl?.toLowerCase() === normalized)
  return official?.id || (protocol === 'anthropic' ? 'custom-anthropic' : 'custom-openai')
}

export function applyApiPlatform(channel: ApiChannel, platform: ApiPlatform): ApiChannel {
  const preset = getApiPlatformPreset(platform)
  return {
    ...channel,
    platform,
    protocol: preset.protocol,
    baseUrl: preset.baseUrl || channel.baseUrl,
  }
}

export function createApiChannel(index: number, source?: Partial<ApiChannel>): ApiChannel {
  const protocol = source?.protocol === 'anthropic' ? 'anthropic' : 'openai'
  const baseUrl = source?.baseUrl || 'https://api.openai.com/v1'
  const platform = source?.platform && PRESET_BY_ID.has(source.platform) ? source.platform : inferApiPlatform(baseUrl, protocol)
  return {
    id: crypto.randomUUID(),
    name: index === 1 ? '默认渠道' : `渠道 ${index}`,
    platform,
    protocol: getApiPlatformPreset(platform).protocol,
    baseUrl,
    apiKey: source?.apiKey || '',
    modelName: source?.modelName || '',
    maxTokenField: source?.maxTokenField || 'auto',
  }
}

export function normalizeApiChannels(value: unknown, legacy: ApiConfig): ApiChannel[] {
  if (!Array.isArray(value) || value.length === 0) return [createApiChannel(1, legacy)]
  return value.map((item, index) => {
    const channel = item && typeof item === 'object' ? item as Partial<ApiChannel> : {}
    const protocol = channel.protocol === 'anthropic' ? 'anthropic' : 'openai'
    // Older builds stored the only API under `weijing.api`. If a channel was
    // created before that value was migrated, keep its name/model but restore
    // missing connection fields from the legacy config.
    const legacyFallback = index === 0 ? legacy : undefined
    const baseUrl = channel.baseUrl?.trim() || legacyFallback?.baseUrl?.trim() || 'https://api.openai.com/v1'
    const platform = channel.platform && PRESET_BY_ID.has(channel.platform) ? channel.platform : inferApiPlatform(baseUrl, protocol)
    return {
      id: channel.id || crypto.randomUUID(),
      name: channel.name?.trim() || `渠道 ${index + 1}`,
      platform,
      protocol: getApiPlatformPreset(platform).protocol,
      baseUrl,
      apiKey: channel.apiKey?.trim() || legacyFallback?.apiKey?.trim() || '',
      modelName: channel.modelName?.trim() || legacyFallback?.modelName?.trim() || '',
      maxTokenField: channel.maxTokenField === 'max_tokens' || channel.maxTokenField === 'max_completion_tokens'
        ? channel.maxTokenField
        : legacyFallback?.maxTokenField === 'max_tokens' || legacyFallback?.maxTokenField === 'max_completion_tokens'
          ? legacyFallback.maxTokenField
          : 'auto',
    }
  })
}

export function withApiModel(channel: ApiChannel, modelName?: string): ApiChannel {
  const override = modelName?.trim()
  return override ? { ...channel, modelName: override } : channel
}

export function isApiChannelComplete(channel?: Pick<ApiConfig, 'baseUrl' | 'apiKey' | 'modelName'> | null): boolean {
  return Boolean(channel?.baseUrl?.trim() && channel.apiKey?.trim() && channel.modelName?.trim())
}

/**
 * Resolve a member's channel without letting stale conversation bindings
 * block a reply. Conversations can outlive deleted/renamed channels, and
 * single chats can still carry the per-member settings written by the member
 * picker. A complete bound channel wins; otherwise use the current channel,
 * then any other complete channel as a last-resort migration path.
 */
export function resolveApiChannel(
  channels: ApiChannel[],
  fallback: ApiChannel,
  channelId?: string,
  modelName?: string,
): ApiChannel {
  const bound = channelId ? channels.find((channel) => channel.id === channelId) : undefined
  const boundWithModel = bound ? withApiModel(bound, modelName) : undefined
  if (boundWithModel && isApiChannelComplete(boundWithModel)) return boundWithModel

  const fallbackWithModel = withApiModel(fallback, modelName)
  if (isApiChannelComplete(fallbackWithModel)) return fallbackWithModel

  const otherComplete = channels.find((channel) => isApiChannelComplete(channel))
  if (otherComplete) return otherComplete

  // Preserve the most relevant incomplete object so the caller can show the
  // existing, character-specific configuration message when nothing works.
  return boundWithModel || fallbackWithModel
}
