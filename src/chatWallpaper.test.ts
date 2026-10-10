import { afterEach, describe, expect, it, vi } from 'vitest'
import { migrateLegacyWallpaper, mixHex, normalizeWallpaper, normalizeWallpapers, readWallpaperImage, WallpaperUploadTickets, wallpaperImage, wallpaperScopeKey, wallpaperTopColor } from './chatWallpaper'
const photo = 'data:image/jpeg;base64,photo'
afterEach(() => vi.unstubAllGlobals())

describe('independent chat wallpapers', () => {
  it('binds single windows to stable character IDs and groups to their own conversation IDs', () => {
    const single = { id: 'first-window', characterId: 'a' }
    expect(wallpaperScopeKey(single, 'b')).toBe('character:a')
    expect(wallpaperScopeKey({ ...single, id: 'other-window' }, 'b')).toBe('character:a')
    expect(wallpaperScopeKey(undefined, 'b')).toBe('character:b')
    const group = { ...single, id: 'group-1', kind: 'group' as const }
    expect(wallpaperScopeKey(group, 'a')).toBe('conversation:group-1')
    expect(wallpaperScopeKey({ ...group, characterId: 'b' }, 'b')).toBe('conversation:group-1')
    expect(wallpaperScopeKey({ ...group, id: 'group-2' }, 'a')).toBe('conversation:group-2')
  })
  it('migrates the former global image once to one active role or group only', () => {
    const migrated = migrateLegacyWallpaper(undefined, photo, 'conversation:group', .72)
    expect(Object.keys(migrated)).toEqual(['conversation:group'])
    expect(migrated['conversation:group']).toMatchObject({ image: photo, source: 'image', imageOpacity: 1, color: '#ffffff', colorOpacity: .72 })
    expect(migrated['character:a']).toBeUndefined()
    expect(migrateLegacyWallpaper({}, photo, 'character:a', .72)).toEqual({})
    expect(migrateLegacyWallpaper(undefined, '', 'character:a', .72)).toEqual({})
    const existing = { 'character:b': normalizeWallpaper({ source: 'avatar', enabled: false }) }
    expect(migrateLegacyWallpaper(existing, photo, 'character:a', .72)).toEqual(existing)
  })
  it('keeps disabled photos/settings and always resolves the current avatar dynamically', () => {
    const wallpaper = normalizeWallpaper({ image: photo, source: 'avatar', imageOpacity: .4, color: '#123456', colorOpacity: 0 })
    expect(wallpaperImage(wallpaper, 'avatar-old')).toBe('avatar-old')
    expect(wallpaperImage(wallpaper, 'avatar-new')).toBe('avatar-new')
    expect(wallpaperImage(wallpaper)).toBe('')
    const disabled = { ...wallpaper, enabled: false }
    expect(wallpaperImage(disabled, 'avatar-new')).toBe('')
    expect(disabled.image).toBe(photo)
    expect(wallpaperImage({ ...wallpaper, source: 'image' })).toBe(photo)
    expect(wallpaperImage({ ...wallpaper, source: 'none' }, 'avatar-new')).toBe('')
  })
  it('preserves zero opacity, bounds malformed values and rejects non-image custom URLs', () => {
    expect(normalizeWallpaper({ imageOpacity: 0, colorOpacity: 0 })).toMatchObject({ imageOpacity: 0, colorOpacity: 0 })
    expect(normalizeWallpaper({ imageOpacity: 3, colorOpacity: -2, color: 'invalid', image: 'javascript:alert(1)', source: 'image' }, '#abcdef')).toMatchObject({ imageOpacity: 1, colorOpacity: 0, color: '#abcdef', image: '' })
    expect(normalizeWallpapers({ unrelated: {}, 'character:a': { source: 'image', image: photo }, 'character:b': null })).toEqual({ 'character:a': normalizeWallpaper({ source: 'image', image: photo }) })
    expect(normalizeWallpapers([])).toEqual({})
  })
  it('invalidates older decodes for the same scope without cancelling another role’s upload', () => {
    const tickets = new WallpaperUploadTickets()
    const first = tickets.begin('character:a')
    const other = tickets.begin('character:b')
    expect(tickets.isCurrent('character:a', first)).toBe(true)
    const newer = tickets.begin('character:a')
    expect(tickets.isCurrent('character:a', first)).toBe(false)
    expect(tickets.isCurrent('character:a', newer)).toBe(true)
    expect(tickets.isCurrent('character:b', other)).toBe(true)
    tickets.begin('character:a') // remove/reset/switch to avatar
    expect(tickets.isCurrent('character:a', newer)).toBe(false)
  })
  it('compresses oversized images and releases the decoded bitmap on success and failure', async () => {
    const close = vi.fn()
    const bitmap = { width: 3200, height: 2400, close }
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), toDataURL: vi.fn(() => photo) }
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    vi.stubGlobal('document', { createElement: () => canvas })
    expect(await readWallpaperImage(new File(['image'], 'image.png', { type: 'image/png' }))).toBe(photo)
    expect([canvas.width, canvas.height]).toEqual([1600, 1200])
    expect(close).toHaveBeenCalledOnce()
    canvas.getContext.mockReturnValueOnce(null as never)
    await expect(readWallpaperImage(new File(['image'], 'image.png', { type: 'image/png' }))).rejects.toThrow('无法处理图片')
    expect(close).toHaveBeenCalledTimes(2)
  })
})

describe('wallpaper top colour for the full-screen iOS top fade', () => {
  it('mixes hex colours linearly', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mixHex('#000000', '#ffffff', .5)).toBe('#808080')
  })
  it('uses the theme colour when the wallpaper is off and the base colour without an image sample', () => {
    const wallpaper = normalizeWallpaper({ enabled: false, color: '#112233' })
    expect(wallpaperTopColor(wallpaper, '#fff6dc', '#000000')).toBe('#fff6dc')
    expect(wallpaperTopColor({ ...wallpaper, enabled: true }, '#fff6dc')).toBe('#112233')
  })
  it('composites base, image and veil the way the wallpaper layers stack', () => {
    const wallpaper = normalizeWallpaper({ source: 'image', image: photo, color: '#ffffff', imageOpacity: 1, colorOpacity: .5 })
    expect(wallpaperTopColor(wallpaper, '#f5f1f8', '#000000')).toBe('#808080')
    expect(wallpaperTopColor({ ...wallpaper, colorOpacity: 0 }, '#f5f1f8', '#204060')).toBe('#204060')
  })
})
