import { describe, expect, it } from 'vitest'
import { collageLayout, phoneAvatarSignature } from './groupAvatar'

describe('group avatar collage', () => {
  it('fills one, grids up to nine and centers the last row', () => {
    expect(collageLayout(1)).toEqual([{ x: 0, y: 0, size: 256 }])
    expect(collageLayout(4)).toHaveLength(4)
    const three = collageLayout(3)
    expect(three[2].x).toBeCloseTo((256 - three[2].size) / 2)
    expect(collageLayout(12)).toHaveLength(9)
  })
})

describe('phone avatar signature', () => {
  it('changes when a member avatar changes and stays short', () => {
    const a = 'data:image/jpeg;base64,' + 'A'.repeat(5000)
    const b = 'data:image/jpeg;base64,' + 'A'.repeat(4999) + 'B'
    expect(phoneAvatarSignature(a)).not.toBe(phoneAvatarSignature(b))
    expect(phoneAvatarSignature(a).length).toBeLessThan(100)
    expect(phoneAvatarSignature(undefined)).toBe('-')
  })
})
