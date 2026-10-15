import { describe, expect, it } from 'vitest'
import { enabledPresetText, normalizePresetSections } from './presetConfig'

describe('preset sections', () => {
  it('将旧预设迁入 Main Prompt', () => {
    const sections = normalizePresetSections([], '旧预设内容')
    expect(sections[0]).toMatchObject({ name: 'Main Prompt', content: '旧预设内容', enabled: true, scope: 'story' })
  })

  it('按栏目顺序拼接且跳过停用栏目', () => {
    const text = enabledPresetText([
      { id: 'one', name: '第一条', content: '先执行', enabled: true, scope: 'story' },
      { id: 'two', name: '关闭条目', content: '不应出现', enabled: false, scope: 'story' },
      { id: 'three', name: '第三条', content: '后执行', enabled: true, scope: 'all' },
    ])
    expect(text).toBe('【第一条】\n先执行\n\n【第三条】\n后执行')
    expect(text).not.toContain('不应出现')
  })

  it('按剧情与小手机范围分别发送', () => {
    const sections = normalizePresetSections([
      { id: 'story', name: '剧情', content: '剧情内容', enabled: true, scope: 'story' },
      { id: 'phone', name: '小手机', content: '手机内容', enabled: true, scope: 'phone' },
      { id: 'all', name: '通用', content: '通用内容', enabled: true, scope: 'all' },
    ])
    expect(enabledPresetText(sections, 'story')).toContain('剧情内容')
    expect(enabledPresetText(sections, 'story')).not.toContain('手机内容')
    expect(enabledPresetText(sections, 'phone')).toContain('手机内容')
    expect(enabledPresetText(sections, 'phone')).not.toContain('剧情内容')
    expect(enabledPresetText(sections, 'story')).toContain('通用内容')
    expect(enabledPresetText(sections, 'phone')).toContain('通用内容')
  })

  it('旧栏目迁移后保持仅剧情，避免小手机行为突变', () => {
    const sections = normalizePresetSections([{ id: 'old', name: '旧栏目', content: '旧内容', enabled: true }])
    expect(sections[0].scope).toBe('story')
    expect(enabledPresetText(sections, 'phone')).toBe('')
  })
})
