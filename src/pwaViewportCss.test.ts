import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Vitest strips CSS imports (even ?raw), so read the stylesheets from disk.
const dir = new URL('./', import.meta.url)
const stylesheets = readdirSync(dir).filter((file) => file.endsWith('.css')).map((file) => readFileSync(new URL(file, dir), 'utf8'))
const pwaCss = readFileSync(new URL('pwa-fix.css', dir), 'utf8')

/** Selectors of every rule whose declarations use var(--app-h …). */
function appHeightConsumers(css: string) {
  const out: string[] = []
  const rule = /([^{}]+)\{([^{}]*)\}/g
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(rule)) {
    if (/var\(\s*--app-h\b/.test(match[2])) out.push(...match[1].split(',').map((selector) => selector.trim()).filter(Boolean))
  }
  return out
}

describe('iOS standalone --app-h does not restyle the whole page', () => {
  it('registers --app-h as a non-inherited custom property', () => {
    expect(pwaCss).toMatch(/@property\s+--app-h\s*\{[^}]*inherits:\s*false/)
  })

  it('passes --app-h only down the chain of layout boxes that size themselves with it', () => {
    const inheritRule = pwaCss.match(/([^{}]+)\{\s*--app-h:\s*inherit;\s*\}/)
    expect(inheritRule).toBeTruthy()
    const chain = new Set(inheritRule![1].split(',').map((selector: string) => selector.trim().replace(/^html\[data-standalone\]\s*/, '')))
    const consumers = stylesheets.flatMap((css) => appHeightConsumers(css))
    expect(consumers.length).toBeGreaterThan(0)
    for (const selector of consumers) {
      const target = selector.replace(/^html\[data-standalone\]\s*/, '').split(/\s+/).pop() || ''
      // <html> itself holds the value; everything else must opt in explicitly.
      if (target === '' || selector === 'html[data-standalone]') continue
      expect([...chain].some((link) => target.endsWith(link)), `${selector} reads --app-h but does not inherit it`).toBe(true)
    }
  })
})
