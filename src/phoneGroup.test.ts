import { describe, expect, it } from 'vitest'
import { normalizeStoredCharacter } from './characterCard'
import type { Conversation } from './conversationLifecycle'
import { buildPhoneArchive, buildPhoneGroupBackground, phoneBindingCandidates, phoneCharacter, phoneModeRules } from './phoneGroup'

const xie = normalizeStoredCharacter({ id: 'xie', name: '谢聿衡', description: '临江谢氏掌权人，婚内出轨。', personality: '自负冷硬。', scenario: '婚姻破裂。', greeting: '<scene>夜</scene>你来了', systemPrompt: '永不出戏', beautificationProtocol: '<gts_status>', characterBook: { name: 'b', entries: [{ id: 1, keys: ['栖澜公馆'], content: '谢家的顶层复式。', comment: '栖澜公馆', enabled: true }] } as never })
const gu = normalizeStoredCharacter({ id: 'gu', name: '顾祁砚', description: '另一个故事的男主。' })
const chat = (id: string, characterId: string, extra: Partial<Conversation> = {}) => ({ id, characterId, title: id, messages: [{ id: 1, role: 'assistant', text: '<scene>夜</scene>你回来了' }, { id: 2, role: 'user', text: '嗯' }], createdAt: 0, updatedAt: 1, ...extra }) as Conversation

describe('phone group', () => {
  it('drops story-mode output rules but keeps the persona', () => {
    const card = phoneCharacter(xie)
    expect(card.description).toContain('婚内出轨')
    expect(card.greeting).toBe('')
    expect(card.systemPrompt).toBe('')
    expect(card.beautificationProtocol).toBe('')
    expect(card.regexScripts).toEqual([])
  })

  it('pastes every member background and world into the shared world', () => {
    const world = buildPhoneGroupBackground([xie, gu])
    expect(world).toContain('【谢聿衡')
    expect(world).toContain('婚内出轨')
    expect(world).toContain('栖澜公馆：谢家的顶层复式。')
    expect(world).toContain('【顾祁砚')
  })

  it('builds archives with own story marked and lookup etiquette', () => {
    const archive = buildPhoneArchive([
      { character: xie, conversation: chat('谢聿衡_苏苒', 'xie', { contextSummary: '裴以沫离开了他。' }), characterMemories: [{ title: '戒指', content: '两枚白金戒圈' }], longMemories: [] },
      { character: gu, conversation: undefined, characterMemories: [], longMemories: [] },
    ], 'xie', '惟惟', () => '谢聿衡')
    expect(archive).toContain('这是你自己演过的戏')
    expect(archive).toContain('裴以沫离开了他')
    expect(archive).toContain('戒指：两枚白金戒圈')
    expect(archive).toContain('申请查阅')
    expect(archive).not.toContain('<scene>')
  })

  it('rules ask for short chat lines and no tags', () => {
    const rules = phoneModeRules('谢聿衡', ['谢聿衡', '顾祁砚'], '惟惟')
    expect(rules).toContain('微信')
    expect(rules).toContain('不输出 <scene>')
  })

  it('offers only real past chats with that card as bindings, newest first', () => {
    const list = [chat('a', 'xie', { updatedAt: 1 }), chat('b', 'gu'), chat('c', 'gu', { kind: 'group', participantIds: ['gu', 'xie'], updatedAt: 5 }), chat('p', 'xie', { phone: { bindings: {} } })]
    expect(phoneBindingCandidates(list, 'xie').map((c) => c.id)).toEqual(['c', 'a'])
  })
})

describe('phone output and turn taking', () => {
  it('strips status panels, scene tags and inner-thought lines', async () => {
    const { cleanPhoneOutput } = await import('./phoneGroup')
    expect(cleanPhoneOutput('嗓子不舒服？\n有什么指示直接说。\n<gts_status>对你的态度：……｜内心：别让她听出来</gts_status>')).toBe('嗓子不舒服？\n有什么指示直接说。')
    expect(cleanPhoneOutput('<scene>栖澜公馆</scene>滚。\n内心：她怎么知道')).toBe('滚。')
  })

  it('picks natural repliers and chatters without the last speaker first', async () => {
    const { pickPhoneChatters, pickPhoneRepliers } = await import('./phoneGroup')
    const ids = ['xie', 'fu', 'shen', 'yu']
    const repliers = pickPhoneRepliers(ids, 'xie', '咳咳', () => 0.3)
    expect(repliers).toHaveLength(2)
    expect(repliers).not.toContain('xie')
    expect(pickPhoneRepliers(ids, undefined, '你们都在吗', () => 0.3)).toHaveLength(3)
    const chatters = pickPhoneChatters(ids, 'fu', () => 0.9)
    expect(chatters.length).toBe(3)
    expect(chatters[0]).not.toBe('fu')
    expect(new Set(chatters).size).toBe(chatters.length)
  })
})

describe('phone reply modes', () => {
  const people = [{ id: 'xie', name: '谢聿衡' }, { id: 'fu', name: '傅承砚' }, { id: 'shen', name: '沈衍' }]
  const ids = people.map((p) => p.id)
  it('点名 answers @ and plain names, including given names', async () => {
    const { findNamedParticipantIds, selectPhoneSpeakers } = await import('./phoneGroup')
    const named = findNamedParticipantIds('聿衡你过来，沈衍也是', people)
    expect(named).toEqual(['xie', 'shen'])
    expect(selectPhoneSpeakers({ mode: 'named', participantIds: ids, mentionedIds: [], namedIds: named, text: '' })).toEqual(['xie', 'shen'])
    expect(selectPhoneSpeakers({ mode: 'named', participantIds: ids, mentionedIds: [], namedIds: [], text: '咳咳' })).toEqual([])
  })
  it('只@ ignores plain names; 自由聊 adds one more voice to named people', async () => {
    const { selectPhoneSpeakers } = await import('./phoneGroup')
    expect(selectPhoneSpeakers({ mode: 'at', participantIds: ids, mentionedIds: ['fu'], namedIds: ['xie'], text: '' })).toEqual(['fu'])
    const free = selectPhoneSpeakers({ mode: 'free', participantIds: ids, mentionedIds: [], namedIds: ['xie'], text: '', random: () => 0 })
    expect(free[0]).toBe('xie')
    expect(free).toHaveLength(2)
    expect(selectPhoneSpeakers({ mode: 'free', participantIds: ids, mentionedIds: [], namedIds: [], text: '咳咳', random: () => 0 })).toHaveLength(2)
  })
})

describe('cleanPhoneOutput status leaks', () => {
  it('drops copied status monitors and field lines but keeps chat', async () => {
    const { cleanPhoneOutput } = await import('./phoneGroup')
    const raw = '大清早挺热闹。\n@周惟惟 别催她。\n<monitor>STATUS MONITOR // SHEN YAN\n沈衍当前状态：心境：自持</monitor>\n傅承砚：衣着：深灰西装｜状态：已完成本轮回应｜内心想法：尽兴\nSTATUS MONITOR // SHEN YAN\n心境：欲望浓烈｜衣着：黑色衬衫'
    expect(cleanPhoneOutput(raw)).toBe('大清早挺热闹。\n@周惟惟 别催她。')
    expect(cleanPhoneOutput('今天周末，你们谁也别催她。')).toBe('今天周末，你们谁也别催她。')
  })
})

describe('phone display has no card status', () => {
  it('MessageContent noStatus skips card status fallback', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const React = await import('react')
    const { default: MessageContent } = await import('./MessageContent')
    const character = normalizeStoredCharacter({ id: 'c', name: '沈衍', systemPrompt: '每轮末尾输出 <sy_status>心境：自持｜衣着：黑衬衫</sy_status>', regexScripts: [] } as never)
    const html = renderToStaticMarkup(React.createElement(MessageContent, { text: '散心就免了。', role: 'assistant', character, userName: '周惟惟', noStatus: true }))
    expect(html).not.toContain('status')
    expect(html).toContain('散心就免了')
  })
})
