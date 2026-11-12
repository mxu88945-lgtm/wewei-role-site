import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PersonaTaskPin } from './PersonaTaskCards'
import type { PersonaTask } from './personaTasks'

const tap = (action: () => void) => ({ onPointerUp: () => action(), onClick: () => action() })
const task = (id: string, createdAt: number): PersonaTask => ({ id, text: `任务${id}`, createdAt, dueAt: createdAt + 60_000 })

describe('v222 persona task pins', () => {
  it('lists pending pins one under another, oldest first, collapsing past three into +N', () => {
    const html = renderToStaticMarkup(<PersonaTaskPin tasks={[task('c', 3), task('a', 1), task('d', 4), task('b', 2)]} tap={tap} onOpen={() => {}} onDone={() => {}} />)
    expect(html.match(/class="persona-task-pin( due)?"/g)).toHaveLength(3)
    expect(html.indexOf('任务a')).toBeLessThan(html.indexOf('任务b'))
    expect(html.indexOf('任务b')).toBeLessThan(html.indexOf('任务c'))
    expect(html).not.toContain('任务d')
    expect(html).toContain('+1 项')
  })
  it('stacks with a column layout instead of overlapping, and the input is one rounded card', () => {
    const css = readFileSync(new URL('./persona-window.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.persona-task-pins \{[^}]*position: absolute;[^}]*flex-direction: column;[^}]*gap: 8px;/)
    expect(css).not.toMatch(/\.persona-task-pin \{[^}]*position: absolute/)
    expect(css).toMatch(/grid-template-areas: "thumbs thumbs thumbs" "note note note" "input input input" "tools plus send"/)
    expect(css).toMatch(/border-radius: 28px !important/)
  })
})
