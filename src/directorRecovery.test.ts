import { describe, expect, it } from 'vitest'
import { createDirectorCharacter, createDirectorTemplateConfig, saveDirectorLibraryCard } from './directorTemplate'
import { recoverConversationDirector } from './directorRecovery'
import { removeConversationParticipant, type Conversation } from './conversationLifecycle'

describe('legacy theater director binding recovery', () => {
  const config = { ...createDirectorTemplateConfig(), directorName: '共演厅·旁白导演', worldBackground: '公开世界', hiddenTruths: '秘密只给导演', npcRoster: '门卫', plotThreads: '第二阶段', temporaryPlot: '一通电话' }
  const director = createDirectorCharacter(config, 'legacy-director')
  const actor = { ...createDirectorCharacter(config, 'actor'), name: '虞山行', creator: '用户', tags: [], systemPrompt: '只演自己' }
  const group: Conversation = { id: 'old-theater', kind: 'group', characterId: actor.id, participantIds: [actor.id, director.id], title: '已有剧场', messages: [{ id: 1, role: 'assistant', characterId: director.id, text: '已发生的剧情' }], createdAt: 1, updatedAt: 2, contextSummary: '旧摘要', compressedUntil: 1, participantApiIds: { [director.id]: 'api' }, participantModelNames: { [director.id]: 'model' } }
  it('recognizes the existing member, restores config, and retains every history and card field', () => {
    const before = structuredClone(director)
    const recovered = recoverConversationDirector(group, [actor, director])
    expect(recovered.directorCharacterId).toBe(director.id)
    expect(recovered.directorConfig).toMatchObject({ directorName: director.name, worldBackground: '公开世界', hiddenTruths: '秘密只给导演', plotThreads: '第二阶段', temporaryPlot: '一通电话', apiId: 'api', modelName: 'model' })
    expect(recovered.messages).toBe(group.messages)
    expect(recovered.contextSummary).toBe(group.contextSummary)
    expect(recovered.compressedUntil).toBe(1)
    expect(recovered.updatedAt).toBe(group.updatedAt)
    expect(recovered.theaterWorldBackground).toBeUndefined()
    expect(director).toEqual(before)
    const saved = saveDirectorLibraryCard(director, recovered.directorConfig!)
    expect(saved.systemPrompt).toBe(director.systemPrompt)
    expect(saved.characterBook).toEqual(director.characterBook)
    expect(saved.regexScripts).toEqual(director.regexScripts)
    expect(recoverConversationDirector(recovered, [actor, director])).toBe(recovered)
  })
  it('does not re-add a removed director or select a card outside the group', () => {
    const recovered = recoverConversationDirector(group, [actor, director])
    const removed = removeConversationParticipant(recovered, director.id)!
    expect(recoverConversationDirector(removed, [actor, director])).toBe(removed)
    const unrelated = { ...group, participantIds: [actor.id] }
    expect(recoverConversationDirector(unrelated, [actor, director])).toBe(unrelated)
  })
  it('does not guess when several unbound directors exist, or overwrite a valid binding', () => {
    const other = { ...director, id: 'another-director' }
    const ambiguous = { ...group, participantIds: [actor.id, director.id, other.id] }
    expect(recoverConversationDirector(ambiguous, [actor, director, other])).toBe(ambiguous)
    const bound = { ...ambiguous, directorCharacterId: director.id, directorConfig: config }
    expect(recoverConversationDirector(bound, [actor, director, other])).toBe(bound)
  })
  it('recovers missing config on an explicitly bound director without replacing the card', () => {
    expect(recoverConversationDirector({ ...group, directorCharacterId: director.id }, [actor, director]).directorConfig?.hiddenTruths).toBe('秘密只给导演')
  })
})
