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
