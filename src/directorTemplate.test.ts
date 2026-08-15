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
    expect(director.systemPrompt).toContain('权限优先级固定为：角色控制权')
    expect(director.systemPrompt).toContain('镜头语言描写在场用户主角或独立角色')
    expect(director.systemPrompt).toContain('禁止替用户新增台词')
    expect(director.systemPrompt).toContain('禁止替它们新增台词')
    expect(director.systemPrompt).toContain('不能成为你新编台词、有意图动作、心理、决定或关键反应的执行者')
    expect(director.systemPrompt).toContain('禁止续演已经结束或离开的旧场景')
    expect(director.postHistoryInstructions).toContain('输出前逐句核对主语')
    expect(director.characterBook?.entries.some((entry) => entry.content.includes('秘密证据'))).toBe(true)
    expect(director.characterBook?.entries.some((entry) => entry.content.includes('阶段一不得动心'))).toBe(true)
  })

  it('keeps a late-filled temporary plot instruction private to the director', () => {
    const config = {
      ...createDirectorTemplateConfig(),
      temporaryPlot: '让门外的匿名文件成为下一步线索，停在用户可以决定是否拆开的节点。',
    }
    const shared = buildSharedTheaterBackground(config)
    const director = createDirectorCharacter(config, 'director-temporary-plot')

    expect(shared).not.toContain('匿名文件成为下一步线索')
    expect(director.systemPrompt).toContain('临时剧情推进')
    expect(director.systemPrompt).toContain('匿名文件成为下一步线索')
    expect(director.systemPrompt).toContain('不是已经发生的事实')
    expect(director.characterBook?.entries.some((entry) => entry.content.includes('匿名文件成为下一步线索'))).toBe(true)
  })

  it('allows the temporary plot instruction to stay empty', () => {
    const director = createDirectorCharacter(createDirectorTemplateConfig(), 'director-empty-temporary-plot')
    expect(director.systemPrompt).toContain('当前未填写')
  })

  it('ships scene and director status beautification scripts', () => {
    const director = createDirectorCharacter(createDirectorTemplateConfig(), 'director-beautification')

    expect(director.regexScripts).toHaveLength(2)
    expect(director.regexScripts?.[0]).toMatchObject({
      id: 'builtin-director-scene',
      replaceString: '<div class="weijing-scene-strip">$1</div>',
      disabled: false,
    })
    expect(director.regexScripts?.[1]).toMatchObject({
      id: 'builtin-director-status',
      replaceString: '<div class="weijing-status-card">$1</div>',
      disabled: false,
    })
  })
})
