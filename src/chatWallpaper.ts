export const WALLPAPERS_KEY = 'weijing.chatWallpapers'
export type ChatWallpaper = {
  enabled: boolean
  source: 'none' | 'avatar' | 'image'
  image: string
  imageOpacity: number
  color: string
  colorOpacity: number
}
export type ChatWallpapers = Record<string, ChatWallpaper>
type ChatScope = { id: string; characterId: string; kind?: 'single' | 'group' }
const unit = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback
const color = (value: unknown, fallback = '#f5f1f8') => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback

/** Stable IDs keep renamed/same-named roles separate; a group never borrows its lead's wallpaper. */
export function wallpaperScopeKey(conversation: ChatScope | undefined, characterId: string) {
  return conversation?.kind === 'group' ? `conversation:${conversation.id}` : `character:${conversation?.characterId || characterId}`
}

export function normalizeWallpaper(value: unknown, themeColor = '#f5f1f8'): ChatWallpaper {
  const input = value && typeof value === 'object' ? value as Partial<ChatWallpaper> : {}
  return {
    enabled: input.enabled !== false,
    source: input.source === 'avatar' || input.source === 'image' ? input.source : 'none',
    image: typeof input.image === 'string' && /^data:image\/(?:jpeg|png|webp|gif|avif);base64,/i.test(input.image) ? input.image : '',
    imageOpacity: unit(input.imageOpacity, 1),
    color: color(input.color, color(themeColor)),
    colorOpacity: unit(input.colorOpacity, .65),
  }
}

export function normalizeWallpapers(value: unknown): ChatWallpapers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => /^(?:character|conversation):.+/.test(key) && item && typeof item === 'object' && !Array.isArray(item)).map(([key, item]) => [key, normalizeWallpaper(item)]))
}

/** Migrate once, to one scope only. Even an empty new map is an intentional saved configuration. */
export function migrateLegacyWallpaper(existing: unknown, legacyImage: unknown, scopeKey: string, frost: unknown): ChatWallpapers {
  if (existing !== undefined) return normalizeWallpapers(existing)
  if (typeof legacyImage !== 'string' || !legacyImage) return {}
  const wallpaper = normalizeWallpaper({ source: 'image', image: legacyImage, color: '#ffffff', colorOpacity: unit(frost, .72) })
  return wallpaper.image ? { [scopeKey]: wallpaper } : {}
}

export function wallpaperImage(wallpaper: ChatWallpaper, avatar?: string) {
  if (!wallpaper.enabled) return ''
  return wallpaper.source === 'avatar' ? avatar || '' : wallpaper.source === 'image' ? wallpaper.image : ''
}

/** Each selection gets a ticket; switching sources or removing an image invalidates older decodes. */
export class WallpaperUploadTickets {
  private tickets = new Map<string, number>()
  begin(scope: string) { const ticket = (this.tickets.get(scope) || 0) + 1; this.tickets.set(scope, ticket); return ticket }
  isCurrent(scope: string, ticket: number) { return this.tickets.get(scope) === ticket }
}

/** Mobile image decode has an HTMLImageElement fallback; every resource is released. */
export async function readWallpaperImage(file: File, maxEdge = 1600) {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件。')
  let decoded: ImageBitmap | HTMLImageElement
  let cleanup: () => void
  try {
    if (typeof createImageBitmap !== 'function') throw new Error('bitmap unavailable')
    decoded = await createImageBitmap(file)
    const bitmap = decoded
    cleanup = () => bitmap.close()
  } catch {
    const url = URL.createObjectURL(file)
    const image = new Image()
    try {
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('这张图片无法读取，请换成 JPG、PNG 或 WebP。')); image.src = url })
    } catch (error) { URL.revokeObjectURL(url); throw error }
    decoded = image
    cleanup = () => URL.revokeObjectURL(url)
  }
  try {
    const width = decoded.width
    const height = decoded.height
    if (!width || !height) throw new Error('图片尺寸无效。')
    const scale = Math.min(1, maxEdge / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器无法处理图片，请刷新后重试。')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(decoded, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', .84)
  } finally { cleanup() }
}

const hexRgb = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16))
const rgbHex = (rgb: number[]) => `#${rgb.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`
/** Linear mix: amount 0 keeps `from`, 1 becomes `to`. */
export function mixHex(from: string, to: string, amount: number) {
  const a = hexRgb(color(from)), b = hexRgb(color(to)), t = unit(amount, 0)
  return rgbHex(a.map((value, index) => value * (1 - t) + b[index] * t))
}

/**
 * The colour the chat background shows along its top edge, composited the same
 * way WallpaperLayers stacks it (base colour → image at imageOpacity → colour
 * veil at colorOpacity). Feeds the iOS full-screen top fade and the root
 * background behind the notch. `imageTop` is the sampled top strip of the image;
 * without it the base colour stands in.
 */
export function wallpaperTopColor(wallpaper: ChatWallpaper, themeColor: string, imageTop?: string | null) {
  if (!wallpaper.enabled) return color(themeColor)
  if (!imageTop) return wallpaper.color
  return mixHex(mixHex(wallpaper.color, imageTop, wallpaper.imageOpacity), wallpaper.color, wallpaper.colorOpacity)
}

/** Average colour of the top strip of an image drawn with background-size: cover at `aspect` (width / height). */
export function sampleImageTopColor(src: string, aspect: number, strip = .06): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image()
    if (!/^(?:data|blob):/i.test(src)) image.crossOrigin = 'anonymous'
    image.onerror = () => resolve(null)
    image.onload = () => {
      try {
        let sw = image.naturalWidth, sh = image.naturalHeight, sx = 0, sy = 0
        if (!sw || !sh || !(aspect > 0)) return resolve(null)
        if (sw / sh > aspect) { const cropped = sh * aspect; sx = (sw - cropped) / 2; sw = cropped } else { const cropped = sw / aspect; sy = (sh - cropped) / 2; sh = cropped }
        const canvas = document.createElement('canvas')
        canvas.width = 32
        canvas.height = 8
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return resolve(null)
        context.drawImage(image, sx, sy, sw, Math.max(1, sh * strip), 0, 0, canvas.width, canvas.height)
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data
        const sum = [0, 0, 0]
        for (let index = 0; index < data.length; index += 4) { sum[0] += data[index]; sum[1] += data[index + 1]; sum[2] += data[index + 2] }
        const count = data.length / 4
        resolve(rgbHex(sum.map((value) => value / count)))
      } catch { resolve(null) } // tainted or undecodable image: caller keeps the base colour
    }
    image.src = src
  })
}
