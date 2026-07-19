import { describe, expect, it } from 'vitest'
import type { Character } from './characterCard'
import { createStoryProject } from './storyProject'
import { buildStoryProjectPrompt, selectConversationStoryProject } from './storyProjectPrompt'

const character = (id: string, name: string) => ({ id, name } as Character)

const project = () => ({
  ...createStoryProject(100),
  title: '落水真相',
  summary: '三年前救命恩人身份成谜。',
  worldBackground: '现代滨江商战背景。',
  characterIds: ['lead', 'second', 'director'],
  conversationIds: ['group-one'],
  directorCharacterId: 'director',
  cockpit: {
    currentTime: '回国第四天晚间',
    currentLocation: '白盒子画廊',
    presentCharacterIds: ['second'],
    relationshipStage: '察觉偏爱',
    currentTask: '追查博远咨询',
    completedEvents: ['画展试探已经结束'],
    openHooks: ['慈善晚宴尚未发生'],
    evidence: [
      { id: 'public', title: '联姻新闻', detail: '媒体已经公开报道', visibility: 'public' as const, knownByCharacterIds: ['lead', 'second'] },
      { id: 'hidden', title: '秘密转账', detail: '真正收款人是霍启铭', visibility: 'hidden' as const, knownByCharacterIds: ['director'] },
    ],
    characterKnowledge: [
      { characterId: 'second', knownFacts: ['江黎姿收到匿名消息'], unknownFacts: ['霍启铭正在调查他'], mistakenBeliefs: ['裴成砚已经完全放弃'] },
      { characterId: 'lead', knownFacts: ['董事会即将表决'], unknownFacts: [], mistakenBeliefs: [] },
    ],
    nextDirections: ['让私家侦探回报资金流向'],
    plannedEvents: [{
      id: 'event-board',
      title: '杨颖转移旧档案',
      detail: '杨颖确认调查接近自己后，安排秘书转移一份旧授权记录。',
      triggerCondition: '权限调查已经指向杨家外包团队。',
      status: 'pending' as const,
      progressNote: '',
    }],
  },
})

describe('story project prompt injection', () => {
  const characters = [character('lead', '裴成砚'), character('second', '陆景澄'), character('director', '旁白导演')]

  it('gives the director the complete cockpit and consumption rules', () => {
    const prompt = buildStoryProjectPrompt({ project: project(), speakerId: 'director', characters })
    expect(prompt).toContain('旁白导演专用')
    expect(prompt).toContain('用户与独立角色控制权 > 当前场景与知情边界 > 证据推进')
    expect(prompt).toContain('驾驶舱只提供状态、证据和目标，不授予导演扮演任何主角的权限')
    expect(prompt).toContain('都是禁演名单，但不是禁止入镜')
    expect(prompt).toContain('可见静态神态')
    expect(prompt).toContain('不得替他们新增任何台词')
    expect(prompt).toContain('画展试探已经结束')
    expect(prompt).toContain('慈善晚宴尚未发生')
    expect(prompt).toContain('真正收款人是霍启铭')
    expect(prompt).toContain('霍启铭正在调查他')
    expect(prompt).toContain('禁止重演')
    expect(prompt).toContain('离证据闭环最近的一个缺口')
    expect(prompt).toContain('每轮最多推进一个证据节点')
    expect(prompt).toContain('材料如何留存')
    expect(prompt).toContain('唯一有效的现在时场景锚点')
    expect(prompt).toContain('独立角色（全部禁止导演代演）：裴成砚、陆景澄')
    expect(prompt).toContain('当前明确在场的独立角色：陆景澄')
    expect(prompt).toContain('当前明确离场的独立角色：裴成砚')
    expect(prompt).toContain('整句删除')
    expect(prompt).toContain('指定事件')
    expect(prompt).toContain('杨颖转移旧档案')
    expect(prompt).toContain('条件未到就让剧情按现有因果正常发展')
    expect(prompt).toContain('只能搭建外部条件并停在其选择点')
  })

  it('gives an independent actor only its safe knowledge slice', () => {
    const prompt = buildStoryProjectPrompt({ project: project(), speakerId: 'second', characters })
    expect(prompt).toContain('陆景澄专用')
    expect(prompt).toContain('江黎姿收到匿名消息')
    expect(prompt).toContain('裴成砚已经完全放弃')
    expect(prompt).toContain('媒体已经公开报道')
    expect(prompt).not.toContain('真正收款人是霍启铭')
    expect(prompt).not.toContain('霍启铭正在调查他')
    expect(prompt).not.toContain('董事会即将表决')
    expect(prompt).not.toContain('慈善晚宴尚未发生')
    expect(prompt).not.toContain('让私家侦探回报资金流向')
    expect(prompt).not.toContain('unknownFacts')
    expect(prompt).not.toContain('mistakenBeliefs')
    expect(prompt).not.toContain('杨颖转移旧档案')
  })

  it('quarantines a stale cockpit after dialogue history is rewritten', () => {
    const stale = project()
    stale.autoContinuity.needsReview = true
    const prompt = buildStoryProjectPrompt({ project: stale, speakerId: 'director', characters })
    expect(prompt).toContain('驾驶舱暂停注入')
    expect(prompt).toContain('只依据最近对话')
    expect(prompt).not.toContain('真正收款人是霍启铭')
    expect(prompt).not.toContain('画展试探已经结束')
    expect(prompt).not.toContain('杨颖转移旧档案')
  })

  it('selects only the newest active project bound to a conversation', () => {
    const archived = { ...project(), id: 'archived', status: 'archived' as const, updatedAt: 999 }
    const old = { ...project(), id: 'old', updatedAt: 200 }
    const latest = { ...project(), id: 'latest', updatedAt: 300 }
    expect(selectConversationStoryProject([archived, old, latest], 'group-one')?.id).toBe('latest')
    expect(selectConversationStoryProject([latest], 'other')).toBeUndefined()
  })
})
