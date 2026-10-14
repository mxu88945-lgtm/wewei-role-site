import type { Character, LibraryRole } from './characterCard'

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
    if (change.group !== undefined) next.libraryGroup = change.group.trim().slice(0, 40) || undefined
    if (change.role !== undefined) next.libraryRole = change.role || undefined
    return next
  })
}

/** Set a group's exact members (and optionally rename it). Cards dropped from the group become ungrouped. */
export function setLibraryGroupMembers(characters: Character[], original: string, name: string, memberIds: string[]) {
  const next = name.trim().slice(0, 40)
  const members = new Set(memberIds)
  return characters.map((character) => {
    const inOriginal = Boolean(original) && character.libraryGroup === original
    if (members.has(character.id)) return character.libraryGroup === next ? character : { ...character, libraryGroup: next || undefined }
    if (inOriginal) return { ...character, libraryGroup: undefined, libraryRole: character.libraryRole }
    return character
  })
}
