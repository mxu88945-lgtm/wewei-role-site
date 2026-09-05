import { describe, expect, it } from 'vitest'
import { isFailedTransportAssistantMessage, modelVisibleMessageText, stripUiOnlyStatusBlocks } from './modelContext'

describe('model-only message context', () => {
  it('keeps public scene and story text while removing every supported status block', () => {
    const source = `<scene>机场｜16:48</scene>
陆星屹把行李箱拖回确认台。
<gts_status>隐藏信息边界：他不知道裴允茉的家世与寒砚的存在。</gts_status>
[director_status]受限线索：陆景衡喜欢裴允茉。[/director_status]
<lu_status>心理：已经看过后台剧本。</lu_status>`

    const visible = stripUiOnlyStatusBlocks(source)
    expect(visible).toContain('<scene>机场｜16:48</scene>')
    expect(visible).toContain('陆星屹把行李箱拖回确认台。')
    expect(visible).not.toContain('裴允茉的家世')
    expect(visible).not.toContain('陆景衡喜欢裴允茉')
    expect(visible).not.toContain('已经看过后台剧本')
    expect(visible).not.toMatch(/status/i)
  })

  it('removes a dangling generated status block without changing user text', () => {
    expect(stripUiOnlyStatusBlocks('正文。\n<status>隐藏内容')).toBe('正文。')
    expect(modelVisibleMessageText({ role: 'user', text: '我输入 <status> 只是普通文字。' })).toBe('我输入 <status> 只是普通文字。')
  })

  it('keeps failed transport placeholders out of future model context', () => {
    const failed = { role: 'assistant' as const, text: '(消息没送到： This request requires more credits, or fewer max_tokens. You requested up to 2048 tokens, but can only afford 1670.)' }
    expect(isFailedTransportAssistantMessage(failed)).toBe(true)
    expect(modelVisibleMessageText(failed)).toBe('')
    expect(isFailedTransportAssistantMessage({ role: 'user', text: failed.text })).toBe(false)
  })
})
