import { describe, expect, it } from 'vitest'
import { applyApiPlatform, createApiChannel, isApiChannelComplete, normalizeApiChannels, resolveApiChannel, withApiModel } from './apiChannels'

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

  it('已有多渠道配置缺字段时，会从旧版单渠道配置补回连接信息', () => {
    const channels = normalizeApiChannels([
      { id: 'nodex', name: 'Nodex', modelName: '[按次]gemini-3.7-flash' },
    ], { baseUrl: 'https://relay.example/v1', apiKey: 'legacy-key', modelName: 'legacy-model', maxTokenField: 'max_tokens' })

    expect(channels[0]).toMatchObject({
      id: 'nodex',
      name: 'Nodex',
      baseUrl: 'https://relay.example/v1',
      apiKey: 'legacy-key',
      modelName: '[按次]gemini-3.7-flash',
      maxTokenField: 'max_tokens',
    })
  })

  it('成员绑定不完整时回退到当前可用渠道', () => {
    const configured = createApiChannel(1, { baseUrl: 'https://configured.example/v1', apiKey: 'key', modelName: 'default-model' })
    configured.id = 'configured'
    const stale = createApiChannel(2, { baseUrl: '', apiKey: '', modelName: 'member-model' })
    stale.id = 'stale'

    const resolved = resolveApiChannel([stale, configured], stale, 'stale', 'member-model')

    expect(isApiChannelComplete(resolved)).toBe(true)
    expect(resolved).toMatchObject({ id: 'configured', modelName: 'default-model' })
  })

  it('成员绑定完整时保留成员自己的模型覆盖', () => {
    const channel = createApiChannel(1, { baseUrl: 'https://configured.example/v1', apiKey: 'key', modelName: 'default-model' })
    channel.id = 'configured'

    const resolved = resolveApiChannel([channel], channel, 'configured', 'member-model')

    expect(resolved).toMatchObject({ id: 'configured', modelName: 'member-model' })
  })
})
