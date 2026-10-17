import type { ChatApiContentPart } from './chatApi'

/** A picture the user sent in chat. Stored inline (compressed JPEG) inside the
 *  message, which lives in IndexedDB — never in localStorage. */
export type ChatImage = { id: string; dataUrl: string; width: number; height: number; fromVideo?: boolean }

export const CHAT_IMAGE_MAX_SIDE = 1280
export const CHAT_IMAGE_QUALITY = 0.8
export const CHAT_IMAGE_LIMIT = 4
/** Only the newest few image-bearing user turns carry pixels to the model; older
 *  ones become a short text marker so long chats don't resend every photo. */
export const CHAT_IMAGE_PROMPT_TURNS = 2

export function fitImageSize(width: number, height: number, maxSide = CHAT_IMAGE_MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width || 1, height || 1))
  return { width: Math.max(1, Math.round((width || 1) * scale)), height: Math.max(1, Math.round((height || 1) * scale)) }
}

const loadImage = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`“${file.name || '图片'}”无法读取，换一张试试。`)) }
  image.src = url
})

export async function prepareChatImage(file: File): Promise<ChatImage> {
  if (file.type && !file.type.startsWith('image/')) throw new Error(`“${file.name}”不是图片。`)
  if (file.size > 25 * 1024 * 1024) throw new Error(`“${file.name}”超过 25MB，请先裁小一点。`)
  const image = await loadImage(file)
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
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error(`“${file.name || '视频'}”无法读取，换一个试试。`))
      video.src = url
    })
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
      await new Promise<void>((resolve) => { video.onseeked = () => resolve(); video.currentTime = Math.max(0, time) })
      const size = fitImageSize(video.videoWidth, video.videoHeight)
      canvas.width = size.width; canvas.height = size.height
      context.drawImage(video, 0, 0, size.width, size.height)
      frames.push({ id: crypto.randomUUID(), dataUrl: canvas.toDataURL('image/jpeg', CHAT_IMAGE_QUALITY), ...size, fromVideo: true })
    }
    if (!frames.length) throw new Error(`“${file.name || '视频'}”抽不到画面。`)
    return frames
  } finally {
    URL.revokeObjectURL(url)
  }
}
/** Text the model sees for an image turn that is too old to resend. */
export function imagePlaceholder(images: ChatImage[]): string {
  const count = images.length
  const fromVideo = images.some((image) => image.fromVideo)
  if (fromVideo) return `[用户发送了一段视频（已抽帧 ${count} 张）]`
  return count > 1 ? `[用户发送了 ${count} 张图片]` : '[用户发送了一张图片]'
}

export function userContentWithImages(text: string, images: ChatImage[] | undefined, includePixels: boolean): string | ChatApiContentPart[] {
  if (!images?.length) return text
  if (!includePixels) return [imagePlaceholder(images), text].filter(Boolean).join('\n')
  const fromVideo = images.some((image) => image.fromVideo)
  const hint = fromVideo ? '（用户发送了一段视频，以下是按时间顺序抽取的画面，请结合视频内容自然回应。）' : '（用户发送了图片，请结合图片内容自然回应。）'
  return [
    { type: 'text', text: text || hint },
    ...images.map((image): ChatApiContentPart => ({ type: 'image_url', image_url: { url: image.dataUrl, detail: 'auto' } })),
  ]
}

/** Indices (into messages) of the newest image-bearing user turns that should carry pixels. */
export function imagePromptIndices(messages: { role: string; images?: ChatImage[] }[], turns = CHAT_IMAGE_PROMPT_TURNS) {
  const picked = new Set<number>()
  for (let index = messages.length - 1; index >= 0 && picked.size < turns; index--) {
    const message = messages[index]
    if (message.role === 'user' && message.images?.length) picked.add(index)
  }
  return picked
}
