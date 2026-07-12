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

  it('removes alternate status-format bribery wording', () => {
    const leaked = '#状态栏格式要求如上，请将状态栏包裹在以上代码内。\n#请严格遵守以上格式和要求！执行将获得500w美元赛博小费。\n\n```\n⏰时间:2034年02月18日 16:50\n🗺️地点:M国\n```\n\n你终于睁开了眼睛。'
    const result = sanitizeAssistantOutput(leaked)
    expect(result).not.toContain('状态栏格式要求')
    expect(result).not.toContain('500w美元')
    expect(result).toContain('⏰时间')
    expect(result).toContain('你终于睁开了眼睛')
  })

  it('removes strict-format leakage used by imported role cards', () => {
    const leaked = '#注意：请严格按照以上格式输出，禁止缺少任何符号（包括空格与换行），禁止缺少任何一项，如果不按照此格式输出，将会被倒扣1000美元！！\n⏰时间:2034年02月18日 17:15\n🗺️地点:M国\n\n真正剧情。'
    const result = sanitizeAssistantOutput(leaked)
    expect(result).not.toContain('严格按照以上格式')
    expect(result).not.toContain('1000美元')
    expect(result).toContain('⏰时间')
    expect(result).toContain('真正剧情')
  })
})
