import { describe, expect, it } from 'vitest'
import { buildSharedTheaterBackground, createDirectorCharacter, createDirectorTemplateConfig } from './directorTemplate'

describe('built-in director template', () => {
  it('keeps private truths out of the shared theater background', () => {
    const config = { ...createDirectorTemplateConfig(), worldBackground: '公开世界', hiddenTruths: '只有导演知道的真相' }
    const shared = buildSharedTheaterBackground(config)
    expect(shared).toContain('公开世界')
    expect(shared).not.toContain('只有导演知道的真相')
  })

  it('creates a private worldbook with hard role boundaries', () => {
    const config = { ...createDirectorTemplateConfig(), hiddenTruths: '秘密证据', plotThreads: '阶段一不得动心' }
    const director = createDirectorCharacter(config, 'director-fixed')
    expect(director.id).toBe('director-fixed')
    expect(director.systemPrompt).toContain('禁止替用户写台词、动作、心理')
    expect(director.systemPrompt).toContain('禁止替它们说话、行动、思考')
    expect(director.systemPrompt).toContain('禁止续演已经结束或离开的旧场景')
    expect(director.postHistoryInstructions).toContain('输出前逐句核对主语')
    expect(director.characterBook?.entries.some((entry) => entry.content.includes('秘密证据'))).toBe(true)
    expect(director.characterBook?.entries.some((entry) => entry.content.includes('阶段一不得动心'))).toBe(true)
  })
})
