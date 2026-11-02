import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./theme-mistnote.css', import.meta.url), 'utf8')

describe('mist note theme', () => {
  it('keeps the user card on the right and every quote in its own bubble', () => {
    expect(css).toContain('.archive-mistnote.user { width: min(90%,430px); margin-left: auto; align-self: flex-end; }')
    expect(css).toContain('display: table; width: fit-content; max-width: 100%;')
    expect(css).toContain('.archive-mistnote.user .archive-heading { flex-direction: row-reverse; }')
  })
  it('gives prose breathing room instead of a dense block', () => {
    expect(css).toContain('margin: 0 0 1.18em; line-height: 2;')
  })
})
