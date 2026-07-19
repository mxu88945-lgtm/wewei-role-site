export type StoryProjectStatus = 'active' | 'archived'

export type StoryEvidence = {
  id: string
  title: string
  detail: string
  visibility: 'public' | 'hidden'
  knownByCharacterIds: string[]
}

export type CharacterKnowledge = {
  characterId: string
  knownFacts: string[]
  unknownFacts: string[]
  mistakenBeliefs: string[]
}

export type StoryPlannedEventStatus = 'pending' | 'active' | 'completed'

export type StoryPlannedEvent = {
  id: string
  title: string
  detail: string
  triggerCondition: string
  status: StoryPlannedEventStatus
  progressNote: string
}

export type StoryCockpit = {
  currentTime: string
  currentLocation: string
  presentCharacterIds: string[]
  relationshipStage: string
  currentTask: string
  completedEvents: string[]
  openHooks: string[]
  evidence: StoryEvidence[]
  characterKnowledge: CharacterKnowledge[]
  nextDirections: string[]
  plannedEvents: StoryPlannedEvent[]
}

export type StoryAutoContinuity = {
  enabled: boolean
  lastProcessedAssistantMessageIds: Record<string, number>
  needsReview?: boolean
  lastRunAt?: number
  lastError?: string
  lastSummary?: string
}

export type StoryProject = {
  id: string
  version: 1
  title: string
  summary: string
  status: StoryProjectStatus
  characterIds: string[]
  conversationIds: string[]
  directorCharacterId?: string
  personaId?: string
  worldBackground: string
  cockpit: StoryCockpit
  autoContinuity: StoryAutoContinuity
  createdAt: number
  updatedAt: number
}

const uniqueStrings = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())))]
  : []

export function createStoryCockpit(): StoryCockpit {
  return {
    currentTime: '', currentLocation: '', presentCharacterIds: [], relationshipStage: '', currentTask: '',
    completedEvents: [], openHooks: [], evidence: [], characterKnowledge: [], nextDirections: [], plannedEvents: [],
  }
}

export function createStoryAutoContinuity(): StoryAutoContinuity {
  return { enabled: false, lastProcessedAssistantMessageIds: {} }
}

function normalizeStoryAutoContinuity(value: Partial<StoryAutoContinuity> | undefined): StoryAutoContinuity {
  const source = value?.lastProcessedAssistantMessageIds
  const lastProcessedAssistantMessageIds = source && typeof source === 'object'
    ? Object.fromEntries(Object.entries(source).filter((entry): entry is [string, number] => Boolean(entry[0]) && typeof entry[1] === 'number' && Number.isFinite(entry[1])))
    : {}
  return {
    enabled: value?.enabled === true,
    lastProcessedAssistantMessageIds,
    needsReview: value?.needsReview === true,
    lastRunAt: typeof value?.lastRunAt === 'number' ? value.lastRunAt : undefined,
    lastError: typeof value?.lastError === 'string' && value.lastError ? value.lastError : undefined,
    lastSummary: typeof value?.lastSummary === 'string' && value.lastSummary ? value.lastSummary : undefined,
  }
}

const normalizeEvidence = (value: Partial<StoryEvidence>, index: number): StoryEvidence => ({
  id: typeof value.id === 'string' && value.id ? value.id : `evidence-${Date.now()}-${index}`,
  title: typeof value.title === 'string' ? value.title : '',
  detail: typeof value.detail === 'string' ? value.detail : '',
  visibility: value.visibility === 'public' ? 'public' : 'hidden',
  knownByCharacterIds: uniqueStrings(value.knownByCharacterIds),
})

const normalizePlannedEvent = (value: Partial<StoryPlannedEvent>, index: number): StoryPlannedEvent => ({
  id: typeof value.id === 'string' && value.id ? value.id : `planned-event-${Date.now()}-${index}`,
  title: typeof value.title === 'string' ? value.title : '',
  detail: typeof value.detail === 'string' ? value.detail : '',
  triggerCondition: typeof value.triggerCondition === 'string' ? value.triggerCondition : '',
  status: value.status === 'active' || value.status === 'completed' ? value.status : 'pending',
  progressNote: typeof value.progressNote === 'string' ? value.progressNote : '',
})

export function normalizeStoryCockpit(value: Partial<StoryCockpit> | undefined): StoryCockpit {
  return {
    currentTime: typeof value?.currentTime === 'string' ? value.currentTime : '',
    currentLocation: typeof value?.currentLocation === 'string' ? value.currentLocation : '',
    presentCharacterIds: uniqueStrings(value?.presentCharacterIds),
    relationshipStage: typeof value?.relationshipStage === 'string' ? value.relationshipStage : '',
    currentTask: typeof value?.currentTask === 'string' ? value.currentTask : '',
    completedEvents: uniqueStrings(value?.completedEvents),
    openHooks: uniqueStrings(value?.openHooks),
    evidence: Array.isArray(value?.evidence) ? value.evidence.map((item, index) => normalizeEvidence(item || {}, index)) : [],
    characterKnowledge: Array.isArray(value?.characterKnowledge) ? value.characterKnowledge.map((item) => ({
      characterId: typeof item?.characterId === 'string' ? item.characterId : '',
      knownFacts: uniqueStrings(item?.knownFacts),
      unknownFacts: uniqueStrings(item?.unknownFacts),
      mistakenBeliefs: uniqueStrings(item?.mistakenBeliefs),
    })).filter((item) => item.characterId) : [],
    nextDirections: uniqueStrings(value?.nextDirections),
    plannedEvents: Array.isArray(value?.plannedEvents) ? value.plannedEvents.map((item, index) => normalizePlannedEvent(item || {}, index)) : [],
  }
}

export function createStoryProject(now = Date.now()): StoryProject {
  return {
    id: `story-${now}-${Math.random().toString(36).slice(2, 8)}`,
    version: 1,
    title: '',
    summary: '',
    status: 'active',
    characterIds: [],
    conversationIds: [],
    worldBackground: '',
    cockpit: createStoryCockpit(),
    autoContinuity: createStoryAutoContinuity(),
    createdAt: now,
    updatedAt: now,
  }
}

export function normalizeStoryProject(value: Partial<StoryProject>): StoryProject {
  const now = Date.now()
  return {
    id: typeof value.id === 'string' && value.id ? value.id : createStoryProject(now).id,
    version: 1,
    title: typeof value.title === 'string' ? value.title : '',
    summary: typeof value.summary === 'string' ? value.summary : '',
    status: value.status === 'archived' ? 'archived' : 'active',
    characterIds: uniqueStrings(value.characterIds),
    conversationIds: uniqueStrings(value.conversationIds),
    directorCharacterId: typeof value.directorCharacterId === 'string' && value.directorCharacterId ? value.directorCharacterId : undefined,
    personaId: typeof value.personaId === 'string' && value.personaId ? value.personaId : undefined,
    worldBackground: typeof value.worldBackground === 'string' ? value.worldBackground : '',
    cockpit: normalizeStoryCockpit(value.cockpit),
    autoContinuity: normalizeStoryAutoContinuity(value.autoContinuity),
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : now,
  }
}

export function normalizeStoryProjects(value: unknown): StoryProject[] {
  return Array.isArray(value) ? value.map((item) => normalizeStoryProject(item || {})) : []
}
