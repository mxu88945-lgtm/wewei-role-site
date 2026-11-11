import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { messageEditorSheetHeight } from './messageEditorSize'

describe('messageEditorSheetHeight (v204)', () => {
  it('fills most of the space above the keyboard', () => {
    const r = messageEditorSheetHeight(400, 844)
    expect(r.keyboard).toBe(true)
    expect(r.height).toBeGreaterThanOrEqual(330)
    expect(r.height).toBeLessThanOrEqual(400)
  })
  it('is about 70% of the screen with the keyboard closed', () => {
    const r = messageEditorSheetHeight(844, 844)
    expect(r.keyboard).toBe(false)
    expect(r.height / 844).toBeGreaterThan(0.68)
    expect(r.height / 844).toBeLessThan(0.76)
  })
  it('tall sheet lets the textarea fill it at 16px+ without backdrop-filter', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const tall = css.split('\n').filter((line) => line.includes('.message-editor-tall'))
    expect(tall.join('\n')).toMatch(/textarea \{[^}]*flex: 1 1 auto[^}]*font-size: 16px/)
    expect(tall.join('\n')).not.toContain('backdrop-filter')
  })
})
