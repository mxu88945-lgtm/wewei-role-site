import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./theme-nightglow.css', import.meta.url), 'utf8')

describe('nightglow theme', () => {
  it('puts the user identity top right and makes quotes glowing gradient text', () => {
    expect(css).toContain('.archive-nightglow.user .archive-heading { flex-direction: row-reverse; }')
    expect(css).toContain('-webkit-background-clip: text !important')
  })
  it('has one slowly flowing warm liquid layer behind the chat', () => {
    expect(css).toContain('.chat-canvas.theme-nightglow::before')
    expect(css).toContain('animation: ngFlow 26s')
  })
  it('keeps prose in separate paragraphs', () => {
    expect(css).toContain('margin: 0 0 1.15em; line-height: 2;')
  })
})
