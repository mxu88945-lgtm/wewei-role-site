import { describe, expect, it } from 'vitest'
import { createStoryProject } from './storyProject'
import { buildCockpitAssistantInput, buildStoryCanonAssistantInput, parseCockpitAssistantResponse, parseStoryCanonAssistantResponse } from './storyCockpitAssistant'

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

  it('rebuilds from retained dialogue without trusting the stale cockpit', () => {
    const project = { ...createStoryProject(1), title: '改写分支' }
    project.cockpit.completedEvents = ['已被撤回的求婚']
    project.autoContinuity.needsReview = true
    const input = buildCockpitAssistantInput({
      project, userName: '江黎姿', characters: [],
      conversations: [{ id: 'chat', title: '新分支', messages: [{ role: 'user', text: '江黎姿离开了餐厅。' }] }],
    })
    expect(input).toContain('不是事实来源')
    expect(input).toContain('AI 派生事实禁止作为重建依据')
    expect(input).not.toContain('已被撤回的求婚')
  })

  it('keeps manual relationship and planned-event anchors available while rebuilding facts', () => {
    const project = { ...createStoryProject(1), title: '改写分支' }
    project.cockpit.relationshipStage = '阶段二 · 动摇与追逐'
    project.cockpit.plannedEvents = [{ id: 'event-one', title: '董事会突袭', detail: '秘书转移档案', triggerCondition: '调查接近杨家', status: 'pending', progressNote: '' }]
    project.autoContinuity.needsReview = true
    const input = buildCockpitAssistantInput({ project, userName: '江黎姿', characters: [], conversations: [] })
    expect(input).toContain('阶段二 · 动摇与追逐')
    expect(input).toContain('董事会突袭')
    expect(input).toContain('关系阶段是当前起点，不是阶段锁')
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

  it('builds and parses a whole-story canon that distinguishes closed and open arcs', () => {
    const project = createStoryProject(1)
    project.cockpit.completedEvents = ['杨越和杨颖已经伏法']
    const input = buildStoryCanonAssistantInput({
      project, userName: '江黎姿', characters: [{ id: 'pei', name: '裴成砚' }],
      conversations: [{ id: 'chat', title: '结案', messages: [{ role: 'assistant', characterId: 'pei', text: '法院作出终审判决，案件正式结案。' }] }],
    })
    expect(input).toContain('必须识别逮捕、伏法、死亡、结案')
    expect(input).toContain('杨越和杨颖已经伏法')
    const canon = parseStoryCanonAssistantResponse('{"synopsis":"案件已结","closedArcs":["杨越与杨颖伏法","杨越与杨颖伏法"],"currentArc":"关系修复","openArcs":["裴成砚承担后果"]}')
    expect(canon.closedArcs).toEqual(['杨越与杨颖伏法'])
    expect(canon.currentArc).toBe('关系修复')
  })
})
