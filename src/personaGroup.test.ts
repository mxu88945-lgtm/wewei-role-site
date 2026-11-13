import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Character } from './characterCard'
import type { ChatApiMessage } from './chatApi'
import { activeThread, buildPersonaWindowNoteForPhone, emptyPersonaState, enablePersona, normalizePersonaState, personaIdFor, updatePersona, type PersonaMessage, type PersonaWindow, type PersonaWindowState } from './personaWindow'
import { addGuest, addGuestMemories, deleteGuest, dismissGuest, insertMention, inviteGuest, isGroupActive, parseMentions, pendingGuestMessages, planGroupTurn, setReplyMode, splitGroupReply, typedMentionTrigger, type GroupSpeaker } from './personaGroup'
import { personaContinuityTranscript } from './personaWindowMemory'
import { getPersonaState, setPersonaState } from './personaWindowStore'
import { generatePersonaReply, planPersonaRequest } from './personaWindowRuntime'
import { TURN_CONTEXT_OPEN } from './promptTail'

const card: Character = { id: 'yu', name: '虞山行', tagline: '', description: '寡言护短。', personality: '冷淡', scenario: '', greeting: '', alternateGreetings: [], mesExample: '', creatorNotes: '', systemPrompt: '', postHistoryInstructions: '', tags: [], creator: '', characterVersion: '', regexScripts: [] }
const linCard: Character = { ...card, id: 'lin', name: '林栖', description: '{{char}}是虞山行的师弟，爱笑。', personality: '', scenario: '江湖客栈。' }
const deps = { character: card, characters: [card, linCard], user: { name: '周惟惟', description: '写剧情' }, api: { baseUrl: 'https://api.anthropic.com/v1', apiKey: 'k', modelName: 'claude-sonnet-4' }, memoryApi: { baseUrl: '', apiKey: '', modelName: '' }, temperature: 1, topP: 1, maxTokens: 100, streaming: false, memoryLength: 40, pastLife: () => '' }
const PID = personaIdFor('yu')

const speakers: GroupSpeaker[] = [
  { id: PID, name: '虞山行', main: true },
  { id: 'guest-a', name: '阿七', main: false },
  { id: 'guest-b', name: '阿七七', main: false },
  { id: 'guest-c', name: '林栖', main: false },
]

/** A persona with 阿七 (handwritten) and 林栖 (card) present in its first window. */
function groupPersona(): PersonaWindow {
  let persona = enablePersona(emptyPersonaState(), 'yu').personas[0]
  const threadId = persona.threads[0].id
  persona = addGuest(persona, threadId, { id: 'guest-a', source: 'custom', name: '阿七', avatar: '🦊', persona: '客栈跑堂，嘴碎。', world: '武侠世界。' }, ['虞山行', '周惟惟'], 1).persona
  persona = addGuest(persona, threadId, { id: 'guest-c', source: 'card', characterId: 'lin', name: '林栖' }, ['虞山行', '周惟惟'], 1).persona
  return persona
}
const stateWith = (persona: PersonaWindow): PersonaWindowState => ({ version: 2, activeId: persona.id, personas: [persona] })
const systemText = (messages: ChatApiMessage[]) => messages.filter((item) => item.role === 'system').map((item) => typeof item.content === 'string' ? item.content : item.content.map((part) => part.type === 'text' ? part.text : '').join('')).join('\n')
const allText = (messages: ChatApiMessage[]) => JSON.stringify(messages)
const contentOf = (message: ChatApiMessage | undefined) => !message ? '' : typeof message.content === 'string' ? message.content : message.content.map((part) => part.type === 'text' ? part.text : '').join('')

describe('@ 解析 (v234)', () => {
  it('returns mentioned speakers in the order she wrote them, longest name first, no repeats', () => {
    expect(parseMentions('@林栖 你先说，然后 @阿七七 和 @阿七', speakers)).toEqual(['guest-c', 'guest-b', 'guest-a'])
    expect(parseMentions('@阿七 @阿七 好', speakers)).toEqual(['guest-a'])
    expect(parseMentions('＠虞山行 在吗', speakers)).toEqual([PID])
    expect(parseMentions('没有点名', speakers)).toEqual([])
    expect(parseMentions('@所有人 吃饭了', speakers)).toEqual([PID, 'guest-a', 'guest-b', 'guest-c'])
    expect(parseMentions('@所有人', speakers, 2)).toHaveLength(2)
  })

  it('mention mode: @ targets in order, nobody @ → the window owner; natural → model decides', () => {
    const persona = groupPersona()
    const thread = activeThread(persona)
    const plan = planGroupTurn(persona, thread, [{ role: 'user', text: '@林栖 @阿七 你们俩说说' }], { name: '虞山行' }, [linCard])!
    expect(plan.targets).toEqual(['guest-c', 'guest-a'])
    expect(planGroupTurn(persona, thread, [{ role: 'user', text: '在吗' }], { name: '虞山行' })!.targets).toEqual([PID])
    const natural = planGroupTurn(persona, { ...thread, replyMode: 'natural' }, [{ role: 'user', text: '@阿七' }], { name: '虞山行' })!
    expect(natural.targets).toBeNull()
    expect(natural.cap).toBe(3)
    expect(planGroupTurn(persona, { ...thread, memberIds: undefined }, [], { name: '虞山行' })).toBeNull()
  })

  it('composer helpers: typing @ opens the picker; picking replaces the trailing @', () => {
    expect(typedMentionTrigger('你好', '你好@')).toBe(true)
    expect(typedMentionTrigger('你好', '你好呀')).toBe(false)
    expect(typedMentionTrigger('', '@@')).toBe(false)
    expect(insertMention('你好@', '阿七')).toBe('你好@阿七 ')
    expect(insertMention('你好', '阿七')).toBe('你好 @阿七 ')
    expect(insertMention('', '阿七')).toBe('@阿七 ')
  })
})

describe('多发言人分段 (v234)', () => {
  const natural = { speakers, targets: null, cap: 3 }

  it('splits on 【名字】 at line start, hides the marker, default speaker before the first marker', () => {
    const out = splitGroupReply('（抬眼）嗯。\n【阿七】客官来啦！\n【林栖】：师兄又冷着脸。\n【虞山行】\n闭嘴。', natural, { userName: '周惟惟' })
    expect(out).toEqual([
      { speakerId: PID, raw: '（抬眼）嗯。' },
      { speakerId: 'guest-a', raw: '客官来啦！' },
      { speakerId: 'guest-c', raw: '师兄又冷着脸。' },
    ])
  })

  it('keeps other 【…】 and mid-line markers as text, merges the same speaker, caps natural turns at 3', () => {
    const out = splitGroupReply('【阿七】【回忆】那年雪大。他说【林栖】也在。\n【阿七】还有我！\n【林栖】嗯\n【虞山行】走了\n【阿七七】我也来', natural)
    expect(out[0]).toEqual({ speakerId: 'guest-a', raw: '【回忆】那年雪大。他说【林栖】也在。\n\n还有我！' })
    expect(out.map((item) => item.speakerId)).toEqual(['guest-a', 'guest-c', PID])
  })

  it('drops anything the model writes as her (【周惟惟】) and after it', () => {
    const out = splitGroupReply('【阿七】来了\n【周惟惟】我要两碗面\n【林栖】好嘞', natural, { userName: '周惟惟' })
    expect(out).toEqual([{ speakerId: 'guest-a', raw: '来了' }])
  })

  it('@ mode keeps only the mentioned, in order; an unmarked reply goes to the first one', () => {
    const plan = { speakers, targets: ['guest-c', 'guest-a'], cap: 2 }
    expect(splitGroupReply('【林栖】我先说\n【虞山行】插话\n【阿七】我后说', plan).map((item) => item.speakerId)).toEqual(['guest-c', 'guest-a'])
    expect(splitGroupReply('没写标记的一段话', plan)).toEqual([{ speakerId: 'guest-c', raw: '没写标记的一段话' }])
    expect(splitGroupReply('【虞山行】只有他说了', plan)).toEqual([{ speakerId: 'guest-c', raw: '只有他说了' }])
  })

  it('streaming: a half-written marker never flashes, a finished one starts the next bubble', () => {
    for (const partial of ['【', '【阿', '【阿七', '【林栖']) {
      const out = splitGroupReply(`嗯。\n${partial}`, natural, { streaming: true, userName: '周惟惟' })
      expect(out).toEqual([{ speakerId: PID, raw: '嗯。' }])
    }
    expect(splitGroupReply('【阿', natural, { streaming: true })).toEqual([])
    expect(splitGroupReply('嗯。\n【阿七】客', natural, { streaming: true })).toEqual([{ speakerId: PID, raw: '嗯。' }, { speakerId: 'guest-a', raw: '客' }])
    // 不是名字开头的【… 照常显示
    expect(splitGroupReply('嗯。\n【回', natural, { streaming: true })[0].raw).toBe('嗯。\n【回')
    // 半截的「她的名字」也藏起来
    expect(splitGroupReply('嗯。\n【周惟', natural, { streaming: true, userName: '周惟惟' })).toEqual([{ speakerId: PID, raw: '嗯。' }])
  })
})

describe('提示词 (v234)', () => {
  const history: PersonaMessage[] = [{ id: 1, role: 'user', text: '早', createdAt: 1 }, { id: 2, role: 'assistant', text: '嗯。', createdAt: 2 }, { id: 3, role: 'assistant', text: '吃了吗', createdAt: 3 }, { id: 4, role: 'user', text: '在干嘛 @虞山行', createdAt: 4 }]

  it('only the window owner: the request is byte-identical to v233 (cache unchanged)', () => {
    const baseline = readFileSync(new URL('./personaGroupSoloBaseline.json', import.meta.url), 'utf8')
    const solo = enablePersona(emptyPersonaState(), 'yu').personas[0]
    expect(JSON.stringify(planPersonaRequest(solo, history, deps, { ...activeThread(solo), messages: history }).messages)).toBe(baseline)
    // 客人都请出去了（库里还有卡和记忆）：照样逐字一致
    let left = groupPersona()
    left = dismissGuest(dismissGuest(left, left.threads[0].id, 'guest-a'), left.threads[0].id, 'guest-c')
    left = addGuestMemories(left, 'guest-a', [{ id: 'm', title: '面', content: '她爱吃面', createdAt: 1 }], (a, b) => [...a, ...b])
    expect(isGroupActive(left, left.threads[0])).toBe(false)
    expect(JSON.stringify(planPersonaRequest(left, history, deps, { ...activeThread(left), messages: history }).messages)).toBe(baseline)
  })

  it('group: one system only, members/persona/world/memory/format in it, who-speaks in the tail', () => {
    let persona = groupPersona()
    persona = addGuestMemories(persona, 'guest-a', [{ id: 'm1', title: '面', content: '周惟惟爱吃阳春面', createdAt: 1 }], (a, b) => [...a, ...b])
    const thread = { ...activeThread(persona), messages: history }
    const plan = planPersonaRequest(persona, history, deps, thread)
    expect(plan.messages.filter((item) => item.role === 'system')).toHaveLength(1)
    expect(plan.messages[0].role).toBe('system')
    const system = systemText(plan.messages)
    expect(system).toContain('【临时群聊｜这扇窗口现在不只你们两个人】')
    expect(system).toContain('〔阿七｜临时加入的客人〕')
    expect(system).toContain('客栈跑堂，嘴碎。')
    expect(system).toContain('阿七的世界观：\n武侠世界。')
    expect(system).toContain('周惟惟爱吃阳春面')
    expect(system).toContain('林栖是虞山行的师弟，爱笑。')
    expect(system).toContain('林栖的世界观：\n江湖客栈。')
    expect(system).toContain('【回复模式｜@ 点名】')
    expect(system).not.toContain('本轮依次')
    const last = plan.messages[plan.messages.length - 1]
    expect(last.role).toBe('user')
    expect(String(typeof last.content === 'string' ? last.content : JSON.stringify(last.content))).toContain(TURN_CONTEXT_OPEN)
    expect(allText([last])).toContain('本轮只由 虞山行 回复')
    expect(plan.group?.targets).toEqual([PID])
  })

  it('group: the stable system stays byte-identical across turns; only members or mode change it', () => {
    const persona = groupPersona()
    const one: PersonaMessage[] = [{ id: 1, role: 'user', text: '@阿七 来碗面', createdAt: 1 }]
    const two: PersonaMessage[] = [...one, { id: 2, role: 'assistant', text: '好嘞！', createdAt: 2, speakerId: 'guest-a', speakerName: '阿七', present: ['guest-a', 'guest-c'], groupTurn: 2 }, { id: 3, role: 'user', text: '@林栖 @虞山行 你们呢', createdAt: 3 }]
    const a = planPersonaRequest(persona, one, deps, { ...activeThread(persona), messages: one })
    const b = planPersonaRequest(persona, two, deps, { ...activeThread(persona), messages: two })
    expect(systemText(b.messages)).toBe(systemText(a.messages))
    expect(allText(b.messages.slice(-1))).toContain('本轮依次由 林栖、虞山行 回复')
    const natural = setReplyMode(persona, persona.threads[0].id, 'natural')
    expect(systemText(planPersonaRequest(natural, two, deps, { ...activeThread(natural), messages: two }).messages)).not.toBe(systemText(a.messages))
    const fewer = dismissGuest(persona, persona.threads[0].id, 'guest-c')
    expect(systemText(planPersonaRequest(fewer, two, deps, { ...activeThread(fewer), messages: two }).messages)).not.toBe(systemText(a.messages))
  })

  it('history: every reply is labelled with its speaker and one turn of several speakers is one assistant message', () => {
    const persona = groupPersona()
    const turn = { present: ['guest-a', 'guest-c'], groupTurn: 2 }
    const history: PersonaMessage[] = [
      { id: 1, role: 'user', text: '大家好', createdAt: 1, present: ['guest-a', 'guest-c'] },
      { id: 2, role: 'assistant', text: '嗯。', createdAt: 2, speakerId: PID, ...turn },
      { id: 3, role: 'assistant', text: '客官好！', createdAt: 2, speakerId: 'guest-a', speakerName: '阿七', ...turn },
      { id: 5, role: 'user', text: '@林栖', createdAt: 3, present: ['guest-a', 'guest-c'] },
    ]
    const messages = planPersonaRequest(persona, history, deps, { ...activeThread(persona), messages: history }).messages
    const assistants = messages.filter((item) => item.role === 'assistant')
    expect(assistants).toHaveLength(1)
    expect(contentOf(assistants[0])).toBe('【虞山行】\n嗯。\n\n【阿七】\n客官好！')
  })

  it('after the guests leave, their old lines stay labelled and the tail says the group is over', () => {
    let persona = groupPersona()
    persona = dismissGuest(dismissGuest(persona, persona.threads[0].id, 'guest-a'), persona.threads[0].id, 'guest-c')
    const history: PersonaMessage[] = [
      { id: 1, role: 'user', text: '大家好', createdAt: 1, present: ['guest-a'] },
      { id: 2, role: 'assistant', text: '客官好！', createdAt: 2, speakerId: 'guest-a', speakerName: '阿七', present: ['guest-a'], groupTurn: 2 },
      { id: 3, role: 'user', text: '他走了', createdAt: 3 },
    ]
    const messages = planPersonaRequest(persona, history, deps, { ...activeThread(persona), messages: history }).messages
    expect(contentOf(messages.find((item) => item.role === 'assistant'))).toBe('【阿七】\n客官好！')
    expect(allText(messages.slice(-1))).toContain('【群聊已结束】')
    expect(systemText(messages)).not.toContain('临时群聊｜')
  })
})

describe('数据与记忆隔离 (v234)', () => {
  it('old messages without a speaker stay the owner; group fields survive a reload', () => {
    const persona = groupPersona()
    const thread = { ...persona.threads[0], replyMode: 'natural' as const, guestMemoryThrough: { 'guest-a': 3 }, messages: [{ id: 1, role: 'user' as const, text: '嗨', createdAt: 1, present: ['guest-a'] }, { id: 2, role: 'assistant' as const, text: '嗯', createdAt: 2 }, { id: 3, role: 'assistant' as const, text: '来了', createdAt: 3, speakerId: 'guest-a', speakerName: '阿七', present: ['guest-a'], groupTurn: 2 }] }
    const loaded = normalizePersonaState(JSON.parse(JSON.stringify(stateWith({ ...persona, threads: [thread] })))).personas[0]
    expect(loaded.guests?.map((item) => item.name)).toEqual(['阿七', '林栖'])
    expect(loaded.threads[0]).toMatchObject({ memberIds: ['guest-a', 'guest-c'], replyMode: 'natural', guestMemoryThrough: { 'guest-a': 3 } })
    expect(loaded.threads[0].messages[1].speakerId).toBeUndefined()
    expect(loaded.threads[0].messages[2]).toMatchObject({ speakerId: 'guest-a', speakerName: '阿七', groupTurn: 2 })
    // v233 数据：没有任何群聊字段
    const legacy = normalizePersonaState({ version: 2, activeId: '', personas: [{ id: PID, characterId: 'yu', threads: [{ id: 't', messages: [{ id: 1, role: 'assistant', text: 'x' }] }] }] }).personas[0]
    expect(legacy.guests).toBeUndefined()
    expect(legacy.threads[0].memberIds).toBeUndefined()
    expect(legacy.threads[0].messages[0].speakerId).toBeUndefined()
  })

  it('dismiss keeps the card and memory; invite brings them back; delete removes them only', () => {
    let persona = groupPersona()
    const threadId = persona.threads[0].id
    persona = addGuestMemories(persona, 'guest-a', [{ id: 'm', title: '面', content: '她爱吃面', createdAt: 1 }], (a, b) => [...a, ...b])
    persona = dismissGuest(persona, threadId, 'guest-a')
    expect(persona.threads[0].memberIds).toEqual(['guest-c'])
    persona = inviteGuest(persona, threadId, 'guest-a')
    expect(persona.threads[0].memberIds).toEqual(['guest-c', 'guest-a'])
    expect(persona.guests?.find((item) => item.id === 'guest-a')?.memories).toHaveLength(1)
    expect(persona.memories).toEqual([])
    persona = deleteGuest(persona, 'guest-a')
    expect(persona.guests?.map((item) => item.id)).toEqual(['guest-c'])
    expect(persona.threads[0].memberIds).toEqual(['guest-c'])
  })

  it('names that clash with the owner or her get a suffix', () => {
    const persona = enablePersona(emptyPersonaState(), 'yu').personas[0]
    const { guest } = addGuest(persona, persona.threads[0].id, { source: 'custom', name: '虞山行' }, ['虞山行', '周惟惟'])
    expect(guest?.name).toBe('虞山行2')
  })

  it('a guest only remembers what happened while present; transcripts carry his name; phone notes skip him', () => {
    const persona = groupPersona()
    const messages: PersonaMessage[] = [
      { id: 1, role: 'user', text: '私下跟你说', createdAt: 1 },
      { id: 2, role: 'assistant', text: '嗯', createdAt: 2 },
      { id: 3, role: 'user', text: '@阿七 来碗面', createdAt: 3, present: ['guest-a'] },
      { id: 4, role: 'assistant', text: '好嘞', createdAt: 4, speakerId: 'guest-a', speakerName: '阿七', present: ['guest-a'], groupTurn: 4 },
    ]
    const thread = { ...persona.threads[0], messages }
    expect(pendingGuestMessages(thread, 'guest-a').map((item) => item.id)).toEqual([3, 4])
    expect(pendingGuestMessages(thread, 'guest-c')).toEqual([])
    expect(personaContinuityTranscript(messages, { char: '虞山行', user: '周惟惟' })).toContain('[4] 阿七：好嘞')
    const note = buildPersonaWindowNoteForPhone(stateWith({ ...persona, threads: [thread] }), 'yu', { char: '虞山行', user: '周惟惟' })
    expect(note).not.toContain('好嘞')
    expect(note).toContain('私下跟你说')
  })
})

describe('生成 (v234)', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  const live = { ...deps, api: { baseUrl: 'https://relay.test/v1', apiKey: 'k', modelName: 'm' }, peopleSelfRecord: () => true, recordPeople: vi.fn(() => ['小满']) }
  const reply = (content: string) => vi.fn(async (_url: unknown, init?: RequestInit) => { void init; return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } }) })
  const seed = (transform: (persona: PersonaWindow) => PersonaWindow = (persona) => persona) => setPersonaState(() => stateWith(transform(groupPersona())))

  it('natural mode: one reply becomes several bubbles with their own speakers; tags never show', async () => {
    vi.stubGlobal('fetch', reply('【阿七】客官！[送礼:daisy|给你]\n[人物:小满|朋友]\n[自我卡:性格|改了]\n【虞山行】……拿着。[送礼:rose|别丢]\n【林栖】师兄脸红了。'))
    seed((persona) => setReplyMode(persona, persona.threads[0].id, 'natural'))
    await generatePersonaReply(PID, live, { text: '大家好，小满也来了' })
    const persona = getPersonaState().personas[0]
    const [user, a, main, lin] = persona.threads[0].messages
    expect(user).toMatchObject({ role: 'user', present: ['guest-a', 'guest-c'] })
    expect(a).toMatchObject({ speakerId: 'guest-a', speakerName: '阿七', text: '客官！', groupTurn: a.id })
    expect(a.gift).toBeUndefined()
    expect(a.selfCardEdit).toBeUndefined()
    expect(main).toMatchObject({ speakerId: PID, text: '……拿着。', groupTurn: a.id })
    expect(main.gift).toMatchObject({ giftId: 'rose', direction: 'role-to-user' })
    expect(lin).toMatchObject({ speakerId: 'guest-c', text: '师兄脸红了。' })
    // 客人的 [人物:]、[自我卡:] 丢掉：主人格那段没有，所以都不生效
    expect(live.recordPeople).not.toHaveBeenCalled()
    expect(persona.selfCard).toBeUndefined()
    for (const message of [a, main, lin]) expect(message.text).not.toMatch(/【|\[/)
  })

  it('@ mode: only the mentioned answer, in order; regenerate replaces the whole turn', async () => {
    const fetchMock = reply('【林栖】我先。\n【虞山行】我也说。\n【阿七】我后。')
    vi.stubGlobal('fetch', fetchMock)
    seed()
    await generatePersonaReply(PID, live, { text: '@林栖 @阿七 你们说' })
    let messages = getPersonaState().personas[0].threads[0].messages
    expect(messages.map((item) => item.speakerId)).toEqual([undefined, 'guest-c', 'guest-a'])
    expect(allText([{ role: 'user', content: String(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).messages.slice(-1)[0].content) }])).toContain('本轮依次由 林栖、阿七 回复')
    vi.stubGlobal('fetch', reply('【林栖】重来一遍。'))
    await generatePersonaReply(PID, live, { regenerate: true })
    messages = getPersonaState().personas[0].threads[0].messages
    expect(messages.map((item) => item.text)).toEqual(['@林栖 @阿七 你们说', '重来一遍。'])
  })

  it('memory isolation: a guest [记忆:] goes to him only, the owner\'s to the owner only', async () => {
    vi.stubGlobal('fetch', reply('【阿七】记下了。[记忆:周惟惟爱吃阳春面]\n【虞山行】嗯。[记忆:她今天心情很好]'))
    seed((persona) => setReplyMode(persona, persona.threads[0].id, 'natural'))
    await generatePersonaReply(PID, live, { text: '我爱吃阳春面，今天心情很好' })
    const persona = getPersonaState().personas[0]
    expect(persona.memories.map((item) => item.content)).toEqual(['她今天心情很好'])
    expect(persona.guests?.find((item) => item.id === 'guest-a')?.memories.map((item) => item.content)).toEqual(['周惟惟爱吃阳春面'])
    expect(persona.guests?.find((item) => item.id === 'guest-c')?.memories).toEqual([])
  })

  it('streaming: chunks that cut a marker in half still end up as clean bubbles', async () => {
    const chunks = ['（抬眼）嗯。\n【阿', '七】客', '官！\n【林', '栖】师兄……', '\n【周惟', '惟】我替她说']
    const sse = chunks.map((piece) => `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`).join('') + 'data: [DONE]\n\n'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })))
    seed((persona) => setReplyMode(persona, persona.threads[0].id, 'natural'))
    await generatePersonaReply(PID, { ...live, streaming: true }, { text: '大家好' })
    const messages = getPersonaState().personas[0].threads[0].messages.slice(1)
    expect(messages.map((item) => [item.speakerId, item.text])).toEqual([[PID, '（抬眼）嗯。'], ['guest-a', '客官！'], ['guest-c', '师兄……']])
  })

  it('only the owner in the window: exactly the old one-message reply', async () => {
    vi.stubGlobal('fetch', reply('嗯。【阿七】不该出现'))
    setPersonaState(() => updatePersona(enablePersona(emptyPersonaState(), 'yu'), PID, (item) => item))
    await generatePersonaReply(PID, live, { text: '在吗' })
    const messages = getPersonaState().personas[0].threads[0].messages
    expect(messages).toHaveLength(2)
    expect(messages[1].text).toBe('嗯。【阿七】不该出现')
    expect(messages[1].speakerId).toBeUndefined()
    expect(messages[0].present).toBeUndefined()
  })
})
