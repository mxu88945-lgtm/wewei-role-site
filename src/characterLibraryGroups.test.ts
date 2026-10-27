import { describe, expect, it } from 'vitest'
import { normalizeStoredCharacter } from './characterCard'
import { assignLibraryGroup, autoOrganizeLibraryCharacters, setLibraryGroupMembers, effectiveLibraryRole, groupLibraryCharacters, libraryGroupNames } from './characterLibraryGroups'
import { createStoryProject } from './storyProject'
import type { Conversation } from './conversationLifecycle'

const card = (id: string, extra: Record<string, unknown> = {}) => normalizeStoredCharacter({ id, name: id, ...extra })

describe('character library groups', () => {
  it('keeps group and role through normalisation and drops junk', () => {
    expect(card('a', { libraryGroup: ' 谢聿衡篇 ', libraryRole: 'npc' })).toMatchObject({ libraryGroup: '谢聿衡篇', libraryRole: 'npc' })
    expect(card('b', { libraryGroup: '  ', libraryRole: 'boss' })).toMatchObject({ libraryGroup: undefined, libraryRole: undefined })
  })

  it('groups by story, orders roles inside, ungrouped last', () => {
    const list = [
      card('导演', { libraryGroup: '谢聿衡篇', libraryRole: 'director' }),
      card('散卡'),
      card('苏苒', { libraryGroup: '谢聿衡篇', libraryRole: 'npc' }),
      card('谢聿衡', { libraryGroup: '谢聿衡篇', libraryRole: 'lead' }),
      card('顾', { libraryGroup: '另一篇' }),
    ]
    const sections = groupLibraryCharacters(list)
    expect(sections.map((s) => s.name)).toEqual(['另一篇', '谢聿衡篇', '未分组'])
    expect(sections[1].items.map((c) => c.name)).toEqual(['谢聿衡', '苏苒', '导演'])
    expect(libraryGroupNames(list)).toEqual(['另一篇', '谢聿衡篇'])
  })

  it('recognises director cards without a set role', () => {
    expect(effectiveLibraryRole(card('d', { directorTemplateConfig: { directorName: '导演' } }))).toBe('director')
  })

  it('moves several cards at once and can clear', () => {
    const list = [card('a'), card('b'), card('c')]
    const moved = assignLibraryGroup(list, ['a', 'b'], { group: '谢聿衡篇', role: 'npc' })
    expect(moved.map((c) => c.libraryGroup)).toEqual(['谢聿衡篇', '谢聿衡篇', undefined])
    const cleared = assignLibraryGroup(moved, ['a'], { group: '', role: null })
    expect(cleared[0]).toMatchObject({ libraryGroup: undefined, libraryRole: undefined, libraryGroupOptOut: true })
    expect(cleared[1].libraryRole).toBe('npc')
  })

  it('adds, removes and renames members of a group', () => {
    const list = [card('a', { libraryGroup: '谢篇' }), card('b', { libraryGroup: '谢篇' }), card('c'), card('d', { libraryGroup: '别篇' })]
    const next = setLibraryGroupMembers(list, '谢篇', '谢聿衡篇', ['a', 'c'])
    expect(next.map((c) => c.libraryGroup)).toEqual(['谢聿衡篇', undefined, '谢聿衡篇', '别篇'])
    expect(next[1].libraryGroupOptOut).toBe(true)
  })

  it('automatically groups unassigned cards from projects and keeps manual decisions', () => {
    const project = { ...createStoryProject(1), title: 'harbor story', status: 'active' as const, characterIds: ['lead', 'guard', 'director'], directorCharacterId: 'director' }
    const list = [card('lead', { libraryGroup: 'manual story' }), card('guard'), card('director', { directorTemplateConfig: { directorName: 'director' } }), card('free')]
    const next = autoOrganizeLibraryCharacters(list, [project], [])
    expect(next.find((item) => item.id === 'lead')?.libraryGroup).toBe('manual story')
    expect(next.find((item) => item.id === 'guard')).toMatchObject({ libraryGroup: 'manual story', libraryGroupSource: 'auto' })
    expect(next.find((item) => item.id === 'director')).toMatchObject({ libraryGroup: 'manual story', libraryRole: 'director' })
    expect(next.find((item) => item.id === 'free')?.libraryGroup).toBeUndefined()
  })

  it('uses explicit chat groups, ignores phone groups, and respects manual ungrouping', () => {
    const storyChat = { id: 'story', kind: 'group', characterId: 'a', participantIds: ['a', 'b'], title: 'stage', chatGroup: 'Pei story', messages: [], createdAt: 1, updatedAt: 1 } as Conversation
    const phoneChat = { id: 'phone', kind: 'group', characterId: 'c', participantIds: ['c', 'd'], title: 'phone', phone: { bindings: {} }, messages: [], createdAt: 1, updatedAt: 1 } as Conversation
    const list = [card('a'), card('b', { libraryGroupOptOut: true }), card('c'), card('d')]
    const next = autoOrganizeLibraryCharacters(list, [], [storyChat, phoneChat])
    expect(next.find((item) => item.id === 'a')?.libraryGroup).toBe('Pei story')
    expect(next.find((item) => item.id === 'b')?.libraryGroup).toBeUndefined()
    expect(next.find((item) => item.id === 'c')?.libraryGroup).toBeUndefined()
    expect(next.find((item) => item.id === 'd')?.libraryGroup).toBeUndefined()
  })
})
