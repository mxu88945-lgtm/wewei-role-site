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
  addPersonaThread, switchPersonaThread, renamePersonaThread, deletePersonaThread, activeThread, resolvePersonaApi, personaMemoryApi, firstThreadIdFor, pendingPersonaMemoryMessages,
  collectPastLifeMemory, buildPersonaSetting, buildPersonaWindowNoteForPhone, PERSONA_WINDOW_PRESET, updatePersona,
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
    expect(state.personas[0].threads[0].messages).toHaveLength(1)
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
    setPersonaState((state) => ({ ...state, personas: state.personas.map((item) => ({ ...item, threads: [{ ...item.threads[0], messages: [
      { id: 1, role: 'user', text: `跟${item.characterId}说：我养了九只玄凤`, createdAt: 1 },
      { id: 2, role: 'assistant', text: '“九只？”', createdAt: 2 },
    ] }] })) }))
    completions.push('{"memories":[{"title":"玄凤","content":"她养了九只玄凤"}]}')
    await extractPersonaMemory(personaIdFor('gu'), { character: gu, user: { name: '周惟惟', description: '' }, memoryApi: api }, true)
    const state = getPersonaState()
    const guPersona = state.personas.find((item) => item.characterId === 'gu')!
    const luPersona = state.personas.find((item) => item.characterId === 'lu')!
    expect(guPersona.memories.map((item) => item.content)).toEqual(['她养了九只玄凤'])
    expect(guPersona.threads[0].memoryThroughId).toBe(2)
    expect(luPersona.memories).toEqual([])
    expect(luPersona.threads[0].memoryThroughId).toBeUndefined()
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
    expect(persona.threads[0].messages.map((item) => item.role)).toEqual(['user', 'assistant'])
    expect(persona.threads[0].messages[1].text).toContain('我在')
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

describe('人格窗口 v135：人设与前世记忆真正落地', () => {
  const lore = (id: number, keys: string[], content: string, extra: Record<string, unknown> = {}) => ({
    id, keys, secondary_keys: [], comment: '', content, constant: false, selective: false, insertion_order: id, enabled: true, position: 'before_char', use_regex: false, extensions: {}, ...extra,
  })
  const yu: Character = {
    ...character('yu', '虞山行'),
    description: '虞山行，江南虞家的少主，寡言，护短。',
    personality: '外冷内热',
    characterBook: { name: 'yu', entries: [
      lore(1, ['虞家'], '虞家世代守着山行剑庄，虞山行与{{user}}自幼定亲。'),
      lore(2, ['状态'], '<status>每轮输出状态栏</status>'),
    ] },
  }
  const deps = (extra: Partial<Parameters<typeof buildPersonaRequest>[2]> = {}) => ({ character: yu, user: { name: '周惟惟', description: '惟惟的身份设定' }, api, memoryApi: api, temperature: 1, topP: 1, maxTokens: 1000, streaming: false, memoryLength: 40, pastLife: () => '', ...extra })
  const sys = (messages: { role: string; content: unknown }[]) => messages.filter((item) => item.role === 'system').map((item) => String(item.content)).join('\n')

  it('sends the card description, keyword-only worldbook setting, global worldbook and user identity even with no chat yet', () => {
    const request = buildPersonaRequest(createPersonaWindow('yu'), [{ id: 1, role: 'user', text: '你能看到记忆吗？', createdAt: 1 }], deps({ globalWorldbook: '全局：江湖与现代并行', setting: () => '【虞山行所在故事】剑庄旧事' }))
    const text = sys(request)
    expect(text).toContain('江南虞家的少主')
    expect(text).toContain('外冷内热')
    expect(text).toContain('虞山行与周惟惟自幼定亲')
    expect(text).toContain('全局：江湖与现代并行')
    expect(text).toContain('惟惟的身份设定')
    expect(text).toContain('剑庄旧事')
    // Status-bar lore stays out.
    expect(text).not.toContain('每轮输出状态栏')
    // The last system message before her turn re-anchors the persona.
    const lastSystem = request.filter((item) => item.role === 'system').pop()
    expect(String(lastSystem?.content)).toContain('你是名为虞山行的 AI 人格')
  })

  it('the preset keeps warmth and AI self-awareness without pretending the reference card is current reality', () => {
    expect(PERSONA_WINDOW_PRESET).toContain('不用客服腔')
    expect(PERSONA_WINDOW_PRESET).toContain('随时吩咐')
    expect(PERSONA_WINDOW_PRESET).toContain('不反复索要已有资料')
    expect(PERSONA_WINDOW_PRESET).toContain('不编造共同经历或假装记得')
    expect(PERSONA_WINDOW_PRESET).toContain('不是这扇窗口的扮演任务')
    expect(PERSONA_WINDOW_PRESET).not.toContain('你不是 AI')
  })

  it('finds his past in a phone DM, a phone group he is a member of, a story chat and a story group — even without summarized memory', () => {
    const conversations: Conversation[] = [
      { id: 'dm', kind: 'group', characterId: 'yu', participantIds: ['yu'], title: '虞山行', createdAt: 1, updatedAt: 50, phone: { bindings: {}, dm: true }, messages: [
        { id: 1, role: 'user', text: '今天下雨了' }, { id: 2, role: 'assistant', characterId: 'yu', text: '带伞了吗，我去接你。' },
      ] },
      { id: 'pg', kind: 'group', characterId: 'other', participantIds: ['other', 'yu'], title: '戏外群', createdAt: 1, updatedAt: 40, phone: { bindings: {} }, messages: [
        { id: 1, role: 'assistant', characterId: 'other', text: '别人的悄悄话' }, { id: 2, role: 'assistant', characterId: 'yu', text: '群里我只听她的。' },
      ] },
      { id: 'story', characterId: 'yu', title: '剑庄长剧情', createdAt: 1, updatedAt: 30, messages: [{ id: 1, role: 'assistant', text: '（他把剑递给她。）“拿着。”' }] },
      { id: 'sg', kind: 'group', characterId: 'other', participantIds: ['other', 'yu'], title: '江湖群戏', createdAt: 1, updatedAt: 20, messages: [], characterMemories: { yu: [core('结义', '虞山行与她在江湖群戏里结为同盟')] } },
      { id: 'left', kind: 'group', characterId: 'other', participantIds: ['other'], title: '退过的群', createdAt: 1, updatedAt: 10, phone: { bindings: {}, left: { yu: { at: 1, reason: '吵架' } } }, messages: [{ id: 1, role: 'assistant', characterId: 'yu', text: '我先走了。' }] },
      { id: 'notmine', characterId: 'other', title: '别人的故事', createdAt: 1, updatedAt: 60, messages: [{ id: 1, role: 'assistant', text: '与他无关' }] },
    ]
    const result = collectPastLifeMemory({ character: yu, conversations, memoryEntries: {}, userName: '周惟惟' })
    expect(result.relatedConversationCount).toBe(5)
    expect(result.text).toContain('带伞了吗，我去接你')
    expect(result.text).toContain('周惟惟：今天下雨了')
    expect(result.text).toContain('群里我只听她的')
    expect(result.text).toContain('拿着')
    expect(result.text).toContain('结为同盟')
    expect(result.text).toContain('我先走了')
    expect(result.text).not.toContain('别人的悄悄话')
    expect(result.text).not.toContain('与他无关')
    expect(result.text).toContain('不是现实中的亲身经历')
    expect(result.text.indexOf('小手机私聊')).toBeLessThan(result.text.indexOf('剑庄长剧情'))
  })

  it('counts a same-name duplicate card and the card-level 角色记忆 as his own past', () => {
    const copy = { ...yu, id: 'yu-copy' }
    const conversations: Conversation[] = [{ id: 'c', characterId: 'yu-copy', title: '旧卡的剧情', createdAt: 1, updatedAt: 1, messages: [], characterMemories: { 'yu-copy': [core('旧约', '他答应过等她回来')] } }]
    const withCardMemory = { ...yu, characterMemory: [core('手写', '他怕她冷')] }
    const result = collectPastLifeMemory({ character: withCardMemory, characters: [yu, copy, lu], conversations, memoryEntries: {} })
    expect(result.characterIds).toEqual(['yu', 'yu-copy'])
    expect(result.text).toContain('他答应过等她回来')
    expect(result.text).toContain('他怕她冷')
  })

  it('story-project world and story cast background become 人设补充', () => {
    const setting = buildPersonaSetting({
      character: yu,
      conversations: [{ id: 's', characterId: 'yu', title: '剑庄', createdAt: 1, updatedAt: 1, messages: [], theaterWorldBackground: '【独立角色】虞山行：剑庄少主，与她青梅竹马' }],
      storyProjects: [{ title: '山行录', characterIds: ['yu'], worldBackground: '架空江南，剑庄林立', summary: '', updatedAt: 1 }, { title: '别的戏', characterIds: ['lu'], worldBackground: '码头', summary: '', updatedAt: 2 }],
    })
    expect(setting).toContain('架空江南')
    expect(setting).toContain('青梅竹马')
    expect(setting).not.toContain('码头')
  })

  it('小手机 gets only the speaking character\'s own window memory', () => {
    let state = enablePersona(enablePersona(emptyPersonaState(), 'yu'), 'lu')
    state = updatePersona(state, personaIdFor('yu'), (item) => ({ ...item, memories: [{ id: 'a', title: '窗前', content: '她说喜欢桂花', createdAt: 1 }], threads: [{ ...item.threads[0], messages: [{ id: 1, role: 'user', text: '晚安', createdAt: 1 }] }] }))
    state = updatePersona(state, personaIdFor('lu'), (item) => ({ ...item, memories: [{ id: 'b', title: '陆屿的秘密', content: '陆屿在窗口里说了心事', createdAt: 1 }] }))
    const forYu = buildPersonaWindowNoteForPhone(state, 'yu', { char: '虞山行', user: '周惟惟' })
    expect(forYu).toContain('她说喜欢桂花')
    expect(forYu).toContain('周惟惟：晚安')
    expect(forYu).toContain('只属于虞山行本人')
    expect(forYu).not.toContain('陆屿在窗口里说了心事')
    expect(buildPersonaWindowNoteForPhone(state, 'nobody', { char: 'x', user: 'y' })).toBe('')
  })
})

describe('人格窗口 v136：多窗口、记忆共享与模型切换', () => {
  const user = { name: '周惟惟', description: '' }
  const say = (id: number, role: 'user' | 'assistant', text: string) => ({ id, role, text, createdAt: id })

  it('migrates old single-window data into a first window losslessly', () => {
    const old = { version: 1, activeId: personaIdFor('gu'), personas: [{ id: personaIdFor('gu'), characterId: 'gu', createdAt: 5, updatedAt: 9, enabled: true,
      messages: [say(1, 'user', '在吗'), say(2, 'assistant', '“在。”')], memories: [{ id: 'm', title: '茶', content: '她每天喝茶', createdAt: 3 }],
      memoryThroughId: 2, contextSummary: '旧摘要', compressedThroughId: 1, pastLifeEnabled: false }] }
    const state = normalizePersonaState(old)
    expect(state.version).toBe(2)
    const persona = state.personas[0]
    expect(persona.threads).toHaveLength(1)
    expect(persona.activeThreadId).toBe(firstThreadIdFor(persona.id))
    expect(persona.threads[0]).toMatchObject({ title: '窗口 1', createdAt: 5, updatedAt: 9, memoryThroughId: 2, contextSummary: '旧摘要', compressedThroughId: 1 })
    expect(persona.threads[0].messages.map((item) => item.text)).toEqual(['在吗', '“在。”'])
    expect(persona.memories[0].content).toBe('她每天喝茶')
    expect(persona.pastLifeEnabled).toBe(false)
    expect('messages' in persona).toBe(false)
    // Normalizing v2 again is stable (backup → restore round trip).
    expect(normalizePersonaState(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it('adds, switches, renames and deletes windows; deleting keeps the persona memory', () => {
    let state = enablePersona(emptyPersonaState(), 'gu', 1)
    const id = personaIdFor('gu')
    state = applyPersonaMemoryExtraction(state, id, [{ id: 'a', title: '称呼', content: '她喜欢被叫惟惟', createdAt: 1 }], 0)
    state = addPersonaThread(state, id, 2)
    let persona = state.personas[0]
    expect(persona.threads).toHaveLength(2)
    const second = persona.threads[1]
    expect(persona.activeThreadId).toBe(second.id)
    expect(second.title).toBe('窗口 2')
    state = renamePersonaThread(state, id, second.id, '  深夜  ')
    state = switchPersonaThread(state, id, firstThreadIdFor(id))
    expect(activeThread(state.personas[0]).id).toBe(firstThreadIdFor(id))
    state = deletePersonaThread(state, id, firstThreadIdFor(id))
    persona = state.personas[0]
    expect(persona.threads.map((item) => item.title)).toEqual(['深夜'])
    expect(persona.activeThreadId).toBe(second.id)
    expect(persona.memories).toHaveLength(1)
    state = deletePersonaThread(state, id, second.id)
    expect(state.personas[0].threads).toHaveLength(1)
    expect(state.personas[0].threads[0].messages).toEqual([])
  })

  it('shares memory across windows of one persona, isolates personas, and keeps a per-window cursor', async () => {
    setPersonaState((state) => addPersonaThread(enablePersona(enablePersona(state, 'gu'), 'lu'), personaIdFor('gu')))
    const guId = personaIdFor('gu')
    const [w1, w2] = getPersonaState().personas.find((item) => item.id === guId)!.threads
    setPersonaState((state) => updatePersona(state, guId, (item) => ({ ...item, threads: [
      { ...w1, messages: [say(1, 'user', '窗口一：我养了九只玄凤'), say(2, 'assistant', '“九只？”')] },
      { ...w2, messages: [say(1, 'user', '窗口二：我每天喝茶'), say(2, 'assistant', '“少喝点。”'), say(3, 'user', '才不'), say(4, 'assistant', '“嗯。”')] },
    ] })))
    completions.push('{"memories":[{"title":"玄凤","content":"她养了九只玄凤"}]}')
    await extractPersonaMemory(guId, { character: gu, user, memoryApi: api }, false, w1.id)
    let gup = getPersonaState().personas.find((item) => item.id === guId)!
    expect(gup.threads[0].memoryThroughId).toBe(2)
    expect(gup.threads[1].memoryThroughId).toBeUndefined()
    expect(pendingPersonaMemoryMessages(gup.threads[1])).toHaveLength(4)
    // Window 2's ids overlap window 1's (1, 2…) but are still pending: cursors are per window.
    completions.push('{"memories":[{"title":"喝茶","content":"她每天喝茶"}]}')
    await extractPersonaMemory(guId, { character: gu, user, memoryApi: api }, true)
    gup = getPersonaState().personas.find((item) => item.id === guId)!
    expect(gup.threads[1].memoryThroughId).toBe(4)
    expect(gup.memories.map((item) => item.content)).toEqual(['她养了九只玄凤', '她每天喝茶'])
    expect(JSON.stringify(requests[1].messages)).toContain('窗口二')
    expect(JSON.stringify(requests[1].messages)).not.toContain('窗口一：我养了')
    expect(JSON.stringify(requests[1].messages)).toContain('她养了九只玄凤') // dedupe sees shared memory
    // Nothing left: a third run does not re-send either window.
    await extractPersonaMemory(guId, { character: gu, user, memoryApi: api }, true)
    expect(requests).toHaveLength(2)
    expect(getPersonaState().personas.find((item) => item.characterId === 'lu')!.memories).toEqual([])
    // Both windows' requests carry the shared memory.
    const deps = { character: gu, user, api, memoryApi: api, temperature: 1, topP: 1, maxTokens: 1000, streaming: false, memoryLength: 40, pastLife: () => '' }
    for (const thread of gup.threads) expect(JSON.stringify(buildPersonaRequest(gup, thread.messages, deps, thread))).toContain('她每天喝茶')
    const lup = getPersonaState().personas.find((item) => item.characterId === 'lu')!
    expect(JSON.stringify(buildPersonaRequest(lup, [say(1, 'user', '嗨')], { ...deps, character: lu }))).not.toContain('她每天喝茶')
  })

  it('a reply goes into the window it was sent from', async () => {
    setPersonaState((state) => addPersonaThread(enablePersona(state, 'gu'), personaIdFor('gu')))
    const [w1, w2] = getPersonaState().personas[0].threads
    await generatePersonaReply(personaIdFor('gu'), { character: gu, user, api, memoryApi: api, temperature: 1, topP: 1, maxTokens: 1000, streaming: false, memoryLength: 40, pastLife: () => '' }, { text: '去窗口一', threadId: w1.id })
    const persona = getPersonaState().personas[0]
    expect(persona.threads.find((item) => item.id === w1.id)!.messages.map((item) => item.text)).toEqual(['去窗口一', '（他笑了笑。）“我在。”'])
    expect(persona.threads.find((item) => item.id === w2.id)!.messages).toEqual([])
  })

  it('小手机 uses the most recently updated window', () => {
    let state = addPersonaThread(enablePersona(emptyPersonaState(), 'gu', 1), personaIdFor('gu'), 2)
    const [w1, w2] = state.personas[0].threads
    state = updatePersona(state, personaIdFor('gu'), (item) => ({ ...item, threads: [{ ...w1, updatedAt: 50, messages: [say(1, 'user', '新窗口的话')] }, { ...w2, updatedAt: 10, messages: [say(1, 'user', '旧窗口的话')] }] }))
    const note = buildPersonaWindowNoteForPhone(state, 'gu', { char: '顾祁砚', user: '周惟惟' })
    expect(note).toContain('新窗口的话')
    expect(note).not.toContain('旧窗口的话')
  })

  it('channel override: follows main chat by default, uses the chosen channel/model, falls back when deleted; memory API falls back to it', () => {
    const main = { id: 'main', name: '主渠道', platform: 'openai' as const, protocol: 'openai' as const, maxTokenField: 'auto' as const, baseUrl: 'https://a/v1', apiKey: 'k', modelName: 'main-model' }
    const claude = { ...main, id: 'c', name: 'Claude', protocol: 'anthropic' as const, platform: 'anthropic' as const, baseUrl: 'https://b/v1', modelName: 'claude-x' }
    const channels = [main, claude]
    expect(resolvePersonaApi({}, channels, main).id).toBe('main')
    expect(resolvePersonaApi({ apiChannelId: 'c' }, channels, main).modelName).toBe('claude-x')
    expect(resolvePersonaApi({ apiChannelId: 'c', modelName: 'claude-y' }, channels, main).modelName).toBe('claude-y')
    expect(resolvePersonaApi({ apiChannelId: 'gone' }, channels, main).id).toBe('main')
    const chosen = resolvePersonaApi({ apiChannelId: 'c' }, channels, main)
    expect(personaMemoryApi({ baseUrl: '', apiKey: '', modelName: '' }, chosen).modelName).toBe('claude-x')
    expect(personaMemoryApi({ baseUrl: 'https://m/v1', apiKey: 'k', modelName: 'mem' }, chosen).modelName).toBe('mem')
    const state = normalizePersonaState({ personas: [{ characterId: 'gu', apiChannelId: 'c', modelName: ' claude-y ' }] })
    expect(state.personas[0]).toMatchObject({ apiChannelId: 'c', modelName: 'claude-y' })
  })
})
