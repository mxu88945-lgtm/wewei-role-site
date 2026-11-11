import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./theme-letter.css', import.meta.url), 'utf8')

describe('mist letter theme', () => {
  it('keeps user cards on the right and quoted dialogue in a capsule', () => {
    expect(css).toContain('.theme-letter .archive-letter.user { width: min(88%,430px); margin-left: auto; align-self: flex-end; }')
    expect(css).toContain('.theme-letter .archive-letter.user .archive-portrait { margin-left: auto; margin-right: 0; }')
    expect(css).toContain('width: fit-content; max-width: 100%; margin-left: auto; margin-right: 0; text-align: left;')
    expect(css).toContain('.theme-letter .archive-letter .archive-body :is(.message-quote,.chat-quote)')
    expect(css).toContain('box-decoration-break: clone')
  })
})
