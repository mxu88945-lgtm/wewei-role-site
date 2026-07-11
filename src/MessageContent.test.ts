import { describe, expect, it } from 'vitest'
import { normalizeMixedMarkup } from './MessageContent'

describe('character-card mixed markup', () => {
  it('renders Tavo-style plot fences, inline thoughts and paragraph spacing', () => {
    const result = normalizeMixedMarkup('<plot>\n```\n⏰时间:2034年01月09日 09:38\n🗺️地点:H市\n```\n</plot>\n\n*动作*与`心理`')

    expect(result).toContain('<div class="message-code-block">')
    expect(result).toContain('<span class="message-paragraph-break"></span>')
    expect(result).toContain('<em>动作</em>')
    expect(result).toContain('<span class="message-inline-code">心理</span>')
  })
})
