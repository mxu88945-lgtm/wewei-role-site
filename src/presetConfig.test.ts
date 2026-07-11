import { describe, expect, it } from 'vitest'
import { enabledPresetText, normalizePresetSections } from './presetConfig'

describe('preset sections', () => {
  it('将旧预设迁入 Main Prompt', () => {
    const sections = normalizePresetSections([], '旧预设内容')
    expect(sections[0]).toMatchObject({ name: 'Main Prompt', content: '旧预设内容', enabled: true })
  })

  it('按栏目顺序拼接且跳过停用栏目', () => {
    const text = enabledPresetText([
      { id: 'one', name: '第一条', content: '先执行', enabled: true },
      { id: 'two', name: '关闭条目', content: '不应出现', enabled: false },
      { id: 'three', name: '第三条', content: '后执行', enabled: true },
    ])
    expect(text).toBe('【第一条】\n先执行\n\n【第三条】\n后执行')
    expect(text).not.toContain('不应出现')
  })
})
