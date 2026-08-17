import { describe, expect, it } from 'vitest'
import { enforceRelationshipStageFloor, extractRelationshipStage, highestRelationshipStage, relationshipStageLockInstruction, repairRelationshipStageHistory } from './relationshipStage'

const status = (stage: string) => `<gu_status><div>关系阶段</div><strong>${stage}</strong></gu_status>`

describe('relationship stage persistence', () => {
  it('reads the relationship stage from the final status area', () => {
    expect(extractRelationshipStage(status('阶段三·旧秩序裂缝'))).toBe(3)
  })

  it('clamps a regressed status to the established floor', () => {
    expect(enforceRelationshipStageFloor(status('阶段一·契约归位'), 3)).toContain('阶段三·旧秩序裂缝')
  })

  it('allows a later stage to advance', () => {
    expect(enforceRelationshipStageFloor(status('阶段四·认定与对等代价'), 3)).toBe(status('阶段四·认定与对等代价'))
  })

  it('repairs only regressions after the highest established stage', () => {
    const result = repairRelationshipStageHistory([
      { role: 'assistant', text: status('阶段一·契约归位') },
      { role: 'assistant', text: status('阶段三·旧秩序裂缝') },
      { role: 'assistant', text: status('阶段一·契约归位') },
    ])
    expect(result.messages[0].text).toContain('阶段一·契约归位')
    expect(result.messages[2].text).toContain('阶段三·旧秩序裂缝')
    expect(result.highest).toBe(3)
  })

  it('keeps another group character out of the lock', () => {
    const messages = [
      { role: 'assistant', characterId: 'gu', text: status('阶段三·旧秩序裂缝') },
      { role: 'assistant', characterId: 'shen', text: status('阶段五·重新选择') },
    ]
    expect(highestRelationshipStage(messages, 'gu')).toBe(3)
  })

  it('tells the model that conflict does not reset the stage', () => {
    expect(relationshipStageLockInstruction(3)).toContain('不得回退')
  })
})
