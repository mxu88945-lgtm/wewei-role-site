import type { DirectorTemplateConfig } from './directorTemplate'

export type Message = { id: number; role: 'user' | 'assistant'; text: string; characterId?: string; finishReason?: string | null }

export type Conversation = {
  id: string
  characterId: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  contextSummary?: string
  contextSummaryRevision?: number
  compressedUntil?: number
  historyRevision?: number
  kind?: 'single' | 'group'
  participantIds?: string[]
  participantApiIds?: Record<string, string>
  participantModelNames?: Record<string, string>
  memorySummarizedCount?: number
  personaId?: string
  themePresetId?: string
  themeFrost?: number
  theaterWorldBackground?: string
  directorCharacterId?: string
  directorConfig?: DirectorTemplateConfig
  relationshipStages?: Record<string, number>
}

export function addConversationParticipant(source: Conversation, participantId: string, defaults: { apiId: string; modelName: string; title?: string }): Conversation {
  const existingIds = source.kind === 'group' && source.participantIds?.length ? source.participantIds : [source.characterId]
  if (existingIds.includes(participantId)) return source
  const participantIds = [...existingIds, participantId]
  const participantApiIds = { ...(source.participantApiIds || {}) }
  const participantModelNames = { ...(source.participantModelNames || {}) }
  participantIds.forEach((id) => {
    if (!participantApiIds[id]) participantApiIds[id] = defaults.apiId
    if (!participantModelNames[id]) participantModelNames[id] = defaults.modelName
  })

  return {
    ...source,
    kind: 'group',
    participantIds,
    participantApiIds,
    participantModelNames,
    title: source.kind === 'group' ? source.title : defaults.title || source.title,
    messages: source.messages.map((message) => message.role === 'assistant' && !message.characterId ? { ...message, characterId: source.characterId } : message),
    updatedAt: Date.now(),
  }
}

export function createFreshConversationFrom(source: Conversation, greeting: string, greetingCharacterId?: string): Conversation {
  const now = Date.now()
  const openingMessage: Message = { id: now, role: 'assistant', text: greeting }
  if (source.kind === 'group' && greetingCharacterId) openingMessage.characterId = greetingCharacterId
  const baseTitle = source.title.replace(/(?: · 新对话)+$/, '')
  return {
    id: `${source.kind === 'group' ? 'group' : source.characterId}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    characterId: source.characterId,
    title: `${baseTitle} · 新对话`,
    messages: [openingMessage],
    createdAt: now,
    updatedAt: now,
    historyRevision: 0,
    memorySummarizedCount: 0,
    kind: source.kind,
    participantIds: source.participantIds ? [...source.participantIds] : undefined,
    participantApiIds: source.participantApiIds ? { ...source.participantApiIds } : undefined,
    participantModelNames: source.participantModelNames ? { ...source.participantModelNames } : undefined,
    personaId: source.personaId,
    themePresetId: source.themePresetId,
    themeFrost: source.themeFrost,
    theaterWorldBackground: source.theaterWorldBackground,
    directorCharacterId: source.directorCharacterId,
    directorConfig: source.directorConfig ? { ...source.directorConfig } : undefined,
  }
}
