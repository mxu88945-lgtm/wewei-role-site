import { describe, expect, it } from 'vitest'
import { normalizeRegexPlacement, normalizeRegexPresentation, normalizeRegexScript } from './regexPolicy'

describe('角色卡正则展示策略', () => {
  it('让无背景的浅色正文跟随聊天文字颜色，同时保留深色面板的浅色字', () => {
    const source = '<div style="color:#d1d5db"><p style="font-size:1em;color:#e2e8f0">正文</p><section style="background:#0f172a;color:#cbd5e1">状态</section></div>'
    const result = normalizeRegexPresentation(source)

    expect(result).toContain('color:var(--chat-text-color, #000000)')
    expect(result).not.toContain('#d1d5db')
    expect(result).not.toContain('#e2e8f0')
    expect(result).toContain('background:#0f172a;color:#cbd5e1')
  })

  it('移除会锁住聊天页或执行脚本的展示陷阱', () => {
    const source = '<script>alert(1)</script><div style="position:fixed;inset:0;height:100vh;touch-action:none;color:white">正文</div>'
    const result = normalizeRegexPresentation(source)

    expect(result).not.toContain('<script>')
    expect(result).toContain('position:relative')
    expect(result).toContain('height:auto')
    expect(result).toContain('touch-action:pan-y')
    expect(result).toContain('color:var(--chat-text-color, #000000)')
    expect(result).not.toContain('inset:0')
  })

  it('把旧 placement 3 和不完整脚本统一成可运行的角色回复脚本', () => {
    expect(normalizeRegexPlacement([1, 3])).toEqual([2])
    const script = normalizeRegexScript({ scriptName: '旧卡气泡', findRegex: '/^([\\s\\S]+)$/', replaceString: '<div style="color:#e2e8f0">$1</div>', placement: [3] })

    expect(script.placement).toEqual([2])
    expect(script.runOnEdit).toBe(true)
    expect(script.trimStrings).toEqual([])
    expect(script.replaceString).toContain('var(--chat-text-color, #000000)')
  })
})
