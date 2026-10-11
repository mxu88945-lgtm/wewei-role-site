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
