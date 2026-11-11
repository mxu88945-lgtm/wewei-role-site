import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
const archives = read('theme-archives.css')
const scrapbook = read('theme-scrapbook.css')
const letter = read('theme-letter.css')

describe('v208 archive themes: her own messages sit on the right (main chat + 人格窗口)', () => {
  it('青橙唱片 mirrors the user card', () => {
    expect(archives).toContain('.archive-row.archive-vinyl.user { width: min(88%, 720px) !important; align-self: flex-end !important; margin-left: auto !important;')
    expect(archives).toContain('.archive-vinyl.user .archive-heading { flex-direction: row-reverse; text-align: right; }')
    expect(archives).toContain('.archive-vinyl.user .archive-body { text-align: right; }')
  })
  it('莓红剪贴簿 pushes user rows right and narrower, assistant stays centered', () => {
    expect(scrapbook).toContain('.theme-scrapbook .chat-page:not(.phone-chat) .message-row.user { width: min(88%, 720px); align-self: flex-end; align-items: flex-end; margin-left: auto;')
    expect(scrapbook).toContain('.message-row.user :is(.message-line-flat, .message-line-bubble, .message-bubble-column) { align-items: flex-end; }')
    expect(scrapbook).toMatch(/\.message-row \{\s*width: 100%;[^}]*align-self: center;/)
  })
  it('雾白来信: cover fills the card, avatar in flow above the name, user mirrored', () => {
    expect(letter).toContain('width: calc(100% + 30px); max-width: none; margin: -13px -15px 20px;')
    expect(letter).toContain('.theme-letter .archive-letter .archive-portrait { position: relative; z-index: 2; display: block; margin: -42px 0 0;')
    expect(letter).not.toMatch(/archive-letter \.archive-portrait \{[^}]*position: absolute/)
    expect(letter).toContain('.theme-letter .archive-letter.user .archive-portrait { margin-left: auto; margin-right: 0; }')
    expect(letter).toContain('.theme-letter .archive-letter.user { width: min(88%,430px); margin-left: auto; align-self: flex-end; }')
    expect(letter).toContain('linear-gradient(135deg,#d4dde1,#ece7e1 54%,#c7bdb4)')
  })
})
