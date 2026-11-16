import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { messageThemeLayout } from './chatThemeLayout'

const css = readFileSync(new URL('./theme-greynote.css', import.meta.url), 'utf8')
const main = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8')

describe('v265 浅灰信笺 theme', () => {
  it('is wired as an archive theme and imported', () => {
    expect(messageThemeLayout('greynote', 'bubble').archive).toBe('greynote')
    expect(main).toContain("import './theme-greynote.css'")
  })
  it('stays plain: light grey canvas, white letter body, colour-only quotes, ringed avatar', () => {
    expect(css).toContain('background: #f1f1f0')
    expect(css).toContain('.theme-greynote .archive-greynote .archive-body { box-sizing: border-box')
    expect(css).toMatch(/message-quote,\.chat-quote\) \{ display: inline; margin: 0; padding: 0; border: 0;[^}]*background: none/)
    expect(css).toMatch(/\.archive-portrait \{[^}]*border: 1px solid #d6d5d3; border-radius: 50%; background: #fff/)
    expect(css).not.toMatch(/url\(|animation/)
  })
  it('scales the name with 界面字号 and puts the user on the right', () => {
    expect(css).toContain('font-size: calc(23px * var(--ui-font-scale, 1))')
    expect(css).toContain('.archive-greynote.user .archive-heading { flex-direction: row-reverse; }')
  })
})
