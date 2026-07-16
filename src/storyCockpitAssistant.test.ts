import { describe, expect, it } from 'vitest'
import { createStoryProject } from './storyProject'
import { buildCockpitAssistantInput, parseCockpitAssistantResponse } from './storyCockpitAssistant'

describe('story cockpit assistant', () => {
  it('builds input from project data and actual bound dialogue', () => {
    const project = { ...createStoryProject(1), title: '落水真相', summary: '隐藏真相逐步揭开' }
    const input = buildCockpitAssistantInput({
      project,
      userName: '江黎姿',
      characters: [{ id: 'pei', name: '裴成砚', description: '前期冷淡自欺' }],
      conversations: [{ id: 'chat', title: '画展', messages: [{ role: 'user', text: '江黎姿走进展厅。' }] }],
    })
    expect(input).toContain('江黎姿走进展厅')
    expect(input).toContain('不得虚构日期')
    expect(input).toContain('旁白导演是后台控制者')
    expect(input).toContain('离形成证据闭环最近的缺口')
    expect(input).toContain('线索目标｜行动者与动作｜预计新增信息｜如何衔接下一节点')
    expect(input).toContain('不得只写角色反应')
  })

  it('parses JSON while rejecting unknown or director-like ids outside the allowlist', () => {
    const result = parseCockpitAssistantResponse('```json\n{"currentTime":"第三天","presentCharacterIds":["pei","director","fake"],"evidence":[{"title":"胎记","visibility":"hidden","knownByCharacterIds":["pei","director"]}],"characterKnowledge":[{"characterId":"pei","knownFacts":["见过照片"]},{"characterId":"director","knownFacts":["全部真相"]}]}\n```', ['pei'])
    expect(result.presentCharacterIds).toEqual(['pei'])
    expect(result.evidence[0].knownByCharacterIds).toEqual(['pei'])
    expect(result.characterKnowledge.map((item) => item.characterId)).toEqual(['pei'])
  })

  it('reports malformed model output clearly', () => {
    expect(() => parseCockpitAssistantResponse('not json', ['pei'])).toThrow('可识别')
  })
})
