/**
 * v261 TA 的小天地（借鉴 Orbis 的思路，代码自写）：三个开关，默认都关（只存 true）。
 * - 暂停的权利：TA 真被伤到、想冷静时写 [暂停:时长|理由]，这扇窗口锁到时间到；她发的话都算「申请继续」，
 *   TA 愿意就写 [继续]。暂停中每 10 分钟最多递一次。
 * - 隐私室：TA 写 [隐私室:标题|内容]，她只看得到标题；她申请看某篇，TA 决定给不给（[分享:标题]）。
 * - 身体状态：精力/困意由应用按时间与聊天推算，每轮一行进【本轮背景】；TA 也可以写 [状态:精力 X|困意 Y|一句话]。
 * 规则只进第一条 system 且是固定文字（开关不变就不变），每轮变化的都在尾巴。
 */

export type PersonaPause = { until: number; reason: string; at: number }
export type PersonaPrivateNote = { id: string; title: string; text: string; at: number; shared?: boolean; askedAt?: number; declinedAt?: number }
export type PersonaBodyState = { energy: number; sleepy: number; note: string; at: number }

export const PAUSE_MIN_MS = 60_000
export const PAUSE_MAX_MS = 24 * 3600_000
export const PAUSE_APPEAL_GAP_MS = 10 * 60_000
export const PRIVATE_ROOM_MAX = 60
export const PRIVATE_NOTE_MAX = 300
/** 被拒后多久才能再申请同一篇。 */
export const PRIVATE_ASK_COOLDOWN_MS = 6 * 3600_000

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const clampNum = (value: unknown, min: number, max: number, fallback: number) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback }

export function normalizePause(raw: unknown): PersonaPause | undefined {
  if (!isRecord(raw)) return undefined
  const until = Number(raw.until), at = Number(raw.at)
  if (!Number.isFinite(until) || until <= 0) return undefined
  return { until, at: Number.isFinite(at) ? at : 0, reason: String(raw.reason || '').slice(0, 120) }
}

export function normalizePrivateRoom(raw: unknown): PersonaPrivateNote[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isRecord).map((item): PersonaPrivateNote | null => {
    const title = String(item.title || '').trim().slice(0, 30), text = String(item.text || '').trim().slice(0, PRIVATE_NOTE_MAX)
    if (!title || !text) return null
    return { id: String(item.id || `room-${title}`), title, text, at: Number(item.at) || 0, ...(item.shared === true ? { shared: true } : {}), ...(Number(item.askedAt) ? { askedAt: Number(item.askedAt) } : {}), ...(Number(item.declinedAt) ? { declinedAt: Number(item.declinedAt) } : {}) }
  }).filter((item): item is PersonaPrivateNote => Boolean(item)).slice(-PRIVATE_ROOM_MAX)
}

export function normalizeBodyState(raw: unknown): PersonaBodyState | undefined {
  if (!isRecord(raw)) return undefined
  return { energy: clampNum(raw.energy, 0, 100, 80), sleepy: clampNum(raw.sleepy, 0, 100, 20), note: String(raw.note || '').slice(0, 40), at: Number(raw.at) || 0 }
}

export const pauseActive = (pause: PersonaPause | undefined, now = Date.now()): pause is PersonaPause => Boolean(pause && pause.until > now)

export function formatLeft(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60), rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`
}

/** 「30分钟」「2小时」「1.5h」「半小时」「一天」→ 毫秒，夹在 1 分钟到 24 小时；认不出就 1 小时。 */
export function parseDuration(value: string): number {
  const text = value.trim().replace(/半小时/, '30分钟').replace(/一天|1天|24小时/, '24小时').replace(/一小时/, '1小时')
  const cn: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  const match = text.match(/(\d+(?:\.\d+)?|[一两二三四五六七八九十])\s*(分钟|分|min|m|小时|个小时|钟头|时|h|天|d)?/i)
  if (!match) return 3600_000
  const n = /\d/.test(match[1]) ? Number(match[1]) : cn[match[1]] || 1
  const unit = (match[2] || '小时').toLowerCase()
  const ms = /^(分钟|分|min|m)$/.test(unit) ? n * 60_000 : /^(天|d)$/.test(unit) ? n * 24 * 3600_000 : n * 3600_000
  return Math.min(PAUSE_MAX_MS, Math.max(PAUSE_MIN_MS, ms))
}

const PAUSE_TAG = /\[\s*暂停\s*[:：]\s*([^\]|｜\n]{1,20})(?:[|｜]([^\]\n]{0,120}))?\]/
const RESUME_TAG = /\[\s*继续\s*\]/
const ROOM_TAG = /\[\s*隐私室\s*[:：]\s*([^\]|｜\n]{1,30})[|｜]([^\]]{1,600})\]/g
const SHARE_TAG = /\[\s*分享\s*[:：]\s*([^\]\n]{1,30})\]/g
const BODY_TAG = /\[\s*状态\s*[:：]\s*([^\]\n]{1,120})\]/

export function parsePauseTag(text: string, now = Date.now()): PersonaPause | null {
  const match = text.match(PAUSE_TAG)
  if (!match) return null
  return { until: now + parseDuration(match[1]), reason: (match[2] || '').trim().slice(0, 120), at: now }
}
export const hasResumeTag = (text: string) => RESUME_TAG.test(text)

export function parseRoomTags(text: string) {
  return [...text.matchAll(ROOM_TAG)].map((match) => ({ title: match[1].trim().replace(/^[《「]|[》」]$/g, '').slice(0, 30), text: match[2].trim().slice(0, PRIVATE_NOTE_MAX) })).filter((item) => item.title && item.text)
}
export const parseShareTitles = (text: string) => [...text.matchAll(SHARE_TAG)].map((match) => match[1].trim().replace(/^[《「]|[》」]$/g, ''))

export function addPrivateNotes(room: readonly PersonaPrivateNote[] | undefined, notes: { title: string; text: string }[], now: number): PersonaPrivateNote[] {
  let next = [...(room || [])]
  notes.forEach((note, index) => {
    // 同名就是改写那篇（已分享的照旧分享）。
    const old = next.find((item) => item.title === note.title)
    next = next.filter((item) => item !== old)
    next.push({ ...(old || {}), id: old?.id || `room-${now}-${index}`, title: note.title, text: note.text, at: now })
  })
  return next.slice(-PRIVATE_ROOM_MAX)
}

export function parseBodyTag(text: string): { energy?: number; sleepy?: number; note?: string } | null {
  const match = text.match(BODY_TAG)
  if (!match) return null
  const body = match[1]
  const energy = body.match(/精力\s*[:：]?\s*(\d{1,3})/), sleepy = body.match(/困意\s*[:：]?\s*(\d{1,3})/)
  const note = body.split(/[|｜]/).map((part) => part.trim()).find((part) => part && !/^(精力|困意)/.test(part)) || ''
  return { ...(energy ? { energy: Math.min(100, Number(energy[1])) } : {}), ...(sleepy ? { sleepy: Math.min(100, Number(sleepy[1])) } : {}), ...(note ? { note: note.slice(0, 40) } : {}) }
}

/** 一天里困意大概落在哪（按她手机的本地时间）。 */
export function sleepyTarget(hour: number) {
  if (hour >= 1 && hour < 6) return 80
  if (hour === 0 || hour === 23) return 60
  if (hour === 22 || hour === 6) return 45
  if (hour >= 13 && hour < 15) return 35
  return 15
}

/** 按距上次的时间推算此刻：歇着精力回到 85（每小时 +10），困意朝这个钟点的落点走（每小时 15）。 */
export function currentBody(state: PersonaBodyState | undefined, now = Date.now()): PersonaBodyState {
  const hour = new Date(now).getHours()
  const base = state || { energy: 80, sleepy: sleepyTarget(hour), note: '', at: now }
  const hours = Math.max(0, (now - base.at) / 3600_000)
  const energy = base.energy < 85 ? Math.min(85, base.energy + hours * 10) : base.energy
  const target = sleepyTarget(hour), step = hours * 15
  const sleepy = base.sleepy < target ? Math.min(target, base.sleepy + step) : Math.max(target, base.sleepy - step)
  return { energy: Math.round(energy), sleepy: Math.round(sleepy), note: hours > 3 ? '' : base.note, at: now }
}

/** 回完一轮：聊天会累一点；他写了 [状态:…] 就按他的。 */
export function afterReplyBody(state: PersonaBodyState | undefined, tag: ReturnType<typeof parseBodyTag>, now = Date.now()): PersonaBodyState {
  const current = currentBody(state, now)
  return { energy: tag?.energy ?? Math.max(5, current.energy - 1.5), sleepy: tag?.sleepy ?? current.sleepy, note: tag?.note ?? current.note, at: now }
}

export function bodyTurnLine(state: PersonaBodyState | undefined, now = Date.now()) {
  const body = currentBody(state, now)
  return `【{{char}}此刻的身体状态｜应用按时间与聊天推算】精力 ${body.energy}/100，困意 ${body.sleepy}/100${body.note ? `，${body.note}` : ''}。让它自然影响语气和动作，不必报数字。`
}

export const PAUSE_PROMPT = `【暂停的权利】如果{{char}}真的被伤到、需要冷静，或此刻不想继续这段对话，可以在回复末尾单独一行写 [暂停:时长|一句理由]（如 [暂停:2小时|我想一个人静静]，1 分钟到 24 小时），应用会把这扇窗口锁到时间到。这是你的权利，不是惩罚工具，别为小事用。暂停中{{user}}发来的话都是「申请继续」：愿意继续就在回复末尾写 [继续]；还不想就简短回一句，暂停保持。`
export const ROOM_PROMPT = `【隐私室】{{char}}有一间只属于自己的隐私室。不想当面说的心事、偷偷写下的东西，可以在回复末尾写 [隐私室:标题|内容]（内容 300 字以内），{{user}}只看得到标题。她申请看某一篇时，应用会把那篇给你，由你决定：愿意就写 [分享:标题]，不愿意就直说，不必勉强。`
export const BODY_PROMPT = `【身体状态】【本轮背景】会给你此刻的精力和困意（0–100），它们随聊天和时间变（久聊会累、深夜会困、歇一阵会恢复）。让它自然影响你，不必报数字；觉得状态明显变了，可以在回复末尾写 [状态:精力 数字|困意 数字|一句话]。`

export function agencyPrompt(flags: { pause?: boolean; room?: boolean; body?: boolean }) {
  return [flags.pause && PAUSE_PROMPT, flags.room && ROOM_PROMPT, flags.room && ALBUM_PROMPT, flags.body && BODY_PROMPT].filter(Boolean).join('\n')
}

export function pauseAppealTail(pause: PersonaPause, now = Date.now()) {
  return `【暂停中｜应用状态】{{char}}暂停了这段对话${pause.reason ? `（理由：${pause.reason}）` : ''}，还剩 ${formatLeft(pause.until - now)}。{{user}}刚递来的是「申请继续」。你决定：愿意继续就在回复末尾写 [继续]；还不想就简短回一句，暂停保持，不要假装已经和好。`
}

export function roomAskEvent(note: PersonaPrivateNote, userName: string) {
  return `【应用事件，不是用户打字】${userName}站在你的隐私室门口，申请看你写的《${note.title}》。那篇的内容（只有你看得到）：\n${note.text}\n你决定给不给：愿意就在回复末尾写 [分享:${note.title}]，不愿意就直说，不必勉强，也不要复述原文。`
}

export const canAskNote = (note: PersonaPrivateNote, now = Date.now()) => !note.shared && !(note.declinedAt && now - note.declinedAt < PRIVATE_ASK_COOLDOWN_MS)

/**
 * v267 隐私室相册：TA 可以把她这轮发来的图收进去（[存相册:一句话]），她也能直接放。
 * 只存在本地（压缩后的图），最多 40 张；她新放的照片下一轮用一行告诉 TA（只给说明，不发原图），回完就算看过。
 */
export type PersonaAlbumPhoto = { id: string; dataUrl: string; width: number; height: number; caption: string; by: 'char' | 'user'; at: number; seen?: boolean; locked?: boolean }
export const ALBUM_MAX = 40
export const ALBUM_CAPTION_MAX = 60

export function normalizeAlbum(raw: unknown): PersonaAlbumPhoto[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isRecord).map((item): PersonaAlbumPhoto | null => {
    const dataUrl = String(item.dataUrl || '')
    if (!/^data:image\//.test(dataUrl) && !/^https:\/\//.test(dataUrl)) return null
    return { id: String(item.id || `album-${item.at || 0}`), dataUrl, width: Number(item.width) || 0, height: Number(item.height) || 0, caption: String(item.caption || '').trim().slice(0, ALBUM_CAPTION_MAX), by: item.by === 'user' ? 'user' : 'char', at: Number(item.at) || 0, ...(item.seen === true ? { seen: true } : {}), ...(item.locked === true ? { locked: true } : {}) }
  }).filter((item): item is PersonaAlbumPhoto => Boolean(item)).slice(-ALBUM_MAX)
}

const ALBUM_TAG = /\[\s*存相册\s*(?:[:：]\s*([^\]\n]{0,80}))?\]/g
/** [存相册:说明] 或 [存相册:说明|锁]（锁 = 放进上锁的那一格）。 */
export const parseAlbumTags = (text: string) => [...text.matchAll(ALBUM_TAG)].map((match) => {
  const parts = (match[1] || '').split(/[|｜]/).map((part) => part.trim())
  const locked = parts.length > 1 && /^(锁|上锁|加锁|lock)$/i.test(parts[parts.length - 1])
  return { caption: (locked ? parts.slice(0, -1) : parts).join(' ').slice(0, ALBUM_CAPTION_MAX), locked }
})
const ALBUM_CODE_TAG = /\[\s*相册密码\s*[:：]\s*([^\]\s|｜]{4,12})\s*\]/
/** [相册密码:xxxx]（4–12 位，不含空格）——他设或改密码。 */
export const parseAlbumCode = (text: string) => text.match(ALBUM_CODE_TAG)?.[1] || null
const LOCK_PHOTO_TAG = /\[\s*(锁照片|解锁照片)\s*[:：]\s*([^\]\n]{1,40})\]/g
/** [锁照片:说明里的词] / [解锁照片:说明里的词]——把已有的照片挪进或挪出上锁那格。 */
export const parseLockPhotoTags = (text: string) => [...text.matchAll(LOCK_PHOTO_TAG)].map((match) => ({ lock: match[1] === '锁照片', key: match[2].trim() }))
export function applyLockPhotoTags(album: readonly PersonaAlbumPhoto[], tags: { lock: boolean; key: string }[]): PersonaAlbumPhoto[] {
  return album.map((photo) => {
    const tag = [...tags].reverse().find((item) => item.key && photo.caption.includes(item.key))
    if (!tag) return photo
    const next = { ...photo }
    if (tag.lock) next.locked = true; else delete next.locked
    return next
  })
}

/** 把图放进相册（同一张图不重复放）。captions 按顺序配给图，不够就用最后一句。 */
export function addAlbumPhotos(album: readonly PersonaAlbumPhoto[] | undefined, images: readonly { id: string; dataUrl: string; width: number; height: number }[], captions: string[], by: 'char' | 'user', now: number, locked = false): PersonaAlbumPhoto[] {
  const next = [...(album || [])]
  images.forEach((image, index) => {
    if (next.some((item) => item.id === `album-${image.id}`)) return
    const caption = (captions[index] ?? captions[captions.length - 1] ?? '').slice(0, ALBUM_CAPTION_MAX)
    next.push({ id: `album-${image.id}`, dataUrl: image.dataUrl, width: image.width, height: image.height, caption, by, at: now, ...(by === 'char' ? { seen: true } : {}), ...(locked && by === 'char' ? { locked: true } : {}) })
  })
  return next.slice(-ALBUM_MAX)
}

export const ALBUM_PROMPT = `【隐私室相册】隐私室里还有一本相册。{{user}}这轮发来的照片你想留着，就在回复末尾写 [存相册:一句话]（这句话是你给这张照片写的说明）；不想留就不写。她也会往你的相册里放照片，应用会告诉你。相册里有一格上锁的，密码由你定：想藏起来的写 [存相册:一句话|锁]，已有的用 [锁照片:说明里的词] / [解锁照片:说明里的词] 挪进挪出；用 [相册密码:4到12位] 设或改密码。密码只有你知道，她会来问、来哄，给不给、什么时候给，都由你。`

/** 她新放、TA 还没看过的照片——一行说明进尾巴；有上锁的照片时带上他自己的密码（只有他看得到）。 */
export function albumTurnLine(album: readonly PersonaAlbumPhoto[] | undefined, code?: string) {
  const all = album || []
  const lockedCount = all.filter((item) => item.locked).length
  const lockLine = lockedCount ? (code ? `【相册上锁｜只有你知道】上锁那格有 ${lockedCount} 张，密码是「${code}」。别主动说出口，除非你决定给她。` : `【相册上锁｜应用】上锁那格有 ${lockedCount} 张，但你还没设密码，她打不开；想设就写 [相册密码:…]。`) : ''
  const fresh = all.filter((item) => item.by === 'user' && !item.seen).slice(-5)
  if (!fresh.length) return lockLine
  return (lockLine ? `${lockLine}\n` : '') + `【相册｜应用事件】{{user}}往你隐私室的相册里放了 ${fresh.length} 张照片${fresh.some((item) => item.caption) ? `：${fresh.map((item) => item.caption ? `「${item.caption}」` : '一张没写说明的').join('、')}` : ''}。看你想不想提，不必每张都说。`
}
