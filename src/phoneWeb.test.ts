import { describe, expect, it } from 'vitest'
import { buildWebNote, needsWebSearch } from './phoneWeb'

describe('phoneWeb', () => {
  it('detects search intent', () => {
    expect(needsWebSearch('今天潮州天气怎么样')).toBe(true)
    expect(needsWebSearch('你们帮我查下这部剧什么时候上映')).toBe(true)
    expect(needsWebSearch('哈哈哈哈')).toBe(false)
  })
  it('builds note', () => {
    const note = buildWebNote('某剧上映', '10月20日上映', [{ title: 'A', url: 'u', content: '内容' }])
    expect(note).toContain('【联网结果】')
    expect(note).toContain('10月20日上映')
    expect(buildWebNote('x', '', [])).toBe('')
  })
})
