import { describe, expect, it } from 'vitest'
import { createStoryCockpitDraft, createStoryProject, hasStoryCockpitContent, normalizeStoryCockpit, normalizeStoryProject, normalizeStoryProjects } from './storyProject'

describe('story projects', () => {
  it('creates an empty project without binding existing data', () => {
    const project = createStoryProject(123)
    expect(project.createdAt).toBe(123)
    expect(project.characterIds).toEqual([])
    expect(project.conversationIds).toEqual([])
    expect(project.cockpit.completedEvents).toEqual([])
    expect(project.cockpit.plannedEvents).toEqual([])
    expect(project.cockpit.canon.closedArcs).toEqual([])
    expect(project.version).toBe(1)
  })

  it('normalizes old or malformed project data safely', () => {
    const project = normalizeStoryProject({
      id: 'story-one',
      title: '第一幕',
      status: 'archived',
      characterIds: ['a', 'a', 'b'],
      conversationIds: ['chat-a'],
    })
    expect(project.characterIds).toEqual(['a', 'b'])
    expect(project.status).toBe('archived')
    expect(project.worldBackground).toBe('')
    expect(project.cockpit.presentCharacterIds).toEqual([])
  })

  it('persists the review gate for a rewritten history branch', () => {
    const project = normalizeStoryProject({ autoContinuity: { enabled: true, lastProcessedAssistantMessageIds: {}, needsReview: true } })
    expect(project.autoContinuity.needsReview).toBe(true)
  })

  it('opens the saved cockpit instead of an empty form during history review', () => {
    const project = createStoryProject(1)
    project.autoContinuity.needsReview = true
    project.cockpit.relationshipStage = '阶段二'
    project.cockpit.plannedEvents = [{ id: 'e', title: '必须保留', detail: '', triggerCondition: '', status: 'pending', progressNote: '' }]
    const draft = createStoryCockpitDraft(project)
    expect(draft.relationshipStage).toBe('阶段二')
    expect(draft.plannedEvents[0].title).toBe('必须保留')
  })

  it('preserves a previous cockpit snapshot for recovery', () => {
    const project = normalizeStoryProject({
      cockpitBackup: { ...createStoryProject(1).cockpit, relationshipStage: '阶段二', plannedEvents: [{ id: 'e', title: '突发事件', detail: '', triggerCondition: '', status: 'pending', progressNote: '' }] },
      cockpitBackupAt: 123,
    })
    expect(project.cockpitBackup?.relationshipStage).toBe('阶段二')
    expect(project.cockpitBackup?.plannedEvents[0].title).toBe('突发事件')
    expect(project.cockpitBackupAt).toBe(123)
    expect(hasStoryCockpitContent(project.cockpitBackup)).toBe(true)
  })

  it('keeps truth, knowledge boundaries, and hidden evidence separate', () => {
    const cockpit = normalizeStoryCockpit({
      completedEvents: ['落水者已获救', '落水者已获救'],
      evidence: [{ id: 'e1', title: '胎记', detail: '粉红色蝴蝶', visibility: 'hidden', knownByCharacterIds: ['director'] }],
      characterKnowledge: [{ characterId: 'pei', knownFacts: ['杨颖声称救人'], unknownFacts: ['真正救人者'], mistakenBeliefs: ['杨颖就是救命恩人'] }],
    })
    expect(cockpit.completedEvents).toEqual(['落水者已获救'])
    expect(cockpit.evidence[0].visibility).toBe('hidden')
    expect(cockpit.characterKnowledge[0].unknownFacts).toEqual(['真正救人者'])
    expect(cockpit.characterKnowledge[0].mistakenBeliefs).toEqual(['杨颖就是救命恩人'])
  })

  it('normalizes user-planned events without treating them as completed facts', () => {
    const cockpit = normalizeStoryCockpit({
      plannedEvents: [
        { id: 'future-one', title: '未来董事会', detail: '杨颖将采取行动。', triggerCondition: '调查接近杨家', status: 'active', progressNote: '条件已经出现' },
        { id: 'future-two', title: '旧格式事件', detail: '', triggerCondition: '', status: 'broken' as never, progressNote: '' },
      ],
    })
    expect(cockpit.plannedEvents[0].status).toBe('active')
    expect(cockpit.plannedEvents[1].status).toBe('pending')
    expect(cockpit.completedEvents).toEqual([])
  })

  it('normalizes the user-confirmed core story canon', () => {
    const cockpit = normalizeStoryCockpit({ canon: {
      synopsis: '案件已经侦破。',
      closedArcs: ['杨越伏法', '杨越伏法'],
      currentArc: '结案后的关系修复',
      openArcs: ['裴成砚承担后果'],
    } })
    expect(cockpit.canon.closedArcs).toEqual(['杨越伏法'])
    expect(cockpit.canon.currentArc).toBe('结案后的关系修复')
  })

  it('ignores non-array storage values', () => {
    expect(normalizeStoryProjects({ broken: true })).toEqual([])
  })
})
