import type { Character, LibraryRole } from './characterCard'
import type { Conversation } from './conversationLifecycle'
import type { StoryProject } from './storyProject'

export const LIBRARY_ROLE_LABELS: Record<LibraryRole, string> = {
  lead: '主角', standalone: '独立卡', npc: 'NPC', director: '导演',
}
const ROLE_ORDER: Record<LibraryRole | 'none', number> = { lead: 0, standalone: 1, npc: 2, director: 3, none: 4 }

export const UNGROUPED_KEY = '__ungrouped__'

/** The role shown on a card: what she set, else director cards are recognised automatically. */
export function effectiveLibraryRole(character: Character): LibraryRole | undefined {
  if (character.libraryRole) return character.libraryRole
  if (character.directorTemplateConfig) return 'director'
  return undefined
}

export type LibrarySection = { key: string; name: string; items: Character[] }

/** Named groups first (most cards first, then by name), ungrouped last; inside a group 主角 → 独立卡 → NPC → 导演. */
export function groupLibraryCharacters(characters: Character[]): LibrarySection[] {
  const byGroup = new Map<string, Character[]>()
  const ungrouped: Character[] = []
  for (const character of characters) {
    const group = character.libraryGroup?.trim()
    if (!group) { ungrouped.push(character); continue }
    byGroup.set(group, [...(byGroup.get(group) || []), character])
  }
  const sortItems = (items: Character[]) => items.map((item, index) => ({ item, index })).sort((a, b) => {
    const roleA = ROLE_ORDER[effectiveLibraryRole(a.item) || 'none']
    const roleB = ROLE_ORDER[effectiveLibraryRole(b.item) || 'none']
    return roleA - roleB || a.index - b.index
  }).map(({ item }) => item)
  const sections = [...byGroup.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .map(([name, items]) => ({ key: name, name, items: sortItems(items) }))
  if (ungrouped.length) sections.push({ key: UNGROUPED_KEY, name: '未分组', items: ungrouped })
  return sections
}

export function libraryGroupNames(characters: Character[]) {
  return [...new Set(characters.map((item) => item.libraryGroup?.trim()).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

/** Apply a group and/or role to the given ids. group '' clears the group; role null clears the role; undefined leaves it. */
export function assignLibraryGroup(characters: Character[], ids: string[], change: { group?: string; role?: LibraryRole | null }) {
  const wanted = new Set(ids)
  return characters.map((character) => {
    if (!wanted.has(character.id)) return character
    const next = { ...character }
    if (change.group !== undefined) {
      const group = change.group.trim().slice(0, 40)
      next.libraryGroup = group || undefined
      next.libraryGroupSource = group ? 'manual' : undefined
      next.libraryGroupOptOut = !group
    }
    if (change.role !== undefined) next.libraryRole = change.role || undefined
    return next
  })
}

/** Set a group's exact members (and optionally rename it). Cards dropped from the group become ungrouped. */
export function setLibraryGroupMembers(characters: Character[], original: string, name: string, memberIds: string[]): Character[] {
  const next = name.trim().slice(0, 40)
  const members = new Set(memberIds)
  return characters.map((character) => {
    const inOriginal = Boolean(original) && character.libraryGroup === original
    if (members.has(character.id)) return character.libraryGroup === next && character.libraryGroupSource === 'manual' && !character.libraryGroupOptOut
      ? character
      : { ...character, libraryGroup: next || undefined, libraryGroupSource: next ? 'manual' as const : undefined, libraryGroupOptOut: !next }
    if (inOriginal) return { ...character, libraryGroup: undefined, libraryGroupSource: undefined, libraryGroupOptOut: true, libraryRole: character.libraryRole }
    return character
  })
}

type AutoGroupHint = { group: string; priority: number; order: number; role?: LibraryRole }

const cleanGroupName = (value: string) => value.trim()
  .replace(/(?:\s*[·・]\s*新(?:对话|场次|会话))+\s*$/u, '')
  .slice(0, 40)

const conversationMemberIds = (conversation: Conversation) => [...new Set(
  conversation.kind === 'group'
    ? [...(conversation.participantIds || []), conversation.characterId, ...(conversation.directorCharacterId ? [conversation.directorCharacterId] : [])]
    : [conversation.characterId],
)].filter(Boolean)

/**
 * Fill only ungrouped / previously auto-grouped cards from durable story links.
 * Existing groups from older versions count as manual and always win. A manual
 * "不分组" opt-out also wins, so this helper can safely run after hydration.
 */
export function autoOrganizeLibraryCharacters(characters: Character[], projects: StoryProject[], conversations: Conversation[]) {
  const characterIds = new Set(characters.map((character) => character.id))
  const manualGroups = new Map(characters
    .filter((character) => character.libraryGroup && character.libraryGroupSource !== 'auto')
    .map((character) => [character.id, character.libraryGroup!] as const))
  const hints = new Map<string, AutoGroupHint[]>()
  let order = 0

  const relatedManualGroup = (ids: string[]) => {
    const groups = [...new Set(ids.map((id) => manualGroups.get(id)).filter(Boolean) as string[])]
    return groups.length === 1 ? groups[0] : ''
  }
  const add = (ids: string[], rawGroup: string, priority: number, directorId?: string) => {
    const validIds = [...new Set(ids)].filter((id) => characterIds.has(id))
    const group = cleanGroupName(relatedManualGroup(validIds) || rawGroup)
    if (!group) return
    const currentOrder = order++
    validIds.forEach((id) => hints.set(id, [...(hints.get(id) || []), {
      group,
      priority,
      order: currentOrder,
      ...(id === directorId ? { role: 'director' as const } : {}),
    }]))
  }

  projects.forEach((project) => {
    const ids = [...project.characterIds, ...(project.directorCharacterId ? [project.directorCharacterId] : [])]
    add(ids, project.title, project.status === 'active' ? 400 : 350, project.directorCharacterId)
  })

  conversations.forEach((conversation) => {
    const ids = conversationMemberIds(conversation)
    if (conversation.chatGroup?.trim()) {
      add(ids, conversation.chatGroup, 500, conversation.directorCharacterId)
      return
    }
    if (conversation.kind === 'group' && !conversation.phone) add(ids, conversation.title, 250, conversation.directorCharacterId)
  })

  let changed = false
  const next = characters.map((character) => {
    if (character.libraryGroupOptOut || (character.libraryGroup && character.libraryGroupSource !== 'auto')) return character
    const best = (hints.get(character.id) || []).sort((a, b) => b.priority - a.priority || b.order - a.order)[0]
    if (!best) return character
    const role = character.libraryRole || best.role
    if (character.libraryGroup === best.group && character.libraryGroupSource === 'auto' && character.libraryRole === role) return character
    changed = true
    return { ...character, libraryGroup: best.group, libraryGroupSource: 'auto' as const, libraryGroupOptOut: false, libraryRole: role }
  })
  return changed ? next : characters
}
