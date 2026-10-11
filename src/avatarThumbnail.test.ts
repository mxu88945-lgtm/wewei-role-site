import { describe, expect, it } from 'vitest'
import { AVATAR_THUMBNAIL_MIN_LENGTH, coverRect, loadAvatarThumbnail, needsAvatarThumbnail, peekAvatarThumbnail } from './avatarThumbnail'

const big = `data:image/png;base64,${'A'.repeat(AVATAR_THUMBNAIL_MIN_LENGTH + 10)}`
const small = 'data:image/jpeg;base64,/9j/AAAA'

describe('avatar thumbnails for the @ picker', () => {
  it('only shrinks large image data URLs', () => {
    expect(needsAvatarThumbnail(big)).toBe(true)
    expect(needsAvatarThumbnail(small)).toBe(false)
    expect(needsAvatarThumbnail('https://example.com/a.png')).toBe(false)
    expect(needsAvatarThumbnail(undefined)).toBe(false)
  })

  it('uses small avatars as they are and holds back large ones until a thumbnail is ready', async () => {
    expect(peekAvatarThumbnail(small)).toBe(small)
    expect(peekAvatarThumbnail('')).toBeUndefined()
    expect(peekAvatarThumbnail(big)).toBeUndefined()
    await expect(loadAvatarThumbnail(small)).resolves.toBe(small)
  })

  it('falls back to the original when it cannot make a thumbnail, and caches the answer', async () => {
    // No canvas / createImageBitmap in the test environment: the original is used.
    const result = await loadAvatarThumbnail(big)
    expect(result).toBe(big)
    expect(peekAvatarThumbnail(big)).toBe(big)
  })

  it('centre-crops into a square', () => {
    expect(coverRect(200, 100, 100)).toEqual({ x: -50, y: 0, width: 200, height: 100 })
    expect(coverRect(100, 400, 50)).toEqual({ x: 0, y: -75, width: 50, height: 200 })
  })
})
