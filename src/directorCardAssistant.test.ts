import { describe, expect, it } from 'vitest'
import { createDirectorTemplateConfig } from './directorTemplate'
import { buildDirectorCardAssistantInput, parseDirectorCardAssistantResponse } from './directorCardAssistant'

describe('director card assistant', () => {
  it('includes independent card material without local API credentials', () => {
    const current = { ...createDirectorTemplateConfig(), temporaryPlot: '今晚只让门外出现一份快递' }
    const input = buildDirectorCardAssistantInput({
      current,
      userName: '周惟惟',
      characters: [{
        id: 'yan', name: '晏承肆', tagline: '冷静的执行总裁', description: '晏和控股继承人', personality: '克制、果断', scenario: '回国后的第三天',
        greeting: '会议室的门没有关。', alternateGreetings: [], mesExample: '', creatorNotes: '只作为资料', systemPrompt: '角色卡正文', postHistoryInstructions: '',
        tags: [], creator: '', characterVersion: '', regexScripts: [], characterBook: { name: '私有书', entries: [{ id: 1, keys: ['旧案'], secondary_keys: [], comment: '秘密', content: '三年前的旧案', constant: true, selective: false, insertion_order: 1, enabled: true, position: 'before_char', use_regex: false, extensions: {} }] },
      }],
    })
    expect(input).toContain('三年前的旧案')
    expect(input).toContain('角色卡正文')
    expect(input).toContain('今晚只让门外出现一份快递')
    expect(input).not.toContain('apiKey')
  })

  it('keeps local controls and the late-fill instruction while applying generated fields', () => {
    const current = { ...createDirectorTemplateConfig(), apiId: 'channel-a', modelName: 'model-a', temporaryPlot: '用户手写推进' }
    const parsed = parseDirectorCardAssistantResponse('```json\n{"storyTitle":"回国后的第三天","worldBackground":"现代都市","temporaryPlot":"模型改写的推进","apiId":"other","modelName":"other-model"}\n```', current)
    expect(parsed.storyTitle).toBe('回国后的第三天')
    expect(parsed.worldBackground).toBe('现代都市')
    expect(parsed.temporaryPlot).toBe('用户手写推进')
    expect(parsed.apiId).toBe('channel-a')
    expect(parsed.modelName).toBe('model-a')
  })

  it('reports malformed model output clearly', () => {
    expect(() => parseDirectorCardAssistantResponse('not json', createDirectorTemplateConfig())).toThrow('可识别')
  })
})
