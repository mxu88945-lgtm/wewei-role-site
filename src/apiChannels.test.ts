import { describe, expect, it } from 'vitest'
import { createApiChannel, normalizeApiChannels, withApiModel } from './apiChannels'

describe('api channels', () => {
  it('将旧单渠道配置迁移为默认渠道', () => {
    const channels = normalizeApiChannels([], { baseUrl: 'https://old.example/v1', apiKey: 'secret', modelName: 'old-model' })
    expect(channels).toHaveLength(1)
    expect(channels[0]).toMatchObject({ name: '默认渠道', baseUrl: 'https://old.example/v1', apiKey: 'secret', modelName: 'old-model', maxTokenField: 'auto' })
  })

  it('保留多个渠道并补齐兼容字段', () => {
    const channels = normalizeApiChannels([
      { id: 'one', name: '小克', baseUrl: 'https://one/v1', apiKey: 'a', modelName: 'model-a', maxTokenField: 'max_tokens' },
      { id: 'two', name: 'OpenAI', baseUrl: 'https://two/v1', apiKey: 'b', modelName: 'gpt-5', maxTokenField: 'max_completion_tokens' },
    ], { baseUrl: '', apiKey: '', modelName: '' })
    expect(channels.map((item) => item.name)).toEqual(['小克', 'OpenAI'])
    expect(channels[1].maxTokenField).toBe('max_completion_tokens')
  })

  it('同一渠道可为成员覆盖不同模型', () => {
    const channel = createApiChannel(1, { baseUrl: 'https://same.example/v1', apiKey: 'shared-key', modelName: 'default-model' })
    const memberChannel = withApiModel(channel, 'member-model')

    expect(memberChannel).toMatchObject({ id: channel.id, baseUrl: channel.baseUrl, apiKey: channel.apiKey, modelName: 'member-model' })
    expect(channel.modelName).toBe('default-model')
    expect(withApiModel(channel, '')).toBe(channel)
  })
})
