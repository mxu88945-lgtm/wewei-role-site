import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Character, CharacterMemoryEntry } from './characterCard'
import type { Conversation } from './conversationLifecycle'
import type { LongMemoryMap } from './memoryEngine'
import { DURABLE_KEYS, parseBackup } from './backupStore'

const completions: string[] = []
const requests: { messages: { role: string; content: unknown }[] }[] = []
vi.mock('./chatApi', () => ({
  completeChat: vi.fn(async (options: { messages: { role: string; content: unknown }[]; onDelta: (delta: string) => void }) => {
    requests.push({ messages: options.messages })
    options.onDelta(completions.shift() ?? '（他笑了笑。）“我在。”')
    return { finishReason: 'stop' }
  }),
}))

const {
  applyPersonaMemoryExtraction, buildPastLifeMemory, createPersonaWindow, deletePersona, disablePersona, emptyPersonaState, enablePersona,
  normalizePersonaState, parsePersonaMemoryCandidates, personaIdFor, personaMemories, switchPersona, PERSONA_WINDOWS_KEY,
} = await import('./personaWindow')
const { getPersonaState, setPersonaState } = await import('./personaWindowStore')
const { buildPersonaRequest, extractPersonaMemory, generatePersonaReply } = await import('./personaWindowRuntime')

const character = (id: string, name: string): Character => ({
  id, name, tagline: '', description: `${name}的人设`, personality: '', scenario: '', greeting: `${name}的开场白`, alternateGreetings: [], mesExample: '',
  creatorNotes: '', systemPrompt: '', postHistoryInstructions: '', tags: [], creator: '', characterVersion: '', regexScripts: [],
})
const core = (title: string, content: string): CharacterMemoryEntry => ({ id: title, title, content, category: 'fact', status: 'confirmed', enabled: true, createdAt: 1, updatedAt: 1 } as CharacterMemoryEntry)
const api = { baseUrl: 'https://example.test/v1', apiKey: 'k', modelName: 'm' }

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

const gu = character('gu', '顾祁砚')
const lu = character('lu', '陆屿')

function fixtures() {
  const conversations: Conversation[] = [
    { id: 'story-gu', characterId: 'gu', title: '雨夜长剧情', messages: [{ id: 1, role: 'assistant', text: '剧情原文' }], createdAt: 1, updatedAt: 30, characterMemories: { gu: [core('婚约', '顾祁砚已经解除了旧婚约')] } },
    { id: 'phone-group', characterId: 'gu', kind: 'group', participantIds: ['gu', 'lu'], title: '戏外群', messages: [], createdAt: 1, updatedAt: 20, phone: { bindings: {} }, characterMemories: { gu: [core('奶茶', '顾祁砚答应周末请大家喝奶茶')], lu: [core('陆屿秘密', '陆屿偷偷养了一只猫')] } },
    { id: 'story-lu', characterId: 'lu', title: '陆屿的故事', messages: [], createdAt: 1, updatedAt: 40, contextSummary: '陆屿在码头等人', characterMemories: { lu: [core('码头', '陆屿在码头救了人')] } },
  ]
  const memoryEntries: LongMemoryMap = {
    'story-gu': [{ id: 'm1', content: '雨夜里两人第一次说开了心事' }],
    'story-lu': [{ id: 'm2', content: '陆屿的长期记忆' }],
    gu: [{ id: 'legacy', content: '旧版按角色存的记忆' }],
  }
  return { conversations, memoryEntries }
}

beforeEach(() => {
  completions.length = 0
  requests.length = 0
  setPersonaState(() => emptyPersonaState())
})
afterEach(() => { vi.useRealTimers() })

describe('persona window state', () => {
  it('enables several personas, switches between them, and keeps a removed persona\'s data for re-adding', () => {
    let state = enablePersona(enablePersona(emptyPersonaState(), 'gu', 1), 'lu', 2)
    expect(state.personas.map((item) => item.id)).toEqual([personaIdFor('gu'), personaIdFor('lu')])
    expect(state.activeId).toBe(personaIdFor('lu'))
    state = switchPersona(state, personaIdFor('gu'))
    expect(state.activeId).toBe(personaIdFor('gu'))
    state = applyPersonaMemoryExtraction(state, personaIdFor('gu'), [{ id: 'a', title: '称呼', content: '她喜欢被叫惟惟', createdAt: 3 }], 4)
    state = disablePersona(state, personaIdFor('gu'))
    expect(state.activeId).toBe(personaIdFor('lu'))
    expect(switchPersona(state, personaIdFor('gu')).activeId).toBe(personaIdFor('lu'))
    state = enablePersona(state, 'gu')
    expect(personaMemories(state, personaIdFor('gu'))[0].content).toBe('她喜欢被叫惟惟')
    state = deletePersona(state, personaIdFor('gu'))
    expect(state.personas.map((item) => item.id)).toEqual([personaIdFor('lu')])
  })

  it('normalizes stored data defensively and defaults 前世记忆 / auto memory to on', () => {
    const state = normalizePersonaState({ activeId: 'nope', personas: [{ characterId: 'gu', messages: [{ id: 1, role: 'user', text: '在吗' }, { role: 'x' }], memories: [{ content: '' }, { title: 't', content: 'c' }] }, { characterId: 'gu' }, 'junk'] })
    expect(state.personas).toHaveLength(1)
    expect(state.activeId).toBe(personaIdFor('gu'))
    expect(state.personas[0].messages).toHaveLength(1)
    expect(state.personas[0].memories).toHaveLength(1)
    expect(state.personas[0].pastLifeEnabled).toBe(true)
    expect(state.personas[0].autoMemory).toBe(true)
    expect(normalizePersonaState(null).personas).toEqual([])
  })

  it('parses memory JSON, tolerating prose around it, and rejects garbage', () => {
    expect(parsePersonaMemoryCandidates('好的：{"memories":[{"title":"喝茶","content":"她每天都喝茶"},{"title":"重复","content":"她每天都喝茶"}]}')).toHaveLength(1)
    expect(parsePersonaMemoryCandidates('{"memories":[]}')).toEqual([])
    expect(parsePersonaMemoryCandidates('不是 JSON')).toBeNull()
  })
})

describe('memory isolation between personas', () => {
  it('writes extracted memories into exactly one persona and advances only its cursor', async () => {
    setPersonaState((state) => enablePersona(enablePersona(state, 'gu'), 'lu'))
    setPersonaState((state) => ({ ...state, personas: state.personas.map((item) => ({ ...item, messages: [
      { id: 1, role: 'user', text: `跟${item.characterId}说：我养了九只玄凤`, createdAt: 1 },
      { id: 2, role: 'assistant', text: '“九只？”', createdAt: 2 },
    ] })) }))
    completions.push('{"memories":[{"title":"玄凤","content":"她养了九只玄凤"}]}')
    await extractPersonaMemory(personaIdFor('gu'), { character: gu, user: { name: '周惟惟', description: '' }, memoryApi: api }, true)
    const state = getPersonaState()
    const guPersona = state.personas.find((item) => item.characterId === 'gu')!
    const luPersona = state.personas.find((item) => item.characterId === 'lu')!
    expect(guPersona.memories.map((item) => item.content)).toEqual(['她养了九只玄凤'])
    expect(guPersona.memoryThroughId).toBe(2)
    expect(luPersona.memories).toEqual([])
    expect(luPersona.memoryThroughId).toBeUndefined()
    // The request only carried this persona's own turns.
    const sent = JSON.stringify(requests[0].messages)
    expect(sent).toContain('跟gu说')
    expect(sent).not.toContain('跟lu说')
  })

  it('a persona request injects only its own memories, never another persona\'s', () => {
    let state = enablePersona(enablePersona(emptyPersonaState(), 'gu'), 'lu')
    state = applyPersonaMemoryExtraction(state, personaIdFor('gu'), [{ id: 'g', title: '顾的记忆', content: '只属于顾祁砚的窗口', createdAt: 1, pinned: true }], 0)
    state = applyPersonaMemoryExtraction(state, personaIdFor('lu'), [{ id: 'l', title: '陆的记忆', content: '只属于陆屿的窗口', createdAt: 1, pinned: true }], 0)
    const persona = state.personas.find((item) => item.characterId === 'lu')!
    const sent = JSON.stringify(buildPersonaRequest(persona, [{ id: 1, role: 'user', text: '晚上好', createdAt: 1 }], {
      character: lu, user: { name: '周惟惟', description: '' }, api, memoryApi: api, temperature: 1, topP: 1, maxTokens: 1000, streaming: false, memoryLength: 40, pastLife: () => '',
    }))
    expect(sent).toContain('只属于陆屿的窗口')
    expect(sent).not.toContain('只属于顾祁砚的窗口')
  })
})

describe('persona chats stay out of conversations', () => {
  it('a persona reply lives only in the persona store, not in the conversation list', async () => {
    const { conversations, memoryEntries } = fixtures()
    const frozen = deepFreeze(conversations)
    const before = JSON.stringify(frozen)
    setPersonaState((state) => enablePersona(state, 'gu'))
    await generatePersonaReply(personaIdFor('gu'), {
      character: gu, user: { name: '周惟惟', description: '' }, api, memoryApi: api, temperature: 1, topP: 1, maxTokens: 1000, streaming: false, memoryLength: 40,
      pastLife: () => buildPastLifeMemory({ character: gu, conversations: frozen, memoryEntries }),
    }, { text: '今天好累' })
    const persona = getPersonaState().personas[0]
    expect(persona.messages.map((item) => item.role)).toEqual(['user', 'assistant'])
    expect(persona.messages[1].text).toContain('我在')
    expect(JSON.stringify(frozen)).toBe(before)
    expect(frozen.some((conversation) => conversation.messages.some((message) => message.text === '今天好累'))).toBe(false)
    // Persona windows have their own durable key, and it is restored into IndexedDB with backups.
    expect(PERSONA_WINDOWS_KEY).not.toBe('weijing.conversations')
    expect(DURABLE_KEYS.has(PERSONA_WINDOWS_KEY)).toBe(true)
    expect(() => parseBackup({ format: 'weijing-backup', version: 1, createdAt: '', data: { [PERSONA_WINDOWS_KEY]: JSON.stringify(getPersonaState()) } })).not.toThrow()
    expect(() => parseBackup({ format: 'weijing-backup', version: 1, createdAt: '', data: { [PERSONA_WINDOWS_KEY]: '[]' } })).toThrow()
  })
})

describe('前世记忆', () => {
  it('is read-only and only reads conversations this character is in', () => {
    const { conversations, memoryEntries } = fixtures()
    deepFreeze(conversations)
    deepFreeze(memoryEntries)
    const text = buildPastLifeMemory({ character: gu, conversations, memoryEntries })
    expect(text).toContain('前世记忆')
    expect(text).toContain('顾祁砚已经解除了旧婚约')
    expect(text).toContain('雨夜里两人第一次说开了心事')
    expect(text).toContain('顾祁砚答应周末请大家喝奶茶')
    expect(text).toContain('小手机群聊')
    expect(text).toContain('长剧情')
    // Another character's private memory in a shared group, and their own stories, never leak in.
    expect(text).not.toContain('陆屿偷偷养了一只猫')
    expect(text).not.toContain('陆屿在码头救了人')
    expect(text).not.toContain('陆屿的长期记忆')
    // Legacy per-character fallback is not repeated under every conversation.
    expect(text).not.toContain('旧版按角色存的记忆')
    // Newest conversation first.
    expect(text.indexOf('雨夜长剧情')).toBeLessThan(text.indexOf('戏外群'))
  })

  it('is capped and empty when the character has no other life', () => {
    const { conversations, memoryEntries } = fixtures()
    const long = { ...conversations[0], characterMemories: { gu: Array.from({ length: 80 }, (_, index) => core(`事${index}`, '很长的记忆'.repeat(20))) } }
    expect(buildPastLifeMemory({ character: gu, conversations: [long], memoryEntries, maxChars: 1000 }).length).toBeLessThan(1400)
    expect(buildPastLifeMemory({ character: character('nobody', '路人'), conversations, memoryEntries })).toBe('')
  })

  it('is injected only when the persona switch is on', () => {
    const deps = { character: gu, user: { name: '周惟惟', description: '' }, api, memoryApi: api, temperature: 1, topP: 1, maxTokens: 1000, streaming: false, memoryLength: 40, pastLife: () => '【前世记忆｜测试】旧缘' }
    const persona = createPersonaWindow('gu')
    const history = [{ id: 1, role: 'user' as const, text: '嗨', createdAt: 1 }]
    const on = buildPersonaRequest(persona, history, deps)
    const at = on.findIndex((item) => String(item.content).includes('【前世记忆｜测试】'))
    expect(at).toBeGreaterThan(-1)
    expect(on[at].role).toBe('system')
    expect(at).toBeLessThan(on.findIndex((item) => item.role === 'user'))
    expect(JSON.stringify(buildPersonaRequest({ ...persona, pastLifeEnabled: false }, history, deps))).not.toContain('【前世记忆｜测试】')
    // The card's story greeting is not part of the persona window.
    expect(JSON.stringify(on)).not.toContain('顾祁砚的开场白')
  })
})
