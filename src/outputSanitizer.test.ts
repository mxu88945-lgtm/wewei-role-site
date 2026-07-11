import { describe, expect, it } from 'vitest'
import { sanitizeAssistantOutput } from './outputSanitizer'

describe('assistant prompt-leak sanitizer', () => {
  it('removes leaked status instructions and keeps the real formatted reply', () => {
    const leaked = '#注意：非常重要！你必须在每次输出后回复的末尾，严格按照参考状态栏输出。\n\n<plot>\n```\n⏰时间:2034年01月25日 21:00\n🗺️地点:H市\n```\n</plot>\n真正剧情'
    const result = sanitizeAssistantOutput(leaked)
    expect(result).not.toContain('500美元')
    expect(result).not.toContain('注意：非常重要')
    expect(result).toContain('<plot>')
    expect(result).toContain('真正剧情')
  })

  it('does not alter ordinary roleplay text', () => {
    expect(sanitizeAssistantOutput('他抬眼看向你。')).toBe('他抬眼看向你。')
  })
})
