import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatChatFontSize, normalizeChatFontSize, normalizePersonaAppearance } from './personaAppearance'

const file = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
/** [selector, declarations] for every plain rule. */
const rules = (css: string) => [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => [match[1].trim(), match[2]] as const)

describe('v227 聊天正文字号 0.5px steps', () => {
  it('snaps to 0.5 steps, clamps to 13–22 and keeps old integer values', () => {
    expect(normalizeChatFontSize(14)).toBe(14)
    expect(normalizeChatFontSize(17)).toBe(17)
    expect(normalizeChatFontSize(14.5)).toBe(14.5)
    expect(normalizeChatFontSize(14.26)).toBe(14.5)
    expect(normalizeChatFontSize(14.24)).toBe(14)
    expect(normalizeChatFontSize(15.75)).toBe(16)
    expect(normalizeChatFontSize(9)).toBe(13)
    expect(normalizeChatFontSize(40)).toBe(22)
    expect(normalizeChatFontSize('15.5')).toBe(15.5)
    expect(normalizeChatFontSize(NaN)).toBe(16)
    expect(normalizeChatFontSize(undefined, 15)).toBe(15)
  })

  it('shows half sizes as 14.5px and whole sizes as 14px', () => {
    expect(formatChatFontSize(14)).toBe('14px')
    expect(formatChatFontSize(14.5)).toBe('14.5px')
  })

  it('keeps half sizes in a persona appearance instead of rounding them away', () => {
    expect(normalizePersonaAppearance({ fontSize: 14.5 })).toEqual({ fontSize: 14.5 })
    expect(normalizePersonaAppearance({ fontSize: 16 })).toEqual({ fontSize: 16 })
    expect(normalizePersonaAppearance({ fontSize: 14.3 })).toEqual({ fontSize: 14.5 })
  })

  it('uses a 0.5 step on both chat font sliders', () => {
    expect(file('PersonaAppearanceSettings.tsx')).toContain("['fontSize', '聊天正文字号', CHAT_FONT_MIN, CHAT_FONT_MAX, CHAT_FONT_STEP]")
    expect(file('App.tsx')).toMatch(/label="聊天正文字号"[^>]*step=\{CHAT_FONT_STEP\}/)
  })
})

describe('v227 the 布丁来信 (dog) theme follows the 外观与文字 sliders', () => {
  const pudding = rules(file('theme-pudding.css')).filter(([selector]) => /pudding-(capsule|letter)|archive-pudding/.test(selector))

  it('has no hard-coded px font size or numeric weight on the message body', () => {
    const body = pudding.filter(([selector]) => /archive-body/.test(selector))
    expect(body.length).toBeGreaterThan(0)
    for (const [selector, declarations] of body) {
      expect(declarations, selector).not.toMatch(/font-size:\s*[\d.]+px/)
      expect(declarations, selector).not.toMatch(/font-weight:\s*\d/)
      expect(declarations, selector).not.toMatch(/(^|;)\s*font:/)
    }
  })

  it('scales the capsule and letter text with 界面字号 instead of fixed px', () => {
    for (const [selector, declarations] of pudding) {
      expect(declarations, selector).not.toMatch(/font-size:\s*[\d.]+px\s*(;|$|!)/)
      expect(declarations, selector).not.toMatch(/(^|;)\s*font:\s*\d+\s+[\d.]+px/)
    }
    expect(file('theme-pudding.css')).toContain('calc(26px * var(--ui-font-scale, 1))')
  })

  it('reads the chat size and weight variables for archive bodies (pudding included)', () => {
    const base = rules(file('theme-archives.css')).find(([selector]) => selector === '.archive-row .archive-body')
    expect(base?.[1]).toContain('font-size: var(--chat-font-size')
    expect(base?.[1]).toContain('font-weight: var(--ui-font-weight')
  })

  it('lets the capsule name keep its own scaled size instead of the generic 15px strong rule', () => {
    expect(file('runtime-enhancements.css')).toMatch(/:where\(h3, strong, b\)[^{]*:not\(\.pudding-capsule-name\)/)
  })

  it('makes the preview box use the chat font size (no inherit !important on the box itself)', () => {
    const preview = rules(file('runtime-enhancements.css')).filter(([selector]) => selector.split(',').map((part) => part.trim()).includes('.chat-font-preview'))
    expect(preview.length).toBe(1)
    expect(preview[0][1]).toContain('font-size: var(--chat-font-size, 16px) !important')
    expect(preview[0][1]).not.toContain('inherit')
    expect(file('PersonaAppearanceSettings.tsx')).toContain("'--chat-font-size': `${values.fontSize}px`")
  })
})
