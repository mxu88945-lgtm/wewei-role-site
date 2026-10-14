import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Vitest strips CSS imports (even ?raw), so read the stylesheets and index.html from disk.
const dir = new URL('./', import.meta.url)
const stylesheets = readdirSync(dir).filter((file) => file.endsWith('.css')).map((file) => readFileSync(new URL(file, dir), 'utf8'))
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('iOS standalone app height', () => {
  it('does not size the layout through an inherited or @property --app-h chain', () => {
    // Inherited: every keyboard frame restyled every message node (2ec61d3 fixed that).
    // Non-inherited @property + `inherit`: iOS WebKit did not propagate it, so the chat
    // kept its pre-keyboard height and the composer sat under the keyboard.
    for (const css of stylesheets.map(strip)) {
      expect(css).not.toMatch(/@property\s+--app-h/)
      expect(css).not.toMatch(/--app-h\s*:/)
      expect(css).not.toMatch(/var\(\s*--app-h\b/)
    }
    expect(indexHtml).not.toMatch(/setProperty\(\s*['"]--app-h/)
  })

  it('index.html writes the height inline on exactly the layout boxes', () => {
    expect(indexHtml).toMatch(/querySelectorAll\('\.app-shell, \.phone-canvas, \.composer-expanded-layer, \.metadata-full-page, \.library-sheet-layer, \.message-editor-layer, \.forum-sheet-layer'\)/)
    expect(indexHtml).toMatch(/document\.getElementById\('root'\)/)
    expect(indexHtml).toMatch(/box\.style\.height = value/)
    expect(indexHtml).toMatch(/window\.__weijingApplyAppHeight\s*=/)
  })
})

describe('message editor above the iOS keyboard', () => {
  it('pins the edit sheet to the visible area so the save button stays reachable', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(new URL('./pwa-fix.css', import.meta.url), 'utf8')
    expect(css).toContain('html[data-standalone] .message-editor-layer { bottom: auto; }')
    expect(css).toContain('html[data-standalone][data-kb] .message-editor-layer { align-items: flex-end;')
  })
})
