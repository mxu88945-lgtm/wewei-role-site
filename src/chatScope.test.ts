import { describe, expect, it } from 'vitest'
import { DEFAULT_IDENTITY, isChatScoped, legacyDefaultThemeId, pickGlobalIdentity, pickIdentity, pickThemeId, repairLeakedGlobalPersona } from './chatScope'

const zhou = { id: 'persona-default', name: '周惟惟', description: '默认' }
const ning = { id: 'p-ning', name: '宁梦曦', description: '虞山行' }
const identities = [zhou, ning]
const story = { id: 'c-yushan', personaId: 'p-ning', themePresetId: 'cream', updatedAt: 20 }
const phoneGroup = { id: 'g-phone', personaId: undefined, updatedAt: 30, phone: { bindings: {} } }

describe('isChatScoped', () => {
  it('is true on the chat page and on settings pages opened from it', () => {
    expect(isChatScoped('chat', [{ page: 'home' }])).toBe(true)
    expect(isChatScoped('appearance', [{ page: 'home' }, { page: 'chat' }])).toBe(true)
    expect(isChatScoped('memory-list', [{ page: 'chat' }, { page: 'memory' }])).toBe(true)
  })
  it('is false on home, 小手机 and the same pages reached from global settings', () => {
    expect(isChatScoped('home', [])).toBe(false)
    expect(isChatScoped('phone', [{ page: 'home' }])).toBe(false)
    expect(isChatScoped('appearance', [{ page: 'home' }, { page: 'more' }, { page: 'settings' }])).toBe(false)
    expect(isChatScoped('identity', [{ page: 'home' }, { page: 'more' }])).toBe(false)
    expect(isChatScoped('identity', [{ page: 'chat' }, { page: 'home' }, { page: 'more' }])).toBe(false)
    expect(isChatScoped('greeting-picker', [{ page: 'characters' }, { page: 'character-detail' }])).toBe(false)
  })
})

describe('pickIdentity', () => {
  it('uses the story persona only for its own conversation', () => {
    expect(pickIdentity(story, identities, 'persona-default').name).toBe('宁梦曦')
    expect(pickIdentity(undefined, identities, 'persona-default').name).toBe('周惟惟')
  })
  it('lets a phone chat with no persona of its own follow the global identity', () => {
    expect(pickIdentity(phoneGroup, identities, 'persona-default').name).toBe('周惟惟')
    expect(pickIdentity({ ...phoneGroup, personaId: 'p-ning' }, identities, 'persona-default').name).toBe('宁梦曦')
  })
  it('falls back from a missing global persona to the first identity, then to 周惟惟', () => {
    expect(pickGlobalIdentity(identities, 'gone').name).toBe('周惟惟')
    expect(pickGlobalIdentity([], 'gone')).toEqual(DEFAULT_IDENTITY)
    expect(pickIdentity({ id: 'x', personaId: 'deleted' }, identities, 'persona-default').name).toBe('周惟惟')
  })
})

describe('pickThemeId', () => {
  it('applies a bound story theme only inside its chat', () => {
    expect(pickThemeId(true, story, 'blue')).toBe('cream')
    expect(pickThemeId(false, story, 'blue')).toBe('blue')
  })
  it('uses the default for chats without their own theme and empty when nothing is set', () => {
    expect(pickThemeId(true, phoneGroup, 'blue')).toBe('blue')
    expect(pickThemeId(false, story, '')).toBe('')
  })
})

describe('legacyDefaultThemeId', () => {
  it('picks the newest themed story chat and ignores phone chats', () => {
    expect(legacyDefaultThemeId([story, { id: 'old', themePresetId: 'blue', updatedAt: 5 }, { ...phoneGroup, themePresetId: 'dark', updatedAt: 99 }])).toBe('cream')
    expect(legacyDefaultThemeId([])).toBe('')
  })
})

describe('repairLeakedGlobalPersona', () => {
  it('resets a story persona that leaked into the global persona and unstamps inherited phone chats', () => {
    const result = repairLeakedGlobalPersona([story, { ...phoneGroup, personaId: 'p-ning' }], identities, 'p-ning')
    expect(result?.activePersonaId).toBe('persona-default')
    expect(result?.conversations[0].personaId).toBe('p-ning')
    expect(result?.conversations[1].personaId).toBeUndefined()
  })
  it('unstamps a story-only persona from phone chats even when the global persona is already right', () => {
    const result = repairLeakedGlobalPersona([story, { ...phoneGroup, personaId: 'p-ning' }, { ...phoneGroup, id: 'g2', personaId: 'persona-default' }], identities, 'persona-default')
    expect(result?.activePersonaId).toBe('persona-default')
    expect(result?.conversations[1].personaId).toBeUndefined()
    expect(result?.conversations[2].personaId).toBe('persona-default')
  })
  it('leaves an already-global or story-unbound persona alone', () => {
    expect(repairLeakedGlobalPersona([story], identities, 'persona-default')).toBeNull()
    expect(repairLeakedGlobalPersona([{ ...story, personaId: 'persona-default' }], identities, 'p-ning')).toBeNull()
  })
})
