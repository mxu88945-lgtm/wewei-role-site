import { describe, it, expect } from 'vitest'
import { ensurePlotImageTags, usedPlotImages } from './plotImages'
const img = { id: 'a', name: '热搜图', dataUrl: 'data:image/png;base64,xx', width: 1, height: 1 } as any
describe('ensure', () => {
  it('inserts before photo line', () => {
    const out = ensurePlotImageTags('开头。\n\n照片里，她抱着孩子。\n\n结尾。\n<status>热搜</status>', [img], '配上热搜图，让他看见')
    expect(out).toContain('[配图:热搜图]\n\n照片里')
    expect(usedPlotImages(out, [img]).length).toBe(1)
  })
  it('keeps existing', () => {
    expect(ensurePlotImageTags('a\n[配图:热搜图]\nb', [img], '配上热搜图')).toBe('a\n[配图:热搜图]\nb')
  })
  it('no plot mention -> untouched', () => {
    expect(ensurePlotImageTags('abc', [{...img, name: ''}, {...img, id:'b', name:'x'}], '他接到电话')).toBe('abc')
  })
})
