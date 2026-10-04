import { describe, expect, it } from 'vitest'
import { createDirectorCharacter, createDirectorTemplateConfig, instantiateLibraryDirector, saveDirectorLibraryCard } from './directorTemplate'
import { normalizeStoredCharacter } from './characterCard'
import { addConversationParticipant, removeConversationParticipant, type Conversation } from './conversationLifecycle'

describe('reusable director cards', () => {
  const config = { ...createDirectorTemplateConfig(), hiddenTruths: '秘密证据', npcRoster: '门卫', worldBackground: '现代都市', plotThreads: '等待线索' }
  it('preserves complete card material and survives source removal and reload', () => {
    const source = { ...createDirectorCharacter(config, 'theater-director'), avatar: 'data:image/png;base64,abc' }
    const saved = saveDirectorLibraryCard(source, config)
    expect(saved.id).not.toBe(source.id)
    expect(saved.creator).not.toBe(source.creator)
    expect(saved.avatar).toBe(source.avatar)
    expect(saved.systemPrompt).toBe(source.systemPrompt)
    expect(saved.characterBook).toEqual(source.characterBook)
    expect(saved.regexScripts).toEqual(source.regexScripts)
    const retained = [source, saved].filter((card) => card.id !== source.id)
    const reloaded = normalizeStoredCharacter(JSON.parse(JSON.stringify(retained[0])))
    expect(reloaded.directorTemplateConfig).toEqual(config)
    expect(reloaded.directorLibrarySourceId).toBe(source.id)
    expect(reloaded.systemPrompt).toContain('秘密证据')
    saved.characterBook!.entries[0].content = 'edited'
    expect(source.characterBook!.entries[0].content).not.toBe('edited')
  })
  it('updates the same saved copy without changing the original theater card', () => {
    const source = createDirectorCharacter(config, 'original')
    const saved = saveDirectorLibraryCard(source, config)
    const nextConfig = { ...config, hiddenTruths: '新秘密' }
    const updated = saveDirectorLibraryCard(createDirectorCharacter(nextConfig, source.id), nextConfig, saved)
    expect(updated.id).toBe(saved.id)
    expect(updated.systemPrompt).toContain('新秘密')
    expect(source.systemPrompt).not.toContain('新秘密')
  })
  it('gives each theater a separate instance and retains the library card after removal', () => {
    const saved = saveDirectorLibraryCard(createDirectorCharacter(config), config)
    const a = instantiateLibraryDirector(saved)
    const b = instantiateLibraryDirector(saved)
    expect(new Set([saved.id, a.id, b.id]).size).toBe(3)
    expect(a.creator).toBe('惟境内置导演模板')
    const source: Conversation = { id: 'chat', characterId: 'actor', title: '原剧场', messages: [{ id: 1, role: 'user', text: '既有剧情' }], createdAt: 1, updatedAt: 1 }
    const joined = { ...addConversationParticipant(source, a.id, { apiId: 'api', modelName: 'model' }), directorCharacterId: a.id, directorConfig: a.directorTemplateConfig }
    const removed = removeConversationParticipant(joined, a.id)!
    expect(removed.messages).toEqual(source.messages)
    expect(removed.directorCharacterId).toBeUndefined()
    expect(saved.directorTemplateConfig).toEqual(config)
    a.directorTemplateConfig!.hiddenTruths = '剧场 A 修改'
    expect(saved.directorTemplateConfig!.hiddenTruths).toBe('秘密证据')
    expect(b.directorTemplateConfig!.hiddenTruths).toBe('秘密证据')
  })
})
