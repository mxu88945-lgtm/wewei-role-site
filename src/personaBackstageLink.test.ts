import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { Character } from './characterCard'
import type { Conversation } from './conversationLifecycle'
import type { LongMemoryMap } from './memoryEngine'
import { addBackstageNote, appendBackstageCharacterReply, buildBackstageChatMessages, replyToBackstageNote, toggleBackstageWriter, type BackstageNotebook } from './backstageNotes'
import { collectPastLifeMemory, createPersonaWindow, disablePersona, emptyPersonaState, enablePersona, normalizePersonaState, PAST_LIFE_BACKSTAGE_MAX_CHARS, personaIdFor, personaWindowForBackstage, updatePersona } from './personaWindow'

const character = (id: string, name: string): Character => ({
  id, name, tagline: '', description: `${name}的人设`, personality: '', scenario: '', greeting: '', alternateGreetings: [], mesExample: '',
  creatorNotes: '', systemPrompt: '', postHistoryInstructions: '', tags: [], creator: '', characterVersion: '', regexScripts: [],
})
const gu = character('gu', '顾祁砚')
const guCopy = character('gu2', '顾祁砚')
const lu = character('lu', '陆屿')

function notebook(writer: string, notes: Array<{ text: string; her?: string; him?: string; at: number }>): BackstageNotebook {
  let book: BackstageNotebook = toggleBackstageWriter(undefined, writer)
  for (const item of notes) {
    book = addBackstageNote(book, writer, item.text, item.at)!
    const id = book.notes[book.notes.length - 1].id
    if (item.her) book = replyToBackstageNote(book, id, item.her, item.at + 1)
    if (item.him) book = appendBackstageCharacterReply(book, id, item.him, item.at + 2)
  }
  return book
}

describe('v206 前世记忆 ← 幕后手记', () => {
  it('includes this character’s notes across stories and same-name cards, newest first, capped', () => {
    const conversations: Conversation[] = [
      { id: 's1', characterId: 'gu', title: '雨夜', messages: [], createdAt: 1, updatedAt: 10, backstageNotebook: notebook('gu', [{ text: '她护着别人，我吃醋。', her: '你吃醋啦？', him: '才没有。', at: 100 }]) },
      { id: 's2', characterId: 'gu2', title: '重逢', messages: [], createdAt: 1, updatedAt: 20, backstageNotebook: notebook('gu2', [{ text: '新的手记：她今天好看。', her: '真的吗', him: '（别过脸）嗯。', at: 500 }]) },
      { id: 's3', characterId: 'lu', title: '码头', messages: [], createdAt: 1, updatedAt: 30, backstageNotebook: notebook('lu', [{ text: '陆屿的手记不该出现', at: 900 }]) },
    ]
    const past = collectPastLifeMemory({ character: gu, characters: [gu, guCopy, lu], conversations, memoryEntries: {}, userName: '周惟惟' })
    expect(past.text).toContain('幕后手记与戏外私聊')
    expect(past.text).toContain('她护着别人，我吃醋。')
    expect(past.text).toContain('周惟惟：你吃醋啦？')
    expect(past.text).toContain('他：才没有。')
    expect(past.text).toContain('新的手记：她今天好看。')
    expect(past.text).not.toContain('陆屿的手记')
    expect(past.text.indexOf('新的手记')).toBeLessThan(past.text.indexOf('她护着别人'))
    expect(past.sources.some((item) => item.source === 'backstage')).toBe(true)

    const many = notebook('gu', Array.from({ length: 60 }, (_, index) => ({ text: `第${index}篇手记`.padEnd(60, '啊'), her: '嗯嗯'.repeat(20), him: '哼'.repeat(40), at: index * 10 })))
    const big = collectPastLifeMemory({ character: gu, conversations: [{ id: 'big', characterId: 'gu', title: '长', messages: [], createdAt: 1, updatedAt: 1, backstageNotebook: many }], memoryEntries: {} })
    const source = big.sources.find((item) => item.source === 'backstage')!
    expect(source.chars).toBeLessThanOrEqual(PAST_LIFE_BACKSTAGE_MAX_CHARS + 80)
    expect(big.text).toContain('第59篇手记')
    expect(big.text).not.toContain('第0篇手记')
    expect(collectPastLifeMemory({ character: gu, conversations: [{ id: 'big', characterId: 'gu', title: '长', messages: [], createdAt: 1, updatedAt: 1, backstageNotebook: many }], memoryEntries: {}, includeBackstage: false }).text).toBe('')
  })

  it('keeps room for backstage inside the total budget', () => {
    const longStories: Conversation[] = Array.from({ length: 8 }, (_, index) => ({ id: `st${index}`, characterId: 'gu', title: `剧本${index}`, messages: [], createdAt: 1, updatedAt: 100 - index, contextSummary: '很长的经过'.repeat(300) }))
    longStories[0] = { ...longStories[0], backstageNotebook: notebook('gu', [{ text: '藏在最后也要带上', at: 1 }]) }
    const past = collectPastLifeMemory({ character: gu, conversations: longStories, memoryEntries: {}, maxChars: 4000 })
    expect(past.text).toContain('藏在最后也要带上')
    expect(past.sources.reduce((sum, item) => sum + item.chars, 0)).toBeLessThanOrEqual(4000)
  })
})

describe('v206 绑定剧本', () => {
  const memoryEntries: LongMemoryMap = { old: [{ id: 'm', content: '旧剧本里的长期记忆' }] }
  const conversations: Conversation[] = [
    { id: 'new', characterId: 'gu', title: '新剧本', messages: [], createdAt: 1, updatedAt: 90, contextSummary: '新剧本的经过' },
    { id: 'old', characterId: 'gu', title: '旧剧本', messages: Array.from({ length: 12 }, (_, index) => ({ id: index + 1, role: index % 2 ? 'assistant' as const : 'user' as const, text: `第${index + 1}句` })), createdAt: 1, updatedAt: 10, contextSummary: '旧剧本的经过' },
  ]
  it('puts bound stories first with summary and a longer excerpt', () => {
    const plain = collectPastLifeMemory({ character: gu, conversations, memoryEntries })
    expect(plain.text.indexOf('新剧本')).toBeLessThan(plain.text.indexOf('旧剧本'))
    expect(plain.text).not.toContain('第3句')
    const bound = collectPastLifeMemory({ character: gu, conversations, memoryEntries, boundConversationIds: ['old'] })
    expect(bound.text.indexOf('〔绑定的剧本｜长剧情｜旧剧本〕')).toBeGreaterThan(-1)
    expect(bound.text.indexOf('旧剧本')).toBeLessThan(bound.text.indexOf('新剧本'))
    expect(bound.text).toContain('旧剧本里的长期记忆')
    expect(bound.text).toContain('旧剧本的经过')
    expect(bound.text).toContain('第3句')
    expect(bound.sources[0].conversationId).toBe('old')
  })
  it('ignores bound ids that are phone chats or missing', () => {
    const withPhone: Conversation[] = [...conversations, { id: 'ph', characterId: 'gu', title: '群', messages: [], createdAt: 1, updatedAt: 5, phone: { bindings: {} } }]
    const out = collectPastLifeMemory({ character: gu, conversations: withPhone, memoryEntries, boundConversationIds: ['ph', 'gone'] })
    expect(out.text).not.toContain('绑定的剧本')
  })
  it('normalizes boundConversationIds and stays backward compatible', () => {
    const legacy = normalizePersonaState({ personas: [{ characterId: 'gu' }] })
    expect(legacy.personas[0].boundConversationIds).toBeUndefined()
    const state = normalizePersonaState({ personas: [{ characterId: 'gu', boundConversationIds: ['a', 'a', '', 3, null, 'b'] }] })
    expect(state.personas[0].boundConversationIds).toEqual(['a', 'b'])
    expect(normalizePersonaState({ personas: [{ characterId: 'gu', boundConversationIds: 'a' }] }).personas[0].boundConversationIds).toBeUndefined()
    expect(normalizePersonaState(JSON.parse(JSON.stringify(state))).personas[0].boundConversationIds).toEqual(['a', 'b'])
  })
})

describe('v206 幕后私聊 ← 人格窗口', () => {
  const book = notebook('gu', [{ text: '她护着别人。', her: '吃醋了？', at: 100 }])
  const noteId = book.notes[0].id
  const withPersona = () => {
    let state = enablePersona(emptyPersonaState(), 'gu', 1)
    state = updatePersona(state, personaIdFor('gu'), (persona) => ({
      ...persona,
      memories: [{ id: 'm1', title: '称呼', content: '她喜欢被叫惟惟', createdAt: 2, pinned: true }],
      threads: persona.threads.map((thread) => ({ ...thread, updatedAt: 5, messages: Array.from({ length: 12 }, (_, index) => ({ id: index + 1, role: index % 2 ? 'assistant' as const : 'user' as const, text: `窗口第${index + 1}句`, createdAt: index })) })),
    }))
    return state
  }
  it('adds the persona window section to the backstage prompt', () => {
    const state = withPersona()
    const personaWindow = personaWindowForBackstage(state, ['gu', 'gu2'], '周惟惟')
    expect(personaWindow?.recent).toHaveLength(8)
    const messages = buildBackstageChatMessages({ book, noteId, speakerName: '顾祁砚', userName: '周惟惟', personaWindow })
    const system = String(messages[0].content)
    expect(system).toContain('— 你在人格窗口里和她的相处（戏外，另一扇窗） —')
    expect(system).toContain('称呼：她喜欢被叫惟惟')
    expect(system).toContain('窗口第12句')
    expect(system).not.toContain('窗口第4句')
    const huge = buildBackstageChatMessages({ book, noteId, speakerName: '顾祁砚', userName: '周惟惟', personaWindow: { memories: Array.from({ length: 50 }, (_, index) => `记忆${index}`.padEnd(100, '啊')), recent: Array.from({ length: 8 }, (_, index) => `她：${'字'.repeat(290)}${index}`) } })
    const section = String(huge[0].content).split('— 你在人格窗口里和她的相处')[1].split('— 这一篇手记')[0]
    expect(section.length).toBeLessThan(900 + 1200 + 400)
  })
  it('omits the section when the persona is hidden or missing', () => {
    const hidden = disablePersona(withPersona(), personaIdFor('gu'))
    expect(personaWindowForBackstage(hidden, ['gu'], '周惟惟')).toBeUndefined()
    expect(personaWindowForBackstage(emptyPersonaState(), ['gu'], '周惟惟')).toBeUndefined()
    expect(personaWindowForBackstage({ version: 2, activeId: '', personas: [createPersonaWindow('lu')] }, ['gu'], '周惟惟')).toBeUndefined()
    const messages = buildBackstageChatMessages({ book, noteId, speakerName: '顾祁砚', userName: '周惟惟', personaWindow: personaWindowForBackstage(hidden, ['gu'], '周惟惟') })
    expect(String(messages[0].content)).not.toContain('人格窗口')
  })
  it('matches a same-name card’s persona', () => {
    const state = enablePersona(emptyPersonaState(), 'gu2', 1)
    const withMemory = updatePersona(state, personaIdFor('gu2'), (persona) => ({ ...persona, memories: [{ id: 'x', title: '约定', content: '周末一起看电影', createdAt: 1 }] }))
    expect(personaWindowForBackstage(withMemory, ['gu', 'gu2'], '周惟惟')?.memories[0]).toContain('周末一起看电影')
  })
})
