import { describe, expect, it } from 'vitest'
import { LazyFrameBook, hasMediaElement } from './lazyFrames'

describe('v246 lazy beautified-card frames', () => {
  it('loads only cards that come near the screen', () => {
    const book = new LazyFrameBook(8)
    for (let i = 1; i <= 30; i++) book.add(i, false)
    expect(book.loadedCount()).toBe(0)
    for (let i = 27; i <= 30; i++) expect(book.update(i, true).load).toBe(true)
    expect(book.loadedCount()).toBe(4)
    expect(book.update(30, true).load).toBe(false)
  })

  it('keeps at most the cap loaded, unloading the least recently seen far cards', () => {
    const book = new LazyFrameBook(3)
    for (let i = 1; i <= 6; i++) book.add(i, false)
    for (let i = 1; i <= 3; i++) { book.update(i, true); book.update(i, false) }
    const { load, unload } = book.update(4, true)
    expect(load).toBe(true)
    expect(unload).toEqual([1])
    expect(book.loadedCount()).toBe(3)
  })

  it('never unloads near cards or cards with audio/video', () => {
    const book = new LazyFrameBook(1)
    book.add(1, true); book.add(2, false); book.add(3, false)
    book.update(1, true); book.update(1, false)
    book.update(2, true)
    const { unload } = book.update(3, true)
    expect(unload).toEqual([])
    expect(book.loadedCount()).toBe(3)
    expect(book.update(2, false).unload).toEqual([2])
  })

  it('detects media cards', () => {
    expect(hasMediaElement('<div><audio src="x"></audio></div>')).toBe(true)
    expect(hasMediaElement('<VIDEO controls>')).toBe(true)
    expect(hasMediaElement('<style>.a{}</style><div>hi</div>')).toBe(false)
  })
})
