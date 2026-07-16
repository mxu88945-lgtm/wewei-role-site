export type StoryProjectStatus = 'active' | 'archived'

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
  createdAt: number
  updatedAt: number
}

const uniqueStrings = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())))]
  : []

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
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : now,
  }
}

export function normalizeStoryProjects(value: unknown): StoryProject[] {
  return Array.isArray(value) ? value.map((item) => normalizeStoryProject(item || {})) : []
}
