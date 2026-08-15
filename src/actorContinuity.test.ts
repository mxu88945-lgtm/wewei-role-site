import { describe, expect, it } from 'vitest'
import { findLatestActorContinuityAnchor } from './actorContinuity'

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
