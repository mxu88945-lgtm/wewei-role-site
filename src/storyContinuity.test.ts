import { describe, expect, it } from 'vitest'
import { createStoryProject } from './storyProject'
import { buildAutomaticContinuityInput, captureAssistantMessageIds, hasUnprocessedAssistantMessages, mergeAutomaticContinuity, parseAutomaticContinuityResponse } from './storyContinuity'

const conversations = [{
  id: 'chat-one', title: '画展', messages: [
    { id: 10, role: 'user' as const, text: '江黎姿把架构图交给侦探。' },
    { id: 11, role: 'assistant' as const, characterId: 'lu', text: '陆景澄答应等她的消息。' },
  ],
}]

describe('automatic story continuity', () => {
  it('detects only assistant replies newer than the saved checkpoint', () => {
    const project = { ...createStoryProject(1), conversationIds: ['chat-one'] }
    expect(captureAssistantMessageIds(project, conversations)).toEqual({ 'chat-one': 11 })
    expect(hasUnprocessedAssistantMessages(project, conversations)).toBe(true)
    project.autoContinuity.lastProcessedAssistantMessageIds = { 'chat-one': 11 }
    expect(hasUnprocessedAssistantMessages(project, conversations)).toBe(false)
  })

  it('treats message ids as cursors instead of numeric timestamps', () => {
    const outOfOrderIds = [{
      id: 'chat-one', title: '画展', messages: [
        { id: 9000, role: 'assistant' as const, characterId: 'lu', text: '上一轮。' },
        { id: 100, role: 'user' as const, text: '用户继续调查。' },
        { id: 101, role: 'assistant' as const, characterId: 'lu', text: '侦探送来了新材料。' },
      ],
    }]
    const project = { ...createStoryProject(1), conversationIds: ['chat-one'] }
    project.autoContinuity.lastProcessedAssistantMessageIds = { 'chat-one': 9000 }

    expect(hasUnprocessedAssistantMessages(project, outOfOrderIds)).toBe(true)
    const input = buildAutomaticContinuityInput({ project, conversations: outOfOrderIds, userName: '江黎姿', characters: [{ id: 'lu', name: '陆景澄' }] })
    expect(input).toContain('用户继续调查')
    expect(input).toContain('侦探送来了新材料')
    expect(input).not.toContain('上一轮。')
  })

  it('replays the current history when a saved cursor disappeared after a rewind', () => {
    const rewound = [{
      id: 'chat-one', title: '画展', messages: [
        { id: 20, role: 'user' as const, text: '改写后的选择。' },
        { id: 21, role: 'assistant' as const, characterId: 'lu', text: '从新分支继续。' },
      ],
    }]
    const project = { ...createStoryProject(1), conversationIds: ['chat-one'] }
    project.autoContinuity.lastProcessedAssistantMessageIds = { 'chat-one': 9999 }

    const input = buildAutomaticContinuityInput({ project, conversations: rewound, userName: '江黎姿', characters: [{ id: 'lu', name: '陆景澄' }] })
    expect(input).toContain('改写后的选择')
    expect(input).toContain('从新分支继续')
  })

  it('sends only incremental dialogue and protects the user protagonist', () => {
    const project = { ...createStoryProject(1), title: '落水真相', conversationIds: ['chat-one'] }
    project.autoContinuity.lastProcessedAssistantMessageIds = { 'chat-one': 9 }
    const input = buildAutomaticContinuityInput({ project, conversations, userName: '江黎姿', characters: [{ id: 'lu', name: '陆景澄' }] })
    expect(input).toContain('江黎姿把架构图交给侦探')
    expect(input).toContain('模型替她描写的心理')
    expect(input).toContain('consumedOpenHooks')
    expect(input).toContain('核心证据节点')
    expect(input).toContain('线索目标｜行动者与动作｜预计新增信息｜如何衔接下一节点')
    expect(input).toContain('角色反应、结束行程')
    expect(input).toContain('个人历史锚点，不代表全剧时间倒退')
    expect(input).toContain('指定事件')
    expect(input).toContain('plannedEventUpdates')
    expect(input).toContain('禁止修改标题、内容、触发条件')
  })

  it('does not feed a director reasoning leak into automatic continuity', () => {
    const project = { ...createStoryProject(1), conversationIds: ['chat-one'], directorCharacterId: 'director' }
    const leaked = [{ id: 'chat-one', title: '董事会', messages: [
      { id: 1, role: 'user' as const, text: '继续。' },
      { id: 2, role: 'assistant' as const, characterId: 'director', text: 'Jiang Lizhi (controlled by the user).\nThe narrator/director handles side characters and environment.' },
      { id: 3, role: 'assistant' as const, characterId: 'lu', text: '陆景澄递来了调查报告。' },
    ] }]
    const input = buildAutomaticContinuityInput({ project, conversations: leaked, userName: '江黎姿', characters: [{ id: 'lu', name: '陆景澄' }] })
    expect(input).not.toContain('controlled by the user')
    expect(input).not.toContain('side characters and environment')
    expect(input).toContain('陆景澄递来了调查报告')
  })

  it('consumes only an exact existing hook and permanently preserves completed events', () => {
    const existing = {
      ...createStoryProject(1).cockpit,
      currentTask: '等待侦探反馈',
      completedEvents: ['抵达画展'],
      openHooks: ['调查博远咨询', '参加慈善晚宴'],
    }
    const parsed = parseAutomaticContinuityResponse(JSON.stringify({
      changeSummary: '侦探已返回调查结果',
      consumedOpenHooks: ['调查博远咨询', '不存在的钩子'],
      cockpit: { currentTask: '核对资金流向', completedEvents: ['取得调查结果'], openHooks: ['追查幕后人物'] },
    }), [])
    const merged = mergeAutomaticContinuity(existing, parsed)
    expect(merged.completedEvents).toEqual(['抵达画展', '取得调查结果'])
    expect(merged.openHooks).toEqual(['参加慈善晚宴', '追查幕后人物'])
    expect(merged.currentTask).toBe('核对资金流向')
  })

  it('advances user-planned events without letting automatic continuity rewrite them', () => {
    const existing = {
      ...createStoryProject(1).cockpit,
      plannedEvents: [{ id: 'event-one', title: '董事会前夜', detail: '杨颖安排秘书转移旧档。', triggerCondition: '调查接近杨家。', status: 'pending' as const, progressNote: '' }],
    }
    const parsed = parseAutomaticContinuityResponse(JSON.stringify({
      changeSummary: '指定事件已经发生',
      plannedEventUpdates: [
        { id: 'event-one', status: 'completed', progressNote: '秘书已被拦下，旧档完成封存。', title: '恶意改名' },
        { id: 'unknown-event', status: 'completed', progressNote: '不存在' },
      ],
      cockpit: { completedEvents: [] },
    }), [])
    const merged = mergeAutomaticContinuity(existing, parsed)
    expect(merged.plannedEvents).toEqual([{ id: 'event-one', title: '董事会前夜', detail: '杨颖安排秘书转移旧档。', triggerCondition: '调查接近杨家。', status: 'completed', progressNote: '秘书已被拦下，旧档完成封存。' }])
    expect(merged.completedEvents).toContain('用户指定事件「董事会前夜」已完成')
  })

  it('never rolls a completed user-planned event backwards', () => {
    const existing = {
      ...createStoryProject(1).cockpit,
      plannedEvents: [{ id: 'event-one', title: '已结束事件', detail: '', triggerCondition: '', status: 'completed' as const, progressNote: '已结束' }],
    }
    const parsed = parseAutomaticContinuityResponse(JSON.stringify({ plannedEventUpdates: [{ id: 'event-one', status: 'active', progressNote: '错误回滚' }], cockpit: {} }), [])
    expect(mergeAutomaticContinuity(existing, parsed).plannedEvents[0]).toEqual(existing.plannedEvents[0])
  })

  it('never lets automatic continuity rewrite the user-confirmed core canon', () => {
    const existing = createStoryProject(1).cockpit
    existing.canon = { synopsis: '案件已经侦破', closedArcs: ['杨越、杨颖已经伏法'], currentArc: '结案后', openArcs: ['关系修复'] }
    const parsed = parseAutomaticContinuityResponse(JSON.stringify({ cockpit: { canon: { synopsis: '错误复活旧案', closedArcs: [], currentArc: '重新调查', openArcs: ['杨越身份曝光'] } } }), [])
    expect(mergeAutomaticContinuity(existing, parsed).canon).toEqual(existing.canon)
  })
})
