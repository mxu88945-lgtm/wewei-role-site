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
})
