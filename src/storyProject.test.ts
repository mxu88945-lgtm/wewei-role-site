import { describe, expect, it } from 'vitest'
import { createStoryProject, normalizeStoryCockpit, normalizeStoryProject, normalizeStoryProjects } from './storyProject'

describe('story projects', () => {
  it('creates an empty project without binding existing data', () => {
    const project = createStoryProject(123)
    expect(project.createdAt).toBe(123)
    expect(project.characterIds).toEqual([])
    expect(project.conversationIds).toEqual([])
    expect(project.cockpit.completedEvents).toEqual([])
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

  it('ignores non-array storage values', () => {
    expect(normalizeStoryProjects({ broken: true })).toEqual([])
  })
})
