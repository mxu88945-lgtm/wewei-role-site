import { describe, expect, it } from 'vitest'
import { collageLayout } from './groupAvatar'

describe('group avatar collage', () => {
  it('fills one, grids up to nine and centers the last row', () => {
    expect(collageLayout(1)).toEqual([{ x: 0, y: 0, size: 256 }])
    expect(collageLayout(4)).toHaveLength(4)
    const three = collageLayout(3)
    expect(three[2].x).toBeCloseTo((256 - three[2].size) / 2)
    expect(collageLayout(12)).toHaveLength(9)
  })
})
