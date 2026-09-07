import type { Character, CharacterMemoryEntry } from './characterCard'
import { mergeCharacterMemoryEntries } from './characterMemory'
import type { Conversation } from './conversationLifecycle'

const sourceMemoryId = (entry: CharacterMemoryEntry) => typeof entry.sourceMemoryId === 'string' ? entry.sourceMemoryId : ''

export function conversationHasCharacter(conversation: Conversation, characterId: string) {
  return conversation.kind === 'group'
    ? Boolean(conversation.participantIds?.includes(characterId))
    : conversation.characterId === characterId
}

/** Memories visible to one actor in one conversation only. */
export function memoriesForConversationCharacter(conversation: Conversation | undefined, character: Character) {
  if (!conversation || !conversationHasCharacter(conversation, character.id)) return []
  if (Object.prototype.hasOwnProperty.call(conversation.characterMemories || {}, character.id)) {
    return conversation.characterMemories?.[character.id] || []
  }

  // Read-only compatibility while the one-time migration is being applied.
  // Auto-extracted legacy entries carry their source conversation in this id.
  return (character.characterMemory || []).filter((entry) =>
    sourceMemoryId(entry).startsWith(`memory-scan-${conversation.id}-`),
  )
}

export function setConversationCharacterMemories(
  conversation: Conversation,
  characterId: string,
  entries: CharacterMemoryEntry[],
) {
  return {
    ...conversation,
    characterMemories: { ...(conversation.characterMemories || {}), [characterId]: entries },
  }
}

export function mergeConversationCharacterMemories(
  conversation: Conversation,
  characterIds: Iterable<string>,
  incoming: CharacterMemoryEntry[],
) {
  let next = conversation
  for (const characterId of characterIds) {
    const existing = next.characterMemories?.[characterId] || []
    next = setConversationCharacterMemories(next, characterId, mergeCharacterMemoryEntries(existing, incoming))
  }
  return next
}

function sourceConversation(entry: CharacterMemoryEntry, conversations: Conversation[]) {
  const sourceId = sourceMemoryId(entry)
  if (!sourceId) return undefined
  return conversations
    .slice()
    .sort((left, right) => right.id.length - left.id.length)
    .find((conversation) => sourceId.startsWith(`memory-scan-${conversation.id}-`))
}

/**
 * Move legacy card-global memories into their originating conversation. Older
 * hand-written entries without a source id are preserved in only the most
 * recently used conversation for that character.
 */
export function migrateCardMemoriesToConversations(characters: Character[], conversations: Conversation[]) {
  let changed = false
  let nextConversations = conversations
  const nextCharacters = characters.map((character) => {
    const legacy = character.characterMemory || []
    if (!legacy.length) return character

    const eligible = conversations
      .filter((conversation) => conversationHasCharacter(conversation, character.id))
      .sort((left, right) => right.updatedAt - left.updatedAt)
    if (!eligible.length) return character

    changed = true
    const grouped = new Map<string, CharacterMemoryEntry[]>()
    for (const entry of legacy) {
      const target = sourceConversation(entry, eligible) || eligible[0]
      grouped.set(target.id, [...(grouped.get(target.id) || []), entry])
    }
    nextConversations = nextConversations.map((conversation) => {
      const incoming = grouped.get(conversation.id)
      if (!incoming?.length) return conversation
      return mergeConversationCharacterMemories(conversation, [character.id], incoming)
    })
    return { ...character, characterMemory: [] }
  })

  return { changed, characters: nextCharacters, conversations: nextConversations }
}
