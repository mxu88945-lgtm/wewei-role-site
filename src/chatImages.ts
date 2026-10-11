import type { ChatApiContentPart } from './chatApi'

/** A picture the user sent in chat. Stored inline (compressed JPEG) inside the
 *  message, which lives in IndexedDB — never in localStorage. */
export type ChatImage = { id: string; dataUrl: string; width: number; height: number }

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

/** Text the model sees for an image turn that is too old to resend. */
export function imagePlaceholder(count: number) {
  return count > 1 ? `[用户发送了 ${count} 张图片]` : '[用户发送了一张图片]'
}

export function userContentWithImages(text: string, images: ChatImage[] | undefined, includePixels: boolean): string | ChatApiContentPart[] {
  if (!images?.length) return text
  if (!includePixels) return [imagePlaceholder(images.length), text].filter(Boolean).join('\n')
  return [
    { type: 'text', text: text || '（用户发送了图片，请结合图片内容自然回应。）' },
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
