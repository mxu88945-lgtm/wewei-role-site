import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MessageContent, { normalizeMixedMarkup } from './MessageContent'
import { normalizeStoredCharacter } from './characterCard'

const css = readFileSync(new URL('./theme-warmtea.css', import.meta.url), 'utf8')
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')

describe('warm tea theme (暖茶笺)', () => {
  it('is registered after the default theme without replacing it', () => {
    expect(app).toContain("{ id: 'mist', name: '惟境紫雾', mode: 'mist'")
    expect(app).toContain("{ id: 'warmtea', name: '暖茶笺', mode: 'warmtea'")
    expect(app.indexOf("id: 'mist'")).toBeLessThan(app.indexOf("id: 'warmtea'"))
  })
  it('uses the cream palette, plain bubbles and a ringed round avatar', () => {
    expect(css).toContain('linear-gradient(180deg, #fbf4ea 0%, #f5e8d6 100%)')
    expect(css).toContain('background: #fffbf5; box-shadow: 0 2px 8px rgba(150,100,60,.08)')
    expect(css).toContain('linear-gradient(160deg,#f6e2cc,#efcfb0)')
    expect(css).toContain('0 0 0 2px #fbf4ea, 0 0 0 4px #e2b98a, 0 3px 10px rgba(194,122,69,.28)')
    expect(css).not.toMatch(/envelope|tape|sticker/i)
  })
  it('styles curved and corner quotes differently', () => {
    expect(css).toContain('linear-gradient(transparent 60%, rgba(232,177,120,.35) 60%)')
    expect(css).toContain('[data-quote="corner"]')
    expect(css).toContain('border-left: 2px solid #c27a45')
  })
})

describe('corner quote hook', () => {
  it('marks only 「」/『』 quotes and keeps the shared class', () => {
    const html = normalizeMixedMarkup('<div>“弯引号。”「角引号。」『双角引号。』</div>')
    expect(html.match(/class="message-quote"/g)).toHaveLength(3)
    expect(html.match(/data-quote="corner"/g)).toHaveLength(2)
    expect(html).toContain('<span class="message-quote">“弯引号。”</span>')
    const character = normalizeStoredCharacter({ id: 'quote-test', name: '测试角色' })
    const plain = renderToStaticMarkup(createElement(MessageContent, { text: '“你好。”「再见。」', role: 'assistant', character, userName: '用户', noStatus: true }))
    expect(plain).toContain('<span class="message-quote">“你好。”</span>')
    expect(plain).toContain('<span class="message-quote" data-quote="corner">「再见。」</span>')
  })
})
