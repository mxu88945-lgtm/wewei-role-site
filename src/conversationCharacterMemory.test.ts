import { describe, expect, it } from 'vitest'
import { createBlankCharacter, createCharacterMemoryEntry } from './characterCard'
import { memoriesForConversationCharacter, migrateCardMemoriesToConversations } from './conversationCharacterMemory'
import type { Conversation } from './conversationLifecycle'

const conversation = (id: string, updatedAt: number): Conversation => ({
  id, characterId: 'actor', title: id, messages: [], createdAt: updatedAt, updatedAt,
})

describe('conversation-scoped character memory', () => {
  it('does not expose one conversation memory in a fresh conversation', () => {
    const character = { ...createBlankCharacter({ name: 'actor', tagline: '', description: '', greeting: '', tags: '' }), id: 'actor' }
    const oldChat = { ...conversation('old-chat', 1), characterMemories: { actor: [createCharacterMemoryEntry({ content: '旧剧组事实' })] } }
    const newChat = conversation('new-chat', 2)
    expect(memoriesForConversationCharacter(oldChat, character)).toHaveLength(1)
    expect(memoriesForConversationCharacter(newChat, character)).toEqual([])
  })

  it('migrates sourced entries to their original chat and unsourced entries to only the latest chat', () => {
    const sourced = createCharacterMemoryEntry({ content: '旧群事实', sourceMemoryId: 'memory-scan-old-chat-0-20' })
    const manual = createCharacterMemoryEntry({ content: '手工事实' })
    const character = { ...createBlankCharacter({ name: 'actor', tagline: '', description: '', greeting: '', tags: '' }), id: 'actor', characterMemory: [sourced, manual] }
    const result = migrateCardMemoriesToConversations([character], [conversation('old-chat', 1), conversation('new-chat', 2)])
    expect(result.characters[0].characterMemory).toEqual([])
    expect(result.conversations[0].characterMemories?.actor.map((entry) => entry.content)).toEqual(['旧群事实'])
    expect(result.conversations[1].characterMemories?.actor.map((entry) => entry.content)).toEqual(['手工事实'])
  })
})
