import { archivedImageText, imageWireContent } from './imageMemo'
import type { ChatApiContentPart } from './chatApi'

/** A picture the user sent in chat. Stored inline (compressed JPEG) inside the
 *  message, which lives in IndexedDB — never in localStorage. */
export type ChatImage = { id: string; dataUrl: string; width: number; height: number; fromVideo?: boolean; /** v250 图记：他看图那一轮写下的 ≤40 字描述；之后的请求只带这一行，不再带原图。 */ memo?: string }
export type PlotImage = ChatImage & { /** 她起的名字，正文里用 [配图:名字] 引用。 */ name: string }

export const CHAT_IMAGE_MAX_SIDE = 1280
export const CHAT_IMAGE_QUALITY = 0.8
export const CHAT_IMAGE_LIMIT = 4
/** v250：一张图最多等这么久解码/压缩（iOS 上 HEIC 偶尔既不 onload 也不 onerror，发送键会一直转）。 */
export const CHAT_IMAGE_PREPARE_TIMEOUT_MS = 20_000

export function fitImageSize(width: number, height: number, maxSide = CHAT_IMAGE_MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width || 1, height || 1))
  return { width: Math.max(1, Math.round((width || 1) * scale)), height: Math.max(1, Math.round((height || 1) * scale)) }
}

const loadImage = (file: File, timeoutMs = CHAT_IMAGE_PREPARE_TIMEOUT_MS) => new Promise<HTMLImageElement>((resolve, reject) => {
  const url = URL.createObjectURL(file)
  const image = new Image()
  let settled = false
  const finish = (action: () => void) => { if (settled) return; settled = true; clearTimeout(timer); URL.revokeObjectURL(url); action() }
  const timer = setTimeout(() => finish(() => { image.onload = null; image.onerror = null; image.src = ''; reject(new Error(`“${file.name || '图片'}”处理超时（${Math.round(timeoutMs / 1000)} 秒），换一张或截个图再发。`)) }), timeoutMs)
  image.onload = () => finish(() => resolve(image))
  image.onerror = () => finish(() => reject(new Error(`“${file.name || '图片'}”无法读取，换一张试试。`)))
  image.src = url
})

export async function prepareChatImage(file: File, timeoutMs = CHAT_IMAGE_PREPARE_TIMEOUT_MS): Promise<ChatImage> {
  if (file.type && !file.type.startsWith('image/')) throw new Error(`“${file.name}”不是图片。`)
  if (file.size > 25 * 1024 * 1024) throw new Error(`“${file.name}”超过 25MB，请先裁小一点。`)
  const image = await loadImage(file, timeoutMs)
  const size = fitImageSize(image.naturalWidth, image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = size.width; canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器暂时无法处理这张图片。')
  context.fillStyle = '#fff'; context.fillRect(0, 0, size.width, size.height)
  context.drawImage(image, 0, 0, size.width, size.height)
  return { id: crypto.randomUUID(), dataUrl: canvas.toDataURL('image/jpeg', CHAT_IMAGE_QUALITY), ...size }
}

export const CHAT_VIDEO_MAX_SIZE = 100 * 1024 * 1024
export const CHAT_VIDEO_MAX_DURATION = 120
export const CHAT_VIDEO_MAX_FRAMES = 8

/** 从视频里抽帧，转成图片发给模型"看"。返回抽到的帧（ChatImage 数组）。 */
export async function prepareChatVideo(file: File, maxFrames = CHAT_VIDEO_MAX_FRAMES): Promise<ChatImage[]> {
  if (!file.type.startsWith('video/')) throw new Error(`“${file.name}”不是视频。`)
  if (file.size > CHAT_VIDEO_MAX_SIZE) throw new Error(`“${file.name}”超过 100MB，请压缩一下。`)
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  ;(video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true
  video.preload = 'auto'
  const withTimeout = <T>(promise: Promise<T>, ms: number, message: string): Promise<T> =>
    Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))])
  try {
    await withTimeout(new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error(`“${file.name || '视频'}”无法读取，换一个试试。`))
      video.src = url
    }), 15000, `“${file.name || '视频'}”加载超时，换一个试试。`)
    const duration = video.duration
    if (!duration || !Number.isFinite(duration)) throw new Error(`“${file.name || '视频'}”时长读不出来。`)
    if (duration > CHAT_VIDEO_MAX_DURATION) throw new Error('视频超过 2 分钟，请截短一点再发。')
    const count = Math.min(maxFrames, Math.max(2, Math.floor(duration) || 2))
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器暂时无法处理这个视频。')
    const frames: ChatImage[] = []
    for (let i = 0; i < count; i++) {
      const time = Math.min(duration - 0.1, (duration * (i + 0.5)) / count)
      try {
        await withTimeout(new Promise<void>((resolve, reject) => {
          video.onseeked = () => resolve()
          video.onerror = () => reject(new Error('seek failed'))
          video.currentTime = Math.max(0, time)
        }), 8000, 'seek timeout')
      } catch {
        continue // 这一帧抽不到就跳过，不卡死
      }
      const size = fitImageSize(video.videoWidth, video.videoHeight)
      canvas.width = size.width; canvas.height = size.height
      context.drawImage(video, 0, 0, size.width, size.height)
      frames.push({ id: crypto.randomUUID(), dataUrl: canvas.toDataURL('image/jpeg', CHAT_IMAGE_QUALITY), ...size, fromVideo: true })
    }
    if (!frames.length) throw new Error(`“${file.name || '视频'}”抽不到画面，换个格式试试。`)
    return frames
  } finally {
    URL.revokeObjectURL(url)
  }
}
/** Text the model sees for an image turn that is too old to resend (v250: one 图记 line per picture). */
export const imagePlaceholder = archivedImageText

/** v250：live = 本轮真图；否则只留图记一行。recalled = 她回指时临时附回的那一张原图。 */
export function userContentWithImages(text: string, images: ChatImage[] | undefined, includePixels: boolean, recalled?: ChatImage | null): string | ChatApiContentPart[] {
  return imageWireContent(text, images, includePixels, recalled)
}
