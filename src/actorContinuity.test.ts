import { describe, expect, it } from 'vitest'
import { findLatestActorContinuityAnchor } from './actorContinuity'

describe('group actor continuity anchor', () => {
  it('restores only the selected actor latest completed state', () => {
    const anchor = findLatestActorContinuityAnchor([
      { role: 'assistant', characterId: 'lead', text: '【裴成砚】\n餐聚结束，返回住所。<pei_status>关系进展：阶段一｜阶段锚点：2/3</pei_status>' },
      { role: 'assistant', characterId: 'second', text: '陆景澄与她继续走完画展剧情。' },
      { role: 'user', text: '@裴成砚' },
      { role: 'assistant', characterId: 'lead', text: '<pei_status>关系进展：阶段一｜错误重演餐聚｜阶段锚点：0/3</pei_status>' },
    ], 'lead', '裴成砚')

    expect(anchor).toContain('错误重演餐聚')
    expect(anchor).toContain('已明确达到阶段锚点：2/3')
    expect(anchor).toContain('阶段锚点：2/3')
    expect(anchor).not.toContain('陆景澄')
    expect(anchor).not.toContain('<pei_status>')
    expect(anchor).not.toContain('【裴成砚】')
  })
})
