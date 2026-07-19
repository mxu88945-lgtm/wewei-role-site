import { describe, expect, it } from 'vitest'
import { applyApiPlatform, createApiChannel, normalizeApiChannels, withApiModel } from './apiChannels'

describe('api channels', () => {
  it('将旧单渠道配置迁移为默认渠道', () => {
    const channels = normalizeApiChannels([], { baseUrl: 'https://old.example/v1', apiKey: 'secret', modelName: 'old-model' })
    expect(channels).toHaveLength(1)
    expect(channels[0]).toMatchObject({ name: '默认渠道', platform: 'custom-openai', protocol: 'openai', baseUrl: 'https://old.example/v1', apiKey: 'secret', modelName: 'old-model', maxTokenField: 'auto' })
  })

  it('识别旧渠道的官方平台且不改动密钥与模型', () => {
    const channels = normalizeApiChannels([
      { id: 'gemini', name: '闪闪', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', apiKey: 'gemini-key', modelName: 'gemini-model' },
    ], { baseUrl: '', apiKey: '', modelName: '' })
    expect(channels[0]).toMatchObject({ platform: 'gemini', protocol: 'openai', apiKey: 'gemini-key', modelName: 'gemini-model' })
  })

  it('切换官方平台只替换协议与地址', () => {
    const channel = createApiChannel(1, { apiKey: 'keep-key', modelName: 'keep-model' })
    const next = applyApiPlatform(channel, 'anthropic')
    expect(next).toMatchObject({ platform: 'anthropic', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKey: 'keep-key', modelName: 'keep-model' })
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
