import type { ChatApiContentPart } from './chatApi'
import type { ChatImage } from './chatImages'

/**
 * v250 图记 + 图片归档（同顾祁砚 v377）。
 * - 真图只在它发出的那一轮（含重新生成这一轮）随请求发给主模型。
 * - 那一轮在【本轮背景】里加一句提示，请他在回复末尾另写 [图记:≤40字]；界面（含流式）一律剥掉，图记存在那张图上。
 * - 从她下一轮起，这张图在请求里只剩一行「【此前发过的图片：图记】」（没有图记就「【此前发过的图片】」）。
 * - 她回指旧图（那张图/刚才的图/照片/图里/之前发的…，或说到某条图记里的词）时，只把最近一张匹配的原图
 *   临时附进这一轮（最多 1 张），下一轮又归档。存储不动，图片一直留在聊天界面里。
 * - 历史窗口按条数算，带图的轮和纯文字轮占位一样，图片不会挤掉正常历史。
 */
export const IMAGE_MEMO_MAX_CHARS = 40
export const ARCHIVED_IMAGE_FALLBACK = '【此前发过的图片】'
export const ARCHIVED_VIDEO_FALLBACK = '【此前发过的一段视频】'
export const IMAGE_MEMO_PROMPT = '（应用提示：她这轮发了图。回复末尾另写一行 [图记:图里是什么，40字内]，会被隐藏。）'

export type ImageTurnMessage = { role: string; promptRole?: string; text?: string; images?: ChatImage[] }

export function clipImageMemo(text: string | undefined) {
  return Array.from(String(text || '').replace(/\s+/g, ' ').trim()).slice(0, IMAGE_MEMO_MAX_CHARS).join('')
}

/** What an archived (older) image turn costs on the wire: one short line per picture. */
export function archivedImageText(images: ChatImage[]): string {
  if (!images.length) return ''
  if (images.some((image) => image.fromVideo)) {
    const memo = clipImageMemo(images.find((image) => image.memo)?.memo)
    return memo ? `【此前发过的一段视频：${memo}】` : ARCHIVED_VIDEO_FALLBACK
  }
  return images.map((image) => { const memo = clipImageMemo(image.memo); return memo ? `【此前发过的图片：${memo}】` : ARCHIVED_IMAGE_FALLBACK }).join('\n')
}

const isUserTurn = (message: ImageTurnMessage) => message.role === 'user' && (message.promptRole || 'user') === 'user'

/** 当前这一轮 = 最新一串连续的用户消息（她可能连发图+字几个气泡）。之后已经回了的角色消息不算新一轮。 */
export function currentImageTurn(messages: readonly ImageTurnMessage[]): number[] {
  let end = messages.length - 1
  while (end >= 0 && !isUserTurn(messages[end])) end--
  if (end < 0) return []
  let start = end
  while (start > 0 && isUserTurn(messages[start - 1])) start--
  const indices: number[] = []
  for (let index = start; index <= end; index++) indices.push(index)
  return indices
}

export const IMAGE_RECALL_PHRASE = /(?:那|这|刚才|刚刚|之前|上次|前面|上面)(?:张|个|的|发的|那张)?\s*(?:图片?|照片|相片|截图)|(?:图|照片|图片|截图|相片)里|之前发的|刚才发的|刚刚发的/
const MEMO_STOP_CHARS = /[的一了是在她他我你它这那个只张和很有着也都就把被跟与及或吗呢吧啊呀，。！？、：；\s]/

/** v278：把人名（角色名、她的名字）从图记和她的话里抠掉，免得一叫名字就把旧图翻出来。 */
function withoutNames(text: string, names: readonly (string | undefined)[]) {
  let out = text
  for (const name of names) { const clean = String(name || '').trim(); if (Array.from(clean).length >= 2) out = out.split(clean).join('・') }
  return out
}

/** 她这句话里说到了某条图记里的东西（任意连续 3 字，且不含虚词；人名不算）。 */
export function imageMemoMentioned(memo: string | undefined, text: string, names: readonly (string | undefined)[] = []) {
  text = withoutNames(text, names)
  const chars = Array.from(withoutNames(String(memo || ''), names))
  for (let index = 0; index + 3 <= chars.length; index++) {
    const gram = chars.slice(index, index + 3)
    if (gram.some((char) => char === '・' || MEMO_STOP_CHARS.test(char))) continue
    if (text.includes(gram.join(''))) return true
  }
  return false
}

/** 按需回看：本轮没发新图、却回指了旧图时，返回最近一张匹配的原图（最多 1 张），否则 null。 */
export function findRecallImage(all: readonly ImageTurnMessage[], turnText: string, names: readonly (string | undefined)[] = []): ChatImage | null {
  const text = turnText.trim()
  if (!text) return null
  const older: ChatImage[] = []
  for (let index = all.length - 1; index >= 0; index--) {
    const message = all[index]
    if (message.role !== 'user' || !message.images?.length) continue
    for (const image of [...message.images].reverse()) if (!image.fromVideo) older.push(image)
  }
  if (!older.length) return null
  const byMemo = older.find((image) => image.memo && imageMemoMentioned(image.memo, text, names))
  if (byMemo) return byMemo
  return IMAGE_RECALL_PHRASE.test(text) ? older[0] : null
}

export type ImageWirePlan = {
  /** indices (in the request window) whose pictures go out as real images this turn */
  live: Set<number>
  /** the one old picture re-attached to the last message of this turn, or null */
  recall: { index: number; image: ChatImage } | null
  /** true when this turn's new picture still needs a 图记 (adds one line to the per-turn tail) */
  wantsMemo: boolean
}

/**
 * window: the messages the request carries (same order). all: the full thread (for on-demand recall);
 * pass the window again when there is nothing older. noLiveImages: an app event (not her turn) is the latest message.
 */
export function planImageWire(window: readonly ImageTurnMessage[], all: readonly ImageTurnMessage[] = window, options: { noLiveImages?: boolean; names?: readonly (string | undefined)[] } = {}): ImageWirePlan {
  const turn = options.noLiveImages ? [] : currentImageTurn(window)
  const live = new Set(turn.filter((index) => window[index].images?.length))
  if (live.size) {
    const images = [...live].flatMap((index) => window[index].images || [])
    return { live, recall: null, wantsMemo: !images.some((image) => image.memo) }
  }
  if (!turn.length) return { live, recall: null, wantsMemo: false }
  const image = findRecallImage(all, turn.map((index) => window[index].text || '').join('\n'), options.names)
  return { live, recall: image ? { index: turn[turn.length - 1], image } : null, wantsMemo: false }
}

/** Wire content for one user turn: live pictures as images, archived ones as their 图记 line, plus a recalled original. */
export function imageWireContent(text: string, images: ChatImage[] | undefined, live: boolean, recalled?: ChatImage | null): string | ChatApiContentPart[] {
  const own = images?.length ? images : []
  if (!own.length && !recalled) return text
  if (!live && !recalled) return [archivedImageText(own), text].filter(Boolean).join('\n')
  const fromVideo = own.some((image) => image.fromVideo)
  const hint = !own.length ? '' : fromVideo ? '（用户发送了一段视频，以下是按时间顺序抽取的画面，请结合视频内容自然回应。）' : '（用户发送了图片，请结合图片内容自然回应。）'
  const lead = live ? text || hint : [archivedImageText(own), text].filter(Boolean).join('\n')
  const pictures = [...(live ? own : []), ...(recalled ? [recalled] : [])]
  return [
    { type: 'text', text: lead || '（她提到了之前发过的那张图，原图附上。）' },
    ...pictures.map((image): ChatApiContentPart => ({ type: 'image_url', image_url: { url: image.dataUrl, detail: 'auto' } })),
  ]
}

const MEMO_TAG = /[[【［]\s*图记\s*[:：]\s*([^\]】］\n]{1,160}?)\s*[\]】］]/g
const MEMO_PARTIAL = /[[【［]\s*图(?:\s*记(?:\s*[:：][^\]】］\n]*)?)?$/

/** Remove [图记:…] everywhere it could show (final text and a half-written tail while streaming). */
export function stripImageMemo(value: string) {
  if (!value || !value.includes('图')) return value
  const out = value.replace(MEMO_TAG, '').replace(MEMO_PARTIAL, '')
  if (out === value) return value
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

/** The last 图记 in a raw reply, clipped to 40 chars ('' when none). */
export function extractImageMemo(value: string) {
  if (!value || !value.includes('图记')) return ''
  let memo = ''
  for (const match of value.matchAll(MEMO_TAG)) memo = match[1]
  return clipImageMemo(memo)
}

/** Store a memo on the first picture of the turn's image messages that has none (returns the same array when nothing changes). */
export function withImageMemo<T extends ImageTurnMessage>(messages: T[], turnIds: (message: T) => boolean, memo: string): T[] {
  const clipped = clipImageMemo(memo)
  if (!clipped) return messages
  const at = messages.findIndex((message) => turnIds(message) && message.images?.length)
  if (at < 0 || messages[at].images!.some((image) => image.memo)) return messages
  const next = messages.slice()
  next[at] = { ...messages[at], images: messages[at].images!.map((image, index) => index === 0 ? { ...image, memo: clipped } : image) }
  return next
}
