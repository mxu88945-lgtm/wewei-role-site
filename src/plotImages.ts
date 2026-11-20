/**
 * v284 幕后配图：她在临时剧情后台传图并起名，模型看图后在正文单独一行写 [配图:名字]，
 * 界面在那个位置显示图片。图只在幕后安排生效的那一轮随请求发出；用过的图从后台移走。
 */
import type { ChatApiContentPart, ChatApiMessage } from './chatApi'
import type { PlotImage } from './chatImages'

export const PLOT_IMAGE_LIMIT = 4
export const PLOT_IMAGE_TAG = /\[配图[:：]\s*([^\]\n]{1,40}?)\s*\]/g

const norm = (value: string) => value.trim().replace(/[「」『』"“”《》\s]/g, '')

/** v302：名字被清空时按「图N」兜底，避免模型拿到空名字写不出标签。 */
export function plotImageName(image: PlotImage, index: number) {
  return image.name?.trim() || `图${index + 1}`
}

export function findPlotImage(images: readonly PlotImage[] | undefined, name: string) {
  const key = norm(name)
  return images?.find((image, index) => norm(plotImageName(image, index)) === key)
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
  const list = images.map((image, index) => `图${index + 1}「${plotImageName(image, index)}」`).join('、')
  const tags = images.map((image, index) => `[配图:${plotImageName(image, index)}]`).join('、')
  return `【幕后配图】她附了 ${images.length} 张图（按顺序附在本轮最后，只给你看）：${list}。剧情里需要把某张图展示出来时（如热搜、新闻、聊天截图、照片），在那个位置单独一行原样写对应标签：${tags}，名字必须与清单一致，每张最多用一次；图里的文字和画面要与你写的内容对得上。安排里提到要配图、发图、附上这张图时，本轮正文必须用上；没提到就按剧情需要决定。不要提到这些图是幕后给的。`
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

/**
 * v303 兜底：安排里点名要配的图（写了图名，或只有一张图且安排提到图/照片/截图/热搜），
 * 模型没写 [配图:…] 标签时，自动插到第一段讲照片/截图/热搜的正文前，找不到就放在正文末尾（状态块之前）。
 */
export function ensurePlotImageTags(text: string, images: readonly PlotImage[] | undefined, plotText: string | undefined): string {
  if (!images?.length || !plotText?.trim()) return text
  const plot = norm(plotText)
  const mentionsPicture = /图|照片|截图|热搜|配图|发图/.test(plotText)
  const required = images.filter((image, index) => {
    const name = norm(plotImageName(image, index))
    return (name && plot.includes(name)) || (images.length === 1 && mentionsPicture)
  })
  const missing = required.filter((image) => !usedPlotImages(text, images).includes(image))
  if (!missing.length) return text
  const tags = missing.map((image) => `[配图:${plotImageName(image, images.indexOf(image))}]`).join('\n')
  const statusAt = text.search(/\n\s*(?:<[a-z]|```)/i)
  const body = statusAt > 0 ? text.slice(0, statusAt) : text
  const rest = statusAt > 0 ? text.slice(statusAt) : ''
  const lines = body.split('\n')
  const hit = lines.findIndex((line) => /照片|图片|截图|热搜|原图|抓拍|配图/.test(line) && !/^\s*</.test(line) && !/^\s*\[/.test(line))
  if (hit >= 0) { lines.splice(hit, 0, tags, ''); return lines.join('\n') + rest }
  return `${body}\n\n${tags}${rest}`
}

/** v303：含行内 HTML 的回复里，把标签换成 <img>（无对应图就去掉）。 */
export function plotTagsToHtml(html: string, images: readonly PlotImage[] | undefined) {
  return html.replace(PLOT_IMAGE_TAG, (_, name: string) => {
    const image = findPlotImage(images, name)
    return image ? `<img src="${image.dataUrl}" alt="" style="display:block;width:100%;max-width:320px;height:auto;border-radius:12px;margin:10px 0" />` : ''
  })
}
