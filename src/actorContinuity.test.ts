import { describe, expect, it } from 'vitest'
import { findLatestActorContinuityAnchor, findLatestSceneContinuityAnchor, safeStatusSceneFactText } from './actorContinuity'

describe('group actor continuity', () => {
  it('restores only visible story text and ignores UI-only actor status', () => {
    const anchor = findLatestActorContinuityAnchor([
      { role: 'assistant', characterId: 'lead', text: '【裴成砚】\n餐聚结束，返回住所。<pei_status>关系进展：阶段一｜阶段锚点：2/3</pei_status>' },
      { role: 'assistant', characterId: 'second', text: '陆景澄与她继续走完画展剧情。' },
      { role: 'user', text: '@裴成砚' },
      { role: 'assistant', characterId: 'lead', text: '<pei_status>关系进展：阶段一｜错误重演餐聚｜阶段锚点：0/3</pei_status>' },
    ], 'lead', '裴成砚')

    expect(anchor).toContain('餐聚结束，返回住所')
    expect(anchor).not.toContain('错误重演餐聚')
    expect(anchor).not.toContain('关系进展')
    expect(anchor).not.toContain('阶段锚点')
    expect(anchor).not.toContain('陆景澄')
    expect(anchor).not.toContain('<pei_status>')
    expect(anchor).not.toContain('【裴成砚】')
  })
})

describe('group scene continuity', () => {
  it('builds one coherent anchor from the newest reply instead of splicing in an older event', () => {
    const anchor = findLatestSceneContinuityAnchor([
      { role: 'assistant', characterId: 'director', text: '<scene>周六 20:03｜A市·白安禾公寓楼下 → 晏承聿车内</scene>梁峥来电，汇报乔婉宁正在楼下等候。<director_status>当前外部事件：白安禾抵家后，晏承聿驾驶返程途中，助理梁峥来电报备</director_status>' },
      { role: 'assistant', characterId: 'lead', text: '<scene>周六 20:35｜A市·晏宅</scene>晏承聿已回到家中，吩咐梁峥去安排后续事项。<yan_status>时间：周六 20:35｜地点：A市·晏宅｜心理：冷静</yan_status>' },
    ])

    expect(anchor).toContain('周六 20:35')
    expect(anchor).toContain('晏承聿已回到家中')
    expect(anchor).toContain('A市·晏宅')
    expect(anchor).not.toContain('白安禾抵家后')
    expect(anchor).not.toContain('<director_status>')
    expect(anchor).not.toContain('<yan_status>')
    expect(anchor).not.toContain('心理：冷静')
  })

  it('keeps safe single-chat time and location without exposing private status fields', () => {
    const facts = safeStatusSceneFactText('<pei_status>时间：第二天 09:10｜地点：岚影科技顶层｜心理：想把她留下｜关系进展：阶段三｜当前事件：董事会刚结束</pei_status>')
    const anchor = findLatestSceneContinuityAnchor([
      { role: 'assistant', characterId: 'pei', text: '裴砚合上文件，抬眼看向她。<pei_status>时间：第二天 09:10｜地点：岚影科技顶层｜心理：想把她留下｜关系进展：阶段三｜当前事件：董事会刚结束</pei_status>' },
    ])

    expect(facts).toContain('第二天 09:10')
    expect(facts).toContain('岚影科技顶层')
    expect(facts).toContain('董事会刚结束')
    expect(facts).not.toContain('想把她留下')
    expect(facts).not.toContain('阶段三')
    expect(anchor).toContain('单聊与群聊共用')
    expect(anchor).toContain('最新时间：第二天 09:10')
    expect(anchor).toContain('最新地点：岚影科技顶层')
  })

  it('uses only the final status block in one reply instead of combining an older scene', () => {
    const facts = safeStatusSceneFactText([
      '<director_status>时间：昨晚｜地点：办公室｜当前事件：停电</director_status>',
      '<pei_status>心理：已经平静｜关系进展：阶段三</pei_status>',
    ].join('\n'))

    expect(facts).toBe('')
  })
})
