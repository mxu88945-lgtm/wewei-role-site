import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./story-composer.css', import.meta.url), 'utf8')
const pudding = readFileSync(new URL('./theme-pudding.css', import.meta.url), 'utf8')
const main = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')

describe('v223 main-story composer card', () => {
  it('lays the main-story composer out as one rounded card: full-width input on top, tools / ＋ / send pill below', () => {
    expect(css).toMatch(/\.chat-page:not\(\.phone-chat\) > \.composer:not\(\.persona-composer\) \{[^}]*grid-template-areas: "thumbs thumbs thumbs" "quote quote quote" "input input input" "tools plus send";[^}]*border-radius: 28px !important/)
    expect(css).toMatch(/> \.send-button \{[^}]*grid-area: send;[^}]*border-radius: 999px !important/)
    expect(css).toMatch(/> \.composer-expand \{[^}]*grid-area: input;[^}]*justify-self: start; align-self: start;[^}]*width: 32px; height: 32px;/)
    expect(css).not.toMatch(/backdrop-filter/)
  })
  it('loads after every theme so equal-weight theme rules cannot undo the layout', () => {
    expect(main.indexOf("import './story-composer.css'")).toBeGreaterThan(main.indexOf("import './theme-archives.css'"))
  })
  it('keeps the pudding dog pinned to the first line of the main-story input', () => {
    expect(pudding).toMatch(/\.theme-pudding \.chat-page:not\(\.phone-chat\) > \.composer:not\(\.persona-composer\) > textarea \{ padding-left: 44px; background-position: 2px 0; \}/)
  })
  it('keeps the main composer controls (＋ tools, @ picker trigger, expand, send/stop) in the markup', () => {
    expect(app).toMatch(/<button className="composer-plus" aria-label="打开输入工具"/)
    expect(app).toMatch(/setMentionPickerOpen\(true\)/)
    expect(app).toMatch(/composerCanExpand && <button className="composer-expand"/)
    expect(app).toMatch(/className=\{`send-button \$\{isGenerating \? 'stop' : ''\}`\}/)
  })
  it('v224: expand key uses the corner icon (no ⛶), sits top-left and clears the text only while it shows', () => {
    expect(app).not.toContain('⛶')
    expect(app).toContain('<ExpandCornersIcon direction="out" size={20} />')
    expect(css).toMatch(/> \.composer\.can-expand:not\(\.persona-composer\) > textarea \{ padding-left: 40px;/)
    expect(css).toMatch(/\.theme-pudding [^{]*> \.composer\.can-expand:not\(\.persona-composer\) > textarea \{ padding-left: 44px; \}/)
  })
})
