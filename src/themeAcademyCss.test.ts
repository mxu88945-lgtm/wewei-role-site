import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dir = new URL('./', import.meta.url)
const archives = readFileSync(new URL('./theme-archives.css', import.meta.url), 'utf8')
const allCss = readdirSync(dir).filter(name => name.endsWith('.css')).map(name => readFileSync(new URL(name, dir), 'utf8')).join('\n')

const academyRules = (css: string) => css.split('\n').filter(line => /academy/.test(line))

describe('秋日批注 (academy) theme stays simple', () => {
  it('has no envelope or tape ornaments in any stylesheet', () => {
    const rules = academyRules(allCss)
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) expect(rule).not.toMatch(/envelope|tape|信封|胶带/i)
    expect(archives).not.toContain('.archive-academy::after')
    expect(archives).not.toContain('.archive-academy .archive-heading::before')
    expect(readdirSync(dir)).not.toContain('archive-envelope.svg')
  })
  it('keeps the polaroid portrait, name, grade circle and red rule', () => {
    expect(archives).toContain('.archive-academy .archive-portrait {')
    expect(archives).toContain('.archive-academy .archive-name {')
    expect(archives).toContain('.archive-academy .archive-grade {')
    expect(archives).toContain('border-bottom: 1px solid #b95c61')
    expect(archives).toContain('.archive-academy { margin: 72px auto 30px !important;')
  })
  it('does not touch the other archive themes', () => {
    for (const mode of ['vinyl', 'mobile', 'letter', 'mistnote', 'nightglow']) expect(allCss).toContain(`.archive-${mode}`)
  })
})
