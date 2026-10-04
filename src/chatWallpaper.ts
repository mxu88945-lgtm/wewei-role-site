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
