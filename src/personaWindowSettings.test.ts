import 'fake-indexeddb/auto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Character } from './characterCard'
import PersonaSettingsHome from './PersonaSettingsHome'
import { activeThread, addPersonaThread, createPersonaWindow, emptyPersonaState, enablePersona, normalizePersonaState, personaIdFor, updatePersona } from './personaWindow'
import { buildPersonaRequest } from './personaWindowRuntime'
import { durableGet, durableSet } from './persistentStore'

const card: Character = {
  id: 'yu', name: '虞山行', tagline: '', description: '市委书记，寡言护短。', personality: '有自己的判断，外冷内热。', scenario: '午夜的私人起居室', greeting: '推开书房门。', alternateGreetings: [],
  mesExample: '', systemPrompt: '你是市委书记，和宁梦曦结婚。', postHistoryInstructions: '', creatorNotes: '', creator: '', characterVersion: '', tags: [], regexScripts: [],
  characterBook: { name: '人设', entries: [{ id: 1, keys: [], secondary_keys: [], comment: '', content: '虞家往事：相识于旧年。', constant: true, selective: false, insertion_order: 1, enabled: true, position: 'at_depth', use_regex: false, extensions: { role: 2, depth: 1 } }] },
}
const deps = { character: card, user: { name: '周惟惟', description: '喜欢直率交流' }, api: { baseUrl: '', apiKey: '', modelName: '' }, memoryApi: { baseUrl: '', apiKey: '', modelName: '' }, temperature: 1, topP: 1, maxTokens: 2000, streaming: true, memoryLength: 40, pastLife: () => '共同故事：他曾在雨夜的书房等她。' }

describe('人格设置：提示词、背景和窗口范围 (v138)', () => {
  it('round-trips preferences per persona through durable storage and backup/normalization; legacy data keeps the default', async () => {
    let state = enablePersona(enablePersona(emptyPersonaState(), 'yu'), 'other')
    state = updatePersona(state, personaIdFor('yu'), (persona) => ({ ...persona, systemPrompt: '直接说想法。\n可以温柔，也可以有脾气。' }))
    await durableSet('weijing.personaWindows', JSON.parse(JSON.stringify(state)))
    const restored = normalizePersonaState(await durableGet('weijing.personaWindows'))
    expect(restored.personas.find((item) => item.characterId === 'yu')?.systemPrompt).toBe('直接说想法。\n可以温柔，也可以有脾气。')
    expect(restored.personas.find((item) => item.characterId === 'other')?.systemPrompt).toBeUndefined()
    const legacy = normalizePersonaState({ personas: [{ characterId: 'legacy', messages: [{ id: 1, role: 'user', text: '以前的话' }] }] })
    expect(legacy.personas[0].systemPrompt).toBeUndefined()
    expect(legacy.personas[0].threads[0].messages[0].text).toBe('以前的话')
  })

  it('uses the same preferences in each window, without putting card roles or depth lore into live conversation roles', () => {
    let state = enablePersona(emptyPersonaState(), 'yu')
    state = updatePersona(state, personaIdFor('yu'), (persona) => ({ ...persona, systemPrompt: '少写场景，多说自己的想法。' }))
    state = addPersonaThread(state, personaIdFor('yu'))
    const persona = state.personas[0]
    const snapshot = JSON.stringify(card)
    for (const thread of persona.threads) {
      const request = buildPersonaRequest(persona, [{ id: 1, role: 'user', text: '今天聊点什么？', createdAt: 1 }], deps, thread)
      const first = String(request[0].content)
      const begin = first.indexOf('【背景参考资料开始')
      const end = first.indexOf('【背景参考资料结束')
      for (const text of ['你是市委书记，和宁梦曦结婚', '午夜的私人起居室', '虞家往事']) {
        expect(first.indexOf(text)).toBeGreaterThan(begin)
        expect(first.indexOf(text)).toBeLessThan(end)
      }
      expect(first).toContain('少写场景，多说自己的想法。')
      expect(first).toContain('不要自动套用原卡身份、关系或场景')
      expect(first).not.toMatch(/【用户主角控制权|【角色消息美化连续性|你不是 AI/)
      expect(request.map((item) => item.role)).toEqual(['system', 'system', 'user'])
    }
    expect(JSON.stringify(card)).toBe(snapshot)
  })

  it('keeps compressed history, own memories and image transport while using a dedicated persona prompt', () => {
    const persona = { ...createPersonaWindow('yu'), memories: [{ id: 'm', title: '约定', content: '每天聊聊新鲜事。', createdAt: 1, pinned: true }] }
    const messages = [
      { id: 1, role: 'user' as const, text: '旧段原文', createdAt: 1 },
      { id: 2, role: 'assistant' as const, text: '<scenario>书房</scenario>“我在。”', createdAt: 2 },
      { id: 3, role: 'user' as const, text: '看这张图', createdAt: 3, images: [{ id: 'i', dataUrl: 'data:image/png;base64,aGVsbG8=', width: 1, height: 1 }] },
    ]
    const thread = { ...activeThread(persona), messages, contextSummary: '更早聊过工作。', compressedThroughId: 1 }
    const request = buildPersonaRequest(persona, messages, deps, thread)
    expect(JSON.stringify(request)).not.toContain('旧段原文')
    expect(String(request[0].content)).toContain('每天聊聊新鲜事')
    expect(String(request[0].content)).toContain('更早聊过工作')
    expect(request.find((message) => message.role === 'assistant')?.content).toBe('“我在。”')
    expect(request[request.length - 1].content).toEqual([{ type: 'text', text: '看这张图' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=', detail: 'auto' } }])
  })

  it('renders grouped navigation with readable descriptions and a switch, not inline cramped controls', () => {
    const noop = () => undefined
    const markup = renderToStaticMarkup(createElement(PersonaSettingsHome, { promptLength: 38, memoryCount: 7, threadCount: 2, threadTitle: '窗口 2', channelName: '很长的渠道名称', modelName: 'long-model-name', pastLifeEnabled: true, onNavigate: noop, onThreads: noop, onMemory: noop, onManage: noop, onTogglePastLife: noop, tap: () => ({ onPointerUp: noop, onClick: noop }) }))
    for (const title of ['系统提示词', '相处方式、语气与表达偏好', '38 字', '7 条', '2 个', '模型与渠道', 'aria-pressed="true"']) expect(markup).toContain(title)
    expect(markup).not.toMatch(/<input|<select|<textarea/)
  })
})
