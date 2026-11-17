import { describe, expect, it } from 'vitest'
import { splitPlotImages, usedPlotImages, withPlotImageParts } from './plotImages'
import { withFinalTemporaryPlotInstruction } from './temporaryPlot'

const pic = { id: 'a', dataUrl: 'data:image/jpeg;base64,AA', width: 10, height: 20, name: '热搜截图' }

describe('plot images', () => {
  it('finds used images by name, loosely', () => {
    expect(usedPlotImages('他点开热搜。\n[配图:「热搜截图」]\n评论炸了', [pic])).toEqual([pic])
    expect(usedPlotImages('[配图：别的]', [pic])).toEqual([])
  })
  it('splits text around the tag and hides unknown tags', () => {
    const pieces = splitPlotImages('前面[配图:热搜截图]后面[配图:不存在]', [pic])
    expect(pieces.map((p) => p.kind)).toEqual(['text', 'image', 'text'])
  })
  it('attaches pixels to the last user turn and keeps the plot system last', () => {
    const out = withFinalTemporaryPlotInstruction([{ role: 'system', content: 's' }, { role: 'user', content: 'hi' }], '发热搜', '谢聿衡', '惟惟', 'once', false, [pic])
    expect(out[out.length - 1].role).toBe('system')
    expect(String(out[out.length - 1].content)).toContain('热搜截图')
    expect(Array.isArray(out[1].content)).toBe(true)
  })
  it('adds a bridge user turn when the chat ends on an assistant turn', () => {
    const out = withPlotImageParts([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], [pic], '继续')
    expect(out[2].role).toBe('user')
  })
})
