/**
 * Small cached thumbnails for avatars shown in tight spots such as the @ mention
 * picker.
 *
 * Avatars are stored as data URLs. Ones made by the app's own upload paths are
 * already ~256-384 px JPEGs, but older data, backups and imported cards can carry
 * multi-megabyte originals. Mounting <img src="data:…3 MB…"> is synchronous main-
 * thread work (the string is copied into the DOM and parsed as a URL): with three
 * such avatars the picker took ~570 ms extra to appear at 6x CPU throttle. The
 * thumbnails are made off the critical path (fetch → createImageBitmap decodes off
 * the main thread) and cached by source string, so the picker only ever mounts a
 * few-KB image.
 */

/** Data URLs shorter than this (≈90 KB of image) are used as they are. */
export const AVATAR_THUMBNAIL_MIN_LENGTH = 120_000
/** Pixel size of the generated square thumbnail (48 px avatar at 3x). */
export const AVATAR_THUMBNAIL_SIZE = 144

const ready = new Map<string, string>()
const pending = new Map<string, Promise<string>>()

export function needsAvatarThumbnail(src: string | undefined | null): src is string {
  return typeof src === 'string' && src.startsWith('data:image/') && src.length > AVATAR_THUMBNAIL_MIN_LENGTH
}

/** Centre-crop ("cover") rectangle for drawing a width×height image into a size×size square. */
export function coverRect(width: number, height: number, size: number) {
  const scale = Math.max(size / width, size / height)
  const w = width * scale
  const h = height * scale
  return { x: (size - w) / 2, y: (size - h) / 2, width: w, height: h }
}

/**
 * The image to put in an <img> right now: the original when it is small, the cached
 * thumbnail when one is ready, otherwise undefined (render a placeholder and wait
 * for loadAvatarThumbnail).
 */
export function peekAvatarThumbnail(src: string | undefined | null): string | undefined {
  if (!src) return undefined
  if (!needsAvatarThumbnail(src)) return src
  return ready.get(src)
}

async function makeThumbnail(src: string, size: number): Promise<string> {
  const blob = await (await fetch(src)).blob()
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) return src
    const rect = coverRect(bitmap.width, bitmap.height, size)
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height)
    return canvas.toDataURL('image/jpeg', 0.86)
  } finally {
    bitmap.close()
  }
}

/** Resolves to the image to display (thumbnail, or the original if it is small or cannot be shrunk). */
export function loadAvatarThumbnail(src: string, size = AVATAR_THUMBNAIL_SIZE): Promise<string> {
  if (!needsAvatarThumbnail(src)) return Promise.resolve(src)
  const cached = ready.get(src)
  if (cached) return Promise.resolve(cached)
  const inFlight = pending.get(src)
  if (inFlight) return inFlight
  const job = makeThumbnail(src, size)
    .catch(() => src)
    .then((result) => {
      ready.set(src, result)
      pending.delete(src)
      return result
    })
  pending.set(src, job)
  return job
}

/** Start making thumbnails for avatars that may be shown soon (e.g. when a group chat opens). */
export function prewarmAvatarThumbnails(sources: Array<string | undefined | null>) {
  for (const src of sources) if (needsAvatarThumbnail(src)) void loadAvatarThumbnail(src)
}

/** v245：开场模板等大图位置用的预览图，保持原比例，最长边 OPENING_PREVIEW_MAX px。 */
export const OPENING_PREVIEW_MAX = 640
const previewReady = new Map<string, string>()
const previewPending = new Map<string, Promise<string>>()

/** 等比缩放后的尺寸（不放大）。 */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height, 1))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export function peekAvatarPreview(src: string | undefined | null): string | undefined {
  if (!src) return ''
  if (!needsAvatarThumbnail(src)) return src
  return previewReady.get(src)
}

/** 大头像缩成预览；做不出来就返回 ''（宁可不放图，也不把几 MB 原图塞进页面）。 */
export function loadAvatarPreview(src: string, max = OPENING_PREVIEW_MAX): Promise<string> {
  if (!needsAvatarThumbnail(src)) return Promise.resolve(src)
  const cached = previewReady.get(src)
  if (cached !== undefined) return Promise.resolve(cached)
  const inFlight = previewPending.get(src)
  if (inFlight) return inFlight
  const job = (async () => {
    const bitmap = await createImageBitmap(await (await fetch(src)).blob())
    try {
      const size = fitWithin(bitmap.width, bitmap.height, max)
      const canvas = document.createElement('canvas')
      canvas.width = size.width
      canvas.height = size.height
      const context = canvas.getContext('2d')
      if (!context) return ''
      context.drawImage(bitmap, 0, 0, size.width, size.height)
      const out = canvas.toDataURL('image/jpeg', 0.85)
      canvas.width = canvas.height = 0
      return out.length < src.length ? out : ''
    } finally { bitmap.close() }
  })().catch(() => '').then((result) => {
    previewReady.set(src, result)
    previewPending.delete(src)
    return result
  })
  previewPending.set(src, job)
  return job
}
