import { describe, expect, it } from 'vitest'
import { buildChatPrompt } from './promptBuilder'
import type { Character } from './characterCard'

const character: Character = {
  id: 'test',
  name: '顾荒',
  tagline: '',
  description: '乐队主唱。',
  personality: '克制。',
  scenario: '后台。',
  greeting: '你来了。',
  alternateGreetings: [],
  mesExample: '',
  creatorNotes: '',
  systemPrompt: '保持角色口吻。',
  postHistoryInstructions: '缓慢推进。',
  tags: [],
  creator: '',
  characterVersion: '',
  regexScripts: [{
    id: 'prompt-rule', scriptName: '提示词替换', findRegex: '秘密', replaceString: '约定', trimStrings: [], placement: [1], disabled: false,
    markdownOnly: false, promptOnly: true, runOnEdit: false, substituteRegex: 0, minDepth: null, maxDepth: null,
  }],
  characterBook: {
    name: '测试世界书',
    entries: [
      { id: 1, keys: ['后台'], secondary_keys: [], comment: '触发', content: '{{char}}在后台留了一把钥匙。', constant: false, selective: false, insertion_order: 10, enabled: true, position: 'after_char', use_regex: false, extensions: {} },
      { id: 2, keys: ['不存在'], secondary_keys: [], comment: '不触发', content: '这段不应出现', constant: false, selective: false, insertion_order: 20, enabled: true, position: 'after_char', use_regex: false, extensions: {} },
      { id: 3, keys: [], secondary_keys: [], comment: '深度规则', content: '严禁代替惟惟行动。', constant: true, selective: false, insertion_order: 30, enabled: true, position: 'after_char', use_regex: false, extensions: { position: 4, depth: 1, role: 0 } },
    ],
  },
}

describe('buildChatPrompt', () => {
  it('组装角色、世界书、长期记忆并执行提示词正则', () => {
    const result = buildChatPrompt({
      character,
      user: { name: '惟惟', description: '由用户决定自己的行动。' },
      messages: [{ role: 'user', text: '我回到后台，想起那个秘密。' }],
      preset: '细腻慢热。',
      globalWorldbook: '现代都市。',
      theaterWorldBackground: '本剧场发生在雨夜后台，顾荒与陆时宴彼此敌视。',
      memory: { entries: [{ content: '两人曾在雨夜见面。' }], injectPosition: 'after-main-prompt', injectPrompt: '长期记忆：\n{{memories}}' },
      memoryLength: 20,
      contextSummary: '此前两人已经约定共同保守钥匙的秘密。',
    })

    const all = result.map((message) => message.content).join('\n')
    expect(all).toContain('细腻慢热')
    expect(all).toContain('现代都市')
    expect(all).toContain('【全局世界书】')
    expect(all.match(/现代都市/g)).toHaveLength(1)
    expect(all).toContain('【本剧场世界观背景｜本剧场所有角色与 NPC 共用】')
    expect(all).toContain('本剧场发生在雨夜后台，顾荒与陆时宴彼此敌视。')
    expect(all).toContain('顾荒在后台留了一把钥匙')
    expect(all).not.toContain('这段不应出现')
    expect(all).toContain('两人曾在雨夜见面')
    expect(all).toContain('较早对话压缩摘要')
    expect(all).toContain('共同保守钥匙的秘密')
    expect(result.find((message) => message.role === 'user')?.content).toContain('那个约定')
    expect(all).toContain('严禁代替惟惟行动')
    const finalMessage = result[result.length - 1]
    expect(finalMessage).toEqual(expect.objectContaining({ role: 'system' }))
    expect(finalMessage?.content).toContain('惟惟只由真实用户控制')
    expect(finalMessage?.content).toContain('停在可回应的位置并等待用户输入')
  })

  it('不同剧场只注入各自的世界观背景，不会串台', () => {
    const baseInput = {
      character,
      user: { name: '惟惟', description: '由用户决定自己的行动。' },
      messages: [{ role: 'user' as const, text: '继续。' }],
      preset: '',
      globalWorldbook: '',
      memory: { entries: [], injectPosition: 'none', injectPrompt: '{{memories}}' },
      memoryLength: 20,
    }
    const rainTheater = buildChatPrompt({ ...baseInput, theaterWorldBackground: '雨夜剧场：顾荒与方玫是契约婚姻。' })
    const spaceTheater = buildChatPrompt({ ...baseInput, theaterWorldBackground: '星舰剧场：所有成员正在木卫二执行任务。' })
    const rainPrompt = rainTheater.map((message) => message.content).join('\n')
    const spacePrompt = spaceTheater.map((message) => message.content).join('\n')

    expect(rainPrompt).toContain('雨夜剧场：顾荒与方玫是契约婚姻。')
    expect(rainPrompt).not.toContain('星舰剧场')
    expect(spacePrompt).toContain('星舰剧场：所有成员正在木卫二执行任务。')
    expect(spacePrompt).not.toContain('雨夜剧场')
  })
})
