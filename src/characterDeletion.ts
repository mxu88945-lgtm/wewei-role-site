import type { Character } from './characterCard'
import type { Conversation } from './conversationLifecycle'

type CharacterDeletionInput = {
  characters: Character[]
  conversations: Conversation[]
  characterIds: string[]
  activeId: string
  activeConversationId: string
}

export type CharacterDeletionPlan = {
  deletedCharacterIds: Set<string>
  deletedConversations: Conversation[]
  deletedConversationIds: Set<string>
  nextCharacters: Character[]
  nextConversations: Conversation[]
  nextActiveId: string
  nextActiveConversationId: string
}

export function planCharacterDeletion({ characters, conversations, characterIds, activeId, activeConversationId }: CharacterDeletionInput): CharacterDeletionPlan {
  const existingCharacterIds = new Set(characters.map((character) => character.id))
  const deletedCharacterIds = new Set(characterIds.filter((id) => existingCharacterIds.has(id)))
  const deletedConversations = conversations.filter((conversation) => deletedCharacterIds.has(conversation.characterId)
    || conversation.participantIds?.some((id) => deletedCharacterIds.has(id)))
  const deletedConversationIds = new Set(deletedConversations.map((conversation) => conversation.id))
  const nextCharacters = characters.filter((character) => !deletedCharacterIds.has(character.id))
  const nextConversations = conversations.filter((conversation) => !deletedConversationIds.has(conversation.id))
  const nextActiveId = deletedCharacterIds.has(activeId) ? (nextCharacters[0]?.id || '') : activeId

  let nextActiveConversationId = activeConversationId
  if (nextActiveId !== activeId || deletedConversationIds.has(activeConversationId)) {
    nextActiveConversationId = nextConversations
      .filter((conversation) => conversation.characterId === nextActiveId || conversation.participantIds?.includes(nextActiveId))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id || ''
  }

  return {
    deletedCharacterIds,
    deletedConversations,
    deletedConversationIds,
    nextCharacters,
    nextConversations,
    nextActiveId,
    nextActiveConversationId,
  }
}
