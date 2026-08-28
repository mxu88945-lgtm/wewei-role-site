import { describe, expect, it } from 'vitest'
import { findLatestActorContinuityAnchor, findLatestGroupSceneAnchor } from './actorContinuity'

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
  it('keeps the newest scene and carries a compact director external event outside UI-only history', () => {
    const anchor = findLatestGroupSceneAnchor([
      { role: 'assistant', characterId: 'director', text: '<scene>周六 20:03｜A市·白安禾公寓楼下 → 晏承聿车内</scene>梁峥来电，汇报乔婉宁正在楼下等候。<director_status>当前外部事件：白安禾抵家后，晏承聿驾驶返程途中，助理梁峥来电报备</director_status>' },
      { role: 'assistant', characterId: 'lead', text: '<scene>周六 20:35｜A市·某私人茶室</scene>晏承聿已回到家中，吩咐梁峥去安排后续事项。<yan_status>心理：冷静</yan_status>' },
    ])

    expect(anchor).toContain('周六 20:35')
    expect(anchor).toContain('晏承聿已回到家中')
    expect(anchor).toContain('白安禾抵家后')
    expect(anchor).not.toContain('<director_status>')
    expect(anchor).not.toContain('<yan_status>')
  })
})
