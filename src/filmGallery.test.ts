import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { addFilmImages, clampFilmIndex, exportFilmGalleries, filmGalleryGet, filmGallerySet, fitFilmSize, importFilmGalleries, moveFilmImage, nextFilmIndex, removeFilmImage, sanitizeFilmGalleries, type FilmImage } from './filmGallery'

const img = (id: string): FilmImage => ({ id, src: `data:image/jpeg;base64,${id}` })
const ids = (list: FilmImage[]) => list.map((item) => item.id).join('')

describe('film gallery list operations', () => {
  it('adds up to six images and reports the dropped ones', () => {
    const start = ['a', 'b', 'c', 'd'].map(img)
    const { list, dropped } = addFilmImages(start, ['e', 'f', 'g'].map(img))
    expect(ids(list)).toBe('abcdef')
    expect(dropped).toBe(1)
    expect(addFilmImages(list, [img('h')]).dropped).toBe(1)
  })

  it('removes and moves images left and right, ignoring moves past the ends', () => {
    const list = ['a', 'b', 'c'].map(img)
    expect(ids(removeFilmImage(list, 'b'))).toBe('ac')
    expect(ids(moveFilmImage(list, 'b', -1))).toBe('bac')
    expect(ids(moveFilmImage(list, 'b', 1))).toBe('acb')
    expect(moveFilmImage(list, 'a', -1)).toBe(list)
    expect(moveFilmImage(list, 'c', 1)).toBe(list)
    expect(moveFilmImage(list, 'zz', 1)).toBe(list)
    expect(ids(list)).toBe('abc')
  })

  it('cycles to the next image and clamps after deletions', () => {
    expect(nextFilmIndex(0, 3)).toBe(1)
    expect(nextFilmIndex(2, 3)).toBe(0)
    expect(nextFilmIndex(5, 3)).toBe(0)
    expect(nextFilmIndex(0, 1)).toBe(0)
    expect(nextFilmIndex(0, 0)).toBe(0)
    expect(clampFilmIndex(4, 2)).toBe(1)
    expect(clampFilmIndex(-1, 2)).toBe(0)
    expect(clampFilmIndex(3, 0)).toBe(0)
  })

  it('fits the longest side to 1200px without upscaling', () => {
    expect(fitFilmSize(4032, 3024)).toEqual({ width: 1200, height: 900 })
    expect(fitFilmSize(1000, 3000)).toEqual({ width: 400, height: 1200 })
    expect(fitFilmSize(800, 600)).toEqual({ width: 800, height: 600 })
    expect(fitFilmSize(0, 600)).toEqual({ width: 0, height: 0 })
  })

  it('sanitizes backup data', () => {
    const many = ['1', '2', '3', '4', '5', '6', '7'].map(img)
    expect(sanitizeFilmGalleries({ c1: many, c2: [{ id: 'x', src: 'javascript:alert(1)' }], c3: 'nope' })).toEqual({ c1: many.slice(0, 6) })
    expect(sanitizeFilmGalleries(null)).toEqual({})
  })
})

describe('film gallery storage', () => {
  it('stores per character, exports everything and imports a backup', async () => {
    await filmGallerySet('c1', [img('a'), img('b')])
    await filmGallerySet('c2', [img('z')])
    expect(ids(await filmGalleryGet('c1'))).toBe('ab')
    expect(await exportFilmGalleries()).toEqual({ c1: [img('a'), img('b')], c2: [img('z')] })
    await importFilmGalleries({ c1: [img('q')] })
    expect(ids(await filmGalleryGet('c1'))).toBe('q')
    expect(ids(await filmGalleryGet('c2'))).toBe('z')
    await filmGallerySet('c1', [])
    await filmGallerySet('c2', [])
    expect(await filmGalleryGet('c1')).toEqual([])
    expect(await exportFilmGalleries()).toEqual({})
  })
})
