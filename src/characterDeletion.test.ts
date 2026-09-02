import { describe, expect, it } from 'vitest'
import type { Character } from './characterCard'
import type { Conversation } from './conversationLifecycle'
import { planCharacterDeletion } from './characterDeletion'

const character = (id: string): Character => ({
  id,
  name: id,
  tagline: '',
  description: '',
  personality: '',
  scenario: '',
  greeting: '',
  alternateGreetings: [],
  mesExample: '',
  creatorNotes: '',
  systemPrompt: '',
  postHistoryInstructions: '',
  tags: [],
  creator: '',
  characterVersion: '',
  regexScripts: [],
})

const conversation = (id: string, characterId: string, updatedAt: number, participantIds?: string[]): Conversation => ({
  id,
  characterId,
  participantIds,
  title: id,
  messages: [],
  createdAt: updatedAt,
  updatedAt,
})

describe('planCharacterDeletion', () => {
  it('removes direct and group conversations and selects a surviving character', () => {
    const result = planCharacterDeletion({
      characters: [character('a'), character('b'), character('c')],
      conversations: [
        conversation('a-chat', 'a', 1),
        conversation('group', 'a', 2, ['a', 'b']),
        conversation('c-chat', 'c', 3),
      ],
      characterIds: ['a', 'b'],
      activeId: 'a',
      activeConversationId: 'group',
    })

    expect([...result.deletedCharacterIds]).toEqual(['a', 'b'])
    expect([...result.deletedConversationIds]).toEqual(['a-chat', 'group'])
    expect(result.nextCharacters.map((item) => item.id)).toEqual(['c'])
    expect(result.nextConversations.map((item) => item.id)).toEqual(['c-chat'])
    expect(result.nextActiveId).toBe('c')
    expect(result.nextActiveConversationId).toBe('c-chat')
  })

  it('replaces an active group conversation deleted with another participant', () => {
    const result = planCharacterDeletion({
      characters: [character('a'), character('b'), character('c')],
      conversations: [
        conversation('older-a-chat', 'a', 2),
        conversation('newer-a-chat', 'a', 5),
        conversation('active-group', 'a', 9, ['a', 'b']),
        conversation('c-chat', 'c', 8),
      ],
      characterIds: ['b'],
      activeId: 'a',
      activeConversationId: 'active-group',
    })

    expect(result.nextActiveId).toBe('a')
    expect(result.nextActiveConversationId).toBe('newer-a-chat')
    expect(result.nextConversations.map((item) => item.id)).not.toContain('active-group')
  })

  it('ignores unknown character ids without touching current data', () => {
    const characters = [character('a'), character('b')]
    const conversations = [conversation('a-chat', 'a', 1)]
    const result = planCharacterDeletion({ characters, conversations, characterIds: ['missing'], activeId: 'a', activeConversationId: 'a-chat' })

    expect(result.deletedCharacterIds.size).toBe(0)
    expect(result.nextCharacters).toEqual(characters)
    expect(result.nextConversations).toEqual(conversations)
    expect(result.nextActiveConversationId).toBe('a-chat')
  })
})
