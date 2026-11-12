import { describe, expect, it } from 'vitest'
import { composerOverflows, fitComposer, COMPOSER_MAX_HEIGHT } from './composerOverflow'

/** 模拟 textarea：clientHeight 跟着设置的高度走，但受 CSS max-height 限制。 */
function fakeTextarea(contentHeight: number, cssMaxHeight = COMPOSER_MAX_HEIGHT) {
  const el = {
    style: { height: '' },
    get scrollHeight() { return Math.max(contentHeight, this.clientHeight) },
    get clientHeight() {
      const px = parseFloat(el.style.height)
      return Number.isFinite(px) ? Math.min(px, cssMaxHeight) : Math.min(contentHeight, cssMaxHeight)
    },
    setContent(next: number) { contentHeight = next },
  }
  return el
}

describe('v224 长消息展开按钮：只在溢出时出现', () => {
  it('scrollHeight 超过 clientHeight 1px 以上才算溢出', () => {
    expect(composerOverflows(100, 100)).toBe(false)
    expect(composerOverflows(101, 100)).toBe(false)
    expect(composerOverflows(101.5, 100)).toBe(true)
    expect(composerOverflows(240, 180)).toBe(true)
  })

  it('短文本：长高但不溢出，按钮隐藏', () => {
    const el = fakeTextarea(40)
    expect(fitComposer(el)).toBe(false)
    expect(el.style.height).toBe('40px')
  })

  it('还没长到上限的多行文本也不显示（旧版超过 72px 就显示）', () => {
    const el = fakeTextarea(150)
    expect(fitComposer(el)).toBe(false)
    expect(el.style.height).toBe('150px')
  })

  it('长到上限后内容还要滚动，按钮出现', () => {
    const el = fakeTextarea(420)
    expect(fitComposer(el)).toBe(true)
    expect(el.style.height).toBe(`${COMPOSER_MAX_HEIGHT}px`)
  })

  it('发送后清空草稿，重新计算会隐藏按钮并缩回最小高度', () => {
    const el = fakeTextarea(420)
    expect(fitComposer(el)).toBe(true)
    el.setContent(20)
    expect(fitComposer(el)).toBe(false)
    expect(el.style.height).toBe('34px')
  })

  it('视口变窄让文字换行变多时，重新计算会显示按钮', () => {
    const el = fakeTextarea(170)
    expect(fitComposer(el)).toBe(false)
    el.setContent(230)
    expect(fitComposer(el)).toBe(true)
  })
})
