import type { ApiConfig } from './chatApi'

export type MaxTokenField = 'auto' | 'max_tokens' | 'max_completion_tokens'

export type ApiChannel = ApiConfig & {
  id: string
  name: string
  maxTokenField: MaxTokenField
}

export function createApiChannel(index: number, source?: Partial<ApiConfig>): ApiChannel {
  return {
    id: crypto.randomUUID(),
    name: index === 1 ? '默认渠道' : `渠道 ${index}`,
    baseUrl: source?.baseUrl || 'https://api.openai.com/v1',
    apiKey: source?.apiKey || '',
    modelName: source?.modelName || '',
    maxTokenField: 'auto',
  }
}

export function normalizeApiChannels(value: unknown, legacy: ApiConfig): ApiChannel[] {
  if (!Array.isArray(value) || value.length === 0) return [createApiChannel(1, legacy)]
  return value.map((item, index) => {
    const channel = item && typeof item === 'object' ? item as Partial<ApiChannel> : {}
    return {
      id: channel.id || crypto.randomUUID(),
      name: channel.name?.trim() || `渠道 ${index + 1}`,
      baseUrl: channel.baseUrl || 'https://api.openai.com/v1',
      apiKey: channel.apiKey || '',
      modelName: channel.modelName || '',
      maxTokenField: channel.maxTokenField === 'max_tokens' || channel.maxTokenField === 'max_completion_tokens' ? channel.maxTokenField : 'auto',
    }
  })
}

export function withApiModel(channel: ApiChannel, modelName?: string): ApiChannel {
  const override = modelName?.trim()
  return override ? { ...channel, modelName: override } : channel
}
