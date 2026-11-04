import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./theme-nightglow.css', import.meta.url), 'utf8')

describe('nightglow theme', () => {
  it('puts the user identity top right and makes quotes dark red in Huiwen Mincho', () => {
    expect(css).toContain('.archive-nightglow.user .archive-heading { flex-direction: row-reverse; }')
    expect(css).toContain('color: #a8383c !important')
    expect(css).toContain('"Huiwen-mincho"')
    expect(css).toContain('background: #f6f1ee')
  })
  it('has one slowly flowing warm liquid layer behind the chat', () => {
    expect(css).toContain('.theme-nightglow.chat-canvas > .wallpaper-layers::after')
    expect(css).toContain('animation: ngFlow 26s')
  })
  it('keeps prose in separate paragraphs', () => {
    expect(css).toContain('margin: 0 0 1.15em; line-height: 2;')
  })
})
