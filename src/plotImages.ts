/**
 * v284 幕后配图：她在临时剧情后台传图并起名，模型看图后在正文单独一行写 [配图:名字]，
 * 界面在那个位置显示图片。图只在幕后安排生效的那一轮随请求发出；用过的图从后台移走。
 */
import type { ChatApiContentPart, ChatApiMessage } from './chatApi'
import type { PlotImage } from './chatImages'

export const PLOT_IMAGE_LIMIT = 4
export const PLOT_IMAGE_TAG = /\[配图[:：]\s*([^\]\n]{1,40}?)\s*\]/g

const norm = (value: string) => value.trim().replace(/[「」『』"“”《》\s]/g, '')

export function findPlotImage(images: readonly PlotImage[] | undefined, name: string) {
  const key = norm(name)
  return images?.find((image) => norm(image.name) === key)
}

/** 正文里实际用到的图（按出现顺序，去重）。 */
export function usedPlotImages(text: string, images: readonly PlotImage[] | undefined): PlotImage[] {
  if (!images?.length) return []
  const used: PlotImage[] = []
  for (const match of text.matchAll(PLOT_IMAGE_TAG)) {
    const image = findPlotImage(images, match[1])
    if (image && !used.includes(image)) used.push(image)
  }
  return used
}

/** 合并新旧（重生成时保留旧版本用过的图，按 id 去重）。 */
export function mergePlotImages(previous: readonly PlotImage[] | undefined, next: readonly PlotImage[]): PlotImage[] | undefined {
  const merged = [...previous || []]
  next.forEach((image) => { if (!merged.some((item) => item.id === image.id)) merged.push(image) })
  return merged.length ? merged : undefined
}

export type PlotTextPiece = { kind: 'text'; text: string } | { kind: 'image'; image: PlotImage }

/** 把一段正文按 [配图:…] 切开；找不到对应图的标签直接隐藏。 */
export function splitPlotImages(text: string, images: readonly PlotImage[] | undefined): PlotTextPiece[] {
  const pieces: PlotTextPiece[] = []
  let last = 0
  for (const match of text.matchAll(PLOT_IMAGE_TAG)) {
    const before = text.slice(last, match.index)
    if (before.trim()) pieces.push({ kind: 'text', text: before.trim() })
    const image = findPlotImage(images, match[1])
    if (image) pieces.push({ kind: 'image', image })
    last = (match.index || 0) + match[0].length
  }
  const rest = text.slice(last)
  if (rest.trim() || !pieces.length) pieces.push({ kind: 'text', text: pieces.length ? rest.trim() : rest })
  return pieces
}

export function plotImageInstruction(images: readonly PlotImage[]) {
  const list = images.map((image, index) => `图${index + 1}「${image.name}」`).join('、')
  return `【幕后配图】她附了 ${images.length} 张图（按顺序附在本轮最后，只给你看）：${list}。剧情里需要把某张图展示出来时（如热搜、新闻、聊天截图、照片），在那个位置单独一行写 [配图:名字]，名字必须与清单一致，每张最多用一次；图里的文字和画面要与你写的内容对得上。不需要就不用，不要提到这些图是幕后给的。`
}

/** 把图附到最后一条用户消息上（没有就补一条桥接用户消息）；fold 之后尾巴文字仍会接在后面。 */
export function withPlotImageParts(messages: ChatApiMessage[], images: readonly PlotImage[], bridge: string): ChatApiMessage[] {
  if (!images.length) return messages
  const parts: ChatApiContentPart[] = images.map((image) => ({ type: 'image_url', image_url: { url: image.dataUrl, detail: 'auto' } }))
  const lastTurn = messages.reduce((found, message, index) => message.role !== 'system' ? index : found, -1)
  if (lastTurn >= 0 && messages[lastTurn].role === 'user') {
    const target = messages[lastTurn]
    const content: ChatApiContentPart[] = typeof target.content === 'string' ? [{ type: 'text', text: target.content }] : [...target.content]
    return messages.map((message, index) => index === lastTurn ? { ...message, content: [...content, ...parts] } : message)
  }
  const insertAt = lastTurn + 1
  return [...messages.slice(0, insertAt), { role: 'user' as const, content: [{ type: 'text' as const, text: bridge }, ...parts] }, ...messages.slice(insertAt)]
}
