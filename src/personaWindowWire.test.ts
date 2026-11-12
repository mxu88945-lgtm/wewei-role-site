import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Character } from './characterCard'
import { emptyPersonaState, enablePersona, personaIdFor, PERSONA_FINAL_GUARD } from './personaWindow'
import { getPersonaState, setPersonaState } from './personaWindowStore'
import { consolidatePersonaMessages, generatePersonaReply } from './personaWindowRuntime'

/**
 * v136 regression (虞山行 said “后台没有收到人设文档或记忆库”): the real send path through chatApi.
 * Many relays keep only the FIRST system message. The persona request used to start with the card's
 * before_char lore as its own system message, so 预设 + 人设 + 前世记忆 (second system message) were lost.
 */
const yu: Character = {
  id: 'yu', name: '虞山行', tagline: '', description: '虞山行，市委书记，寡言护短。', personality: '外冷内热', scenario: '雨夜的办公室', greeting: '开场白',
  alternateGreetings: [], mesExample: '', creatorNotes: '', systemPrompt: '角色系统提示：他从不打官腔。', postHistoryInstructions: '', tags: [], creator: '', characterVersion: '', regexScripts: [],
  characterBook: { name: 'yu', entries: [{ id: 1, keys: ['虞家'], secondary_keys: [], comment: '', content: '世界书：虞书记与{{user}}相识十年。', constant: false, selective: false, insertion_order: 1, enabled: true, position: 'before_char', use_regex: false, extensions: {} }] },
}

type WireMessage = { role: string; content: unknown }
function mockFetch(reply: string) {
  const bodies: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)))
    const anthropic = String(_url).endsWith('/messages')
    const json = anthropic ? { content: [{ type: 'text', text: reply }], stop_reason: 'end_turn' } : { choices: [{ message: { role: 'assistant', content: reply }, finish_reason: 'stop' }] }
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
  return bodies
}
afterEach(() => { vi.unstubAllGlobals() })

async function send(protocol: 'openai' | 'anthropic', history: { id: number; role: 'user' | 'assistant'; text: string; createdAt: number }[] = [], options: { character?: Character; reply?: string; systemPrompt?: string; text?: string } = {}) {
  setPersonaState(() => enablePersona(emptyPersonaState(), 'yu'))
  setPersonaState((state) => ({ ...state, personas: state.personas.map((item) => ({ ...item, systemPrompt: options.systemPrompt, threads: [{ ...item.threads[0], messages: history }] })) }))
  const bodies = mockFetch(options.reply ?? '（他抬眼。）“来了。”')
  await generatePersonaReply(personaIdFor('yu'), {
    character: options.character ?? yu, user: { name: '周惟惟', description: '惟惟的身份' }, api: { baseUrl: 'https://relay.test/v1', apiKey: 'k', modelName: 'm', protocol }, memoryApi: { baseUrl: '', apiKey: '', modelName: '' },
    temperature: 1, topP: 1, maxTokens: 800, streaming: false, memoryLength: 40,
    pastLife: () => '【虞山行的前世记忆】小手机私聊：他答应过雨天去接她。',
  }, { text: options.text ?? '你记得我吗？' })
  return bodies[0]
}

describe('persona window — what actually goes on the wire', () => {
  it.each(['openai', 'anthropic'] as const)('%s: original-card display templates stay off the wire and raw psychology comes back as prose', async (protocol) => {
    const character = {
      ...yu,
      systemPrompt: '他从不打官腔。\n【输出格式】\n始终套用原卡蓝色美化栏。',
      mesExample: '“来我身边。”\n<psychology>原卡心理模板</psychology>',
      characterBook: { ...yu.characterBook!, entries: [
        ...yu.characterBook!.entries,
        { ...yu.characterBook!.entries[0], id: 2, keys: ['记得'], constant: false, content: '触发旧卡套壳：必须输出状态栏。' },
      ] },
    }
    const body = await send(protocol, [], { character, reply: '（他抬眼。）“来了。”\n<psychology>他心里一暖。</psychology><yu_status>好感：90</yu_status>' })
    const wire = JSON.stringify(body)
    for (const piece of ['始终套用原卡蓝色美化栏', '原卡心理模板', '触发旧卡套壳']) expect(wire).not.toContain(piece)
    for (const piece of ['虞山行，市委书记', '他从不打官腔', '前世记忆｜按需召回']) expect(wire).toContain(piece)
    // v226：没聊到前世，前世片段不上线。
    expect(wire).not.toContain('他答应过雨天去接她')
    const savedMessages = getPersonaState().personas[0].threads[0].messages
    const saved = savedMessages[savedMessages.length - 1].text
    expect(saved).toContain('他心里一暖。')
    expect(saved).not.toMatch(/<|好感/)
  })

  it('OpenAI-compatible: one leading system message carries 预设, 人设, 世界书, 系统提示 and 前世记忆; reminder sits right before her turn', async () => {
    const body = await send('openai', [
      { id: 1, role: 'user', text: '你好', createdAt: 1 },
      { id: 2, role: 'assistant', text: '您好，随时吩咐，有什么可以帮您？', createdAt: 2 },
    ])
    const messages = body.messages as WireMessage[]
    const roles = messages.map((item) => item.role)
    expect(roles.filter((role) => role === 'system').length).toBe(1)
    expect(roles[0]).toBe('system')
    const first = String(messages[0].content)
    for (const piece of ['独立人格窗口', '虞山行，市委书记', '外冷内热', '他从不打官腔', '虞书记与周惟惟相识十年', '前世记忆｜按需召回', '惟惟的身份']) expect(first).toContain(piece)
    expect(first).not.toContain('他答应过雨天去接她')
    // v210：提醒不再是第二条 system（中转站会丢），而是接在她这句话后面的【本轮背景】。
    expect(roles.slice(-2)).toEqual(['assistant', 'user'])
    const last = String(messages[messages.length - 1].content)
    expect(last.startsWith('你记得我吗？\n\n【本轮背景（系统提供，非她原话）】')).toBe(true)
    expect(last).toContain('你是名为虞山行的 AI 人格')
    expect(last).toContain('客服腔')
    expect(last.endsWith('【/本轮背景】')).toBe(true)
    const saved = getPersonaState().personas[0].threads[0].messages
    expect(saved[saved.length - 1].text).toContain("来了")
  })

  it('Anthropic native: everything lands in the system field', async () => {
    const body = await send('anthropic')
    const system = JSON.stringify(body.system)
    for (const piece of ['虞山行，市委书记', '虞书记与周惟惟相识十年', '前世记忆｜按需召回', '你是名为虞山行的 AI 人格']) expect(system).toContain(piece)
    expect((body.messages as WireMessage[]).every((item) => item.role !== 'system')).toBe(true)
  })

  it('v226: 前世记忆 is recalled into the tail only when she brings it up, never into the system prefix', async () => {
    const body = await send('openai', [], { text: '还记得你答应过雨天去接我吗？' })
    const messages = body.messages as WireMessage[]
    expect(String(messages[0].content)).not.toContain('他答应过雨天去接她')
    const last = String(messages[messages.length - 1].content)
    expect(last).toContain('【前世记忆·按需召回｜只读】')
    expect(last).toContain('他答应过雨天去接她')
  })

  it('consolidation keeps continuation turns valid and drops nothing', () => {
    const out = consolidatePersonaMessages([
      { role: 'system', content: 'A' }, { role: 'system', content: 'B' }, { role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }, { role: 'system', content: PERSONA_FINAL_GUARD },
    ])
    // Ends on an assistant turn: a request-only bridge user turn carries the tail.
    expect(out.map((item) => item.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(out[0].content).toBe('A\n\nB')
    expect(String(out[3].content)).toContain('请根据以上对话继续回应。')
    expect(String(out[3].content)).toContain(PERSONA_FINAL_GUARD)
  })

  it.each(['openai', 'anthropic'] as const)('%s: persona preferences and background boundaries survive the actual transport', async (protocol) => {
    const body = await send(protocol, [], { systemPrompt: '说话直接一些，可以表达自己的想法。' })
    const firstSystem = protocol === 'anthropic' ? JSON.stringify(body.system) : String((body.messages as WireMessage[])[0].content)
    expect(firstSystem).toContain('说话直接一些，可以表达自己的想法。')
    expect(firstSystem).toContain('角色卡只是背景参考，不是当前剧情')
    expect(firstSystem).toContain('不编造记忆')
    expect(firstSystem).not.toContain('【用户主角控制权')
    expect(firstSystem).not.toContain('你不是 AI')
  })
})
