import { describe, expect, it } from 'vitest'
import { normalizeStoredCharacter } from './characterCard'
import { assignLibraryGroup, effectiveLibraryRole, groupLibraryCharacters, libraryGroupNames } from './characterLibraryGroups'

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
    expect(cleared[0]).toMatchObject({ libraryGroup: undefined, libraryRole: undefined })
    expect(cleared[1].libraryRole).toBe('npc')
  })
})
