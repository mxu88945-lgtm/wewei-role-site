import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ARCHIVE_THEMES, messageThemeLayout } from './chatThemeLayout'
import { normalizePersonaAppearance } from './personaAppearance'

const file = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
const css = readdirSync(new URL('./', import.meta.url)).filter((name) => name.endsWith('.css')).map(file).join('\n')
const app = file('App.tsx')
const page = file('PersonaWindowPage.tsx')
const builtIn = [...app.matchAll(/\{ id: '([a-z]+)', name: '[^']+', mode: '([a-z]+)'/g)].map((match) => ({ id: match[1], mode: match[2] }))
/** Every selector (the part before `{`) of every rule. */
const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim())
const hasRule = (...parts: string[]) => selectors.some((selector) => parts.every((part) => selector.includes(part)))

describe('v207 人格窗口主题：每个主题都有实际样式', () => {
  it('lists every built-in theme and the persona store accepts each mode', () => {
    expect(builtIn.length).toBeGreaterThanOrEqual(16)
    for (const { id, mode } of builtIn) {
      const stored = normalizePersonaAppearance({ theme: { id, name: id, mode, baseColor: '#ffffff', textColor: '#333333', narrationColor: '#777777', quoteColor: '#aa3333' } })
      expect(stored?.theme?.mode, `persona can't store theme ${id}`).toBe(mode)
    }
  })

  it('maps each theme to a canvas class that the CSS styles', () => {
    for (const { mode } of builtIn) expect(hasRule(`.theme-${mode}`), `no CSS for .theme-${mode}`).toBe(true)
  })

  it('maps each theme to message markup that its CSS actually targets', () => {
    for (const { mode } of builtIn) {
      const bubble = messageThemeLayout(mode, 'bubble')
      if (bubble.archive) {
        expect(bubble.rowClass).toContain(`archive-row archive-${mode}`)
        expect(hasRule(`archive-${mode}`), `no CSS for archive-${mode}`).toBe(true)
        expect(bubble.paper).toBe(mode)
        expect(bubble.layout).toBe('flat')
      } else if (mode === 'paper' || mode === 'scrapbook') {
        expect(bubble.paper).toBe(mode === 'scrapbook' ? 'scrapbook' : true)
        expect(hasRule(`.theme-${mode}`, 'message-')).toBe(true)
      } else {
        // 其余主题的消息样式写在气泡上（主题自己的或默认的 .message-content-bubble）。
        expect(bubble.layout).toBe('bubble')
        expect(bubble.rowClass).toContain('message-layout-bubble')
        expect(hasRule(`.theme-${mode}`, 'message-content-bubble') || hasRule('.message-content-bubble')).toBe(true)
      }
    }
    expect(ARCHIVE_THEMES.every((mode) => builtIn.some((theme) => theme.mode === mode))).toBe(true)
  })

  it('the persona window renders messages through the shared mapping', () => {
    expect(page).toContain('messageThemeLayout(props.themeMode')
    expect(page).toContain('<ArchiveHeading')
    expect(page).toContain('paper={look.paper}')
    expect(page).not.toContain('message-layout-flat`}>')
    expect(app).toMatch(/<PersonaWindowPage[^\n]*themeMode=\{displayAppearance\.theme\.mode\}[^\n]*chatLayout=\{chatLayout\}/)
  })

  it('renders pudding as the named-avatar archive in story and persona windows', () => {
    const pudding = messageThemeLayout('pudding', 'bubble', 'user')
    expect(pudding.archive).toBe('pudding')
    expect(pudding.rowClass).toContain('archive-pudding')
    expect(hasRule('.archive-pudding', '.pudding-capsule')).toBe(true)
    expect(hasRule('.archive-pudding', '.pudding-letter-foot')).toBe(true)
    expect(hasRule('.archive-pudding', '.message-quote')).toBe(true)
  })

  it('v218 pudding: capsule above a letter in story, 小手机 and persona window, and never collapses', () => {
    expect(app).toContain("chatTheme === 'pudding' ? 'pudding'")
    expect(app).toContain('<PuddingCapsule')
    expect(page).toContain('<PuddingCapsule')
    expect(page).toContain('<PuddingLetter')
    const pudding = file('theme-pudding.css')
    expect(pudding).toMatch(/\.archive-row\.archive-pudding \{[^}]*align-items: stretch !important/)
    expect(pudding).toMatch(/\.pudding-capsule-copy \{[^}]*flex: 1 1 auto; min-width: 0/)
    expect(pudding).toMatch(/\.pudding-capsule-copy span \{[^}]*-webkit-line-clamp: 2;[^}]*white-space: normal;[^}]*font-size: 14px; line-height: 1.45/)
    expect(pudding).not.toContain('pudding-bone')
    expect(pudding).toContain('writing-mode: horizontal-tb')
    expect(pudding.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/backdrop-filter/)
    expect(file('ArchiveHeading.tsx')).not.toContain('ᓚ')
    const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
    expect(sw).toContain("['pudding-dog.svg']")
    expect(sw).not.toContain('pudding-bone')
  })
})
