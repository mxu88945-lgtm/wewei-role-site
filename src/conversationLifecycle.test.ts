import { describe, expect, it } from 'vitest'
import { addConversationParticipant, createFreshConversationFrom, removeConversationParticipant, restartConversationInPlace, type Conversation } from './conversationLifecycle'

describe('new conversation lifecycle', () => {
  it('creates a clean single-role conversation without changing the source history', () => {
    const source: Conversation = {
      id: 'old-chat', characterId: 'gu-huang', title: '与顾荒的对话',
      messages: [{ id: 1, role: 'assistant', text: '旧开场' }, { id: 2, role: 'user', text: '旧剧情' }],
      createdAt: 1, updatedAt: 2, contextSummary: '旧摘要', contextSummaryRevision: 3,
      compressedUntil: 20, historyRevision: 3, memorySummarizedCount: 18,
      personaId: 'persona-su-he', themePresetId: 'theme-snow', themeFrost: .68,
    }

    const fresh = createFreshConversationFrom(source, '新开场')

    expect(fresh.id).not.toBe(source.id)
    expect(fresh.title).toBe('与顾荒的对话 · 新对话')
    expect(fresh.messages).toEqual([{ id: fresh.createdAt, role: 'assistant', text: '新开场' }])
    expect(fresh.contextSummary).toBeUndefined()
    expect(fresh.compressedUntil).toBeUndefined()
    expect(fresh.historyRevision).toBe(0)
    expect(fresh.memorySummarizedCount).toBe(0)
    expect(fresh.personaId).toBe('persona-su-he')
    expect(fresh.themePresetId).toBe('theme-snow')
    expect(source.messages).toHaveLength(2)
    expect(source.contextSummary).toBe('旧摘要')
  })

  it('keeps group members and model bindings while starting with only the selected greeting', () => {
    const source: Conversation = {
      id: 'old-group', kind: 'group', characterId: 'lead', title: '南湾剧场 · 新对话',
      participantIds: ['lead', 'director'], participantApiIds: { lead: 'api-a', director: 'api-b' },
      participantModelNames: { lead: 'model-a', director: 'model-b' },
      messages: [{ id: 1, role: 'assistant', text: '旧剧情', characterId: 'lead' }],
      createdAt: 1, updatedAt: 2, personaId: 'persona-weiwei', directorCharacterId: 'director',
      directorConfig: { enabled: true } as Conversation['directorConfig'], theaterWorldBackground: '南湾世界背景',
    }

    const fresh = createFreshConversationFrom(source, '新的第一幕', 'lead')

    expect(fresh.title).toBe('南湾剧场 · 新对话')
    expect(fresh.messages).toEqual([{ id: fresh.createdAt, role: 'assistant', text: '新的第一幕', characterId: 'lead' }])
    expect(fresh.participantIds).toEqual(source.participantIds)
    expect(fresh.participantIds).not.toBe(source.participantIds)
    expect(fresh.participantApiIds).toEqual(source.participantApiIds)
    expect(fresh.participantApiIds).not.toBe(source.participantApiIds)
    expect(fresh.participantModelNames).toEqual(source.participantModelNames)
    expect(fresh.directorCharacterId).toBe('director')
    expect(fresh.theaterWorldBackground).toBe('南湾世界背景')
    expect(source.messages[0].text).toBe('旧剧情')
  })

  it('upgrades a single chat in place and attributes old assistant messages to its lead role', () => {
    const source: Conversation = {
      id: 'gu-huang-chat', characterId: 'gu-huang', title: '与顾荒的对话',
      messages: [{ id: 1, role: 'assistant', text: '旧剧情' }, { id: 2, role: 'user', text: '继续' }],
      createdAt: 1, updatedAt: 2, personaId: 'su-he', contextSummary: '保留摘要',
    }

    const upgraded = addConversationParticipant(source, 'director', { apiId: 'api-main', modelName: 'model-main' })

    expect(upgraded.id).toBe(source.id)
    expect(upgraded.kind).toBe('group')
    expect(upgraded.participantIds).toEqual(['gu-huang', 'director'])
    expect(upgraded.messages[0].characterId).toBe('gu-huang')
    expect(upgraded.messages[1].characterId).toBeUndefined()
    expect(upgraded.contextSummary).toBe('保留摘要')
    expect(source.messages[0].characterId).toBeUndefined()
  })

  it('removes one group member without touching the shared conversation history or memory-facing identity', () => {
    const source: Conversation = {
      id: 'preserved-group', kind: 'group', characterId: 'yu', title: '裴晏清、虞山行',
      participantIds: ['yu', 'pei', 'director'],
      participantApiIds: { yu: 'api-yu', pei: 'api-pei', director: 'api-director' },
      participantModelNames: { yu: 'gem-3.8', pei: 'claude', director: 'gem-3.8' },
      messages: [{ id: 1, role: 'assistant', text: '虞山行的旧回复', characterId: 'yu' }, { id: 2, role: 'user', text: '继续' }],
      createdAt: 1, updatedAt: 2, directorCharacterId: 'director', contextSummary: '已发生的剧情摘要', memorySummarizedCount: 2,
    }

    const detached = removeConversationParticipant(source, 'yu', '裴晏清')

    expect(detached).not.toBeNull()
    expect(detached?.id).toBe('preserved-group')
    expect(detached?.kind).toBe('group')
    expect(detached?.participantIds).toEqual(['pei', 'director'])
    expect(detached?.participantApiIds).toEqual({ pei: 'api-pei', director: 'api-director' })
    expect(detached?.messages).toEqual(source.messages)
    expect(detached?.contextSummary).toBe('已发生的剧情摘要')
    expect(detached?.memorySummarizedCount).toBe(2)
    expect(source.participantIds).toEqual(['yu', 'pei', 'director'])
  })

  it('restarts the current chat at its opening without changing its identity or settings', () => {
    const source: Conversation = {
      id: 'restart-me', characterId: 'pei', title: '与裴季野的对话',
      messages: [
        { id: 10, role: 'assistant', text: '原始开场' },
        { id: 11, role: 'user', text: '已经不想要的剧情' },
        { id: 12, role: 'assistant', text: '旧回复' },
      ],
      createdAt: 10, updatedAt: 12, personaId: 'persona-weiwei', themePresetId: 'mist',
      contextSummary: '旧摘要', contextSummaryRevision: 2, compressedUntil: 2,
      historyRevision: 2, memorySummarizedCount: 3, relationshipStages: { pei: 4 },
    }

    const restarted = restartConversationInPlace(source, '角色卡开场')

    expect(restarted.id).toBe(source.id)
    expect(restarted.title).toBe(source.title)
    expect(restarted.personaId).toBe(source.personaId)
    expect(restarted.themePresetId).toBe(source.themePresetId)
    expect(restarted.messages).toHaveLength(1)
    expect(restarted.messages[0].text).toBe('原始开场')
    expect(restarted.contextSummary).toBeUndefined()
    expect(restarted.compressedUntil).toBeUndefined()
    expect(restarted.historyRevision).toBe(3)
    expect(restarted.memorySummarizedCount).toBe(0)
    expect(restarted.relationshipStages).toBeUndefined()
    expect(source.messages).toHaveLength(3)
    expect(source.contextSummary).toBe('旧摘要')
  })

  it('uses the card greeting when a chat only contains a pending placeholder', () => {
    const source: Conversation = {
      id: 'pending-chat', characterId: 'lead', title: '新戏',
      messages: [{ id: 1, role: 'assistant', text: '正在回应…' }], createdAt: 1, updatedAt: 1,
    }

    const restarted = restartConversationInPlace(source, '卡片原始开场')

    expect(restarted.messages[0].text).toBe('卡片原始开场')
  })
})
