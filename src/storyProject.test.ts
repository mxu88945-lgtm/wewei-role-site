import { describe, expect, it } from 'vitest'
import { createStoryProject, normalizeStoryProject, normalizeStoryProjects } from './storyProject'

describe('story projects', () => {
  it('creates an empty project without binding existing data', () => {
    const project = createStoryProject(123)
    expect(project.createdAt).toBe(123)
    expect(project.characterIds).toEqual([])
    expect(project.conversationIds).toEqual([])
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
  })

  it('ignores non-array storage values', () => {
    expect(normalizeStoryProjects({ broken: true })).toEqual([])
  })
})
