import type { Message } from './conversationLifecycle'

const pad = (value: number) => String(value).padStart(2, '0')
/** 消息 id 就是发送时的毫秒时间戳（nextMessageId 取 max(Date.now(), …)）。太早或太晚的当作没有时间。 */
export function messageTime(message: Pick<Message, 'id'>, now = Date.now()) {
  const id = message.id
  return Number.isFinite(id) && id > 1_500_000_000_000 && id < now + 86_400_000 ? Math.floor(id) : undefined
}

const dayStart = (at: number) => { const date = new Date(at); date.setHours(0, 0, 0, 0); return date.getTime() }

/** 微信式时间：今天 12:08 / 昨天 22:09 / 星期二 22:09 / 10月3日 22:09 / 2025年10月3日 22:09 */
export function phoneTimeLabel(at: number, now = Date.now()) {
  const date = new Date(at)
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const days = Math.round((dayStart(now) - dayStart(at)) / 86_400_000)
  if (days <= 0) return clock
  if (days === 1) return `昨天 ${clock}`
  if (days < 7) return `星期${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]} ${clock}`
  if (date.getFullYear() === new Date(now).getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${clock}`
}

/** 聊天里要不要在这条前面显示时间：第一条，或距上一条 ≥ gap 分钟。 */
export function showPhoneTimeDivider(previous: Pick<Message, 'id'> | undefined, current: Pick<Message, 'id'>, gapMinutes = 5, now = Date.now()) {
  const at = messageTime(current, now)
  if (at === undefined) return false
  const before = previous ? messageTime(previous, now) : undefined
  return before === undefined || at - before >= gapMinutes * 60_000
}

/** 给模型看的时间戳前缀；距上一条 ≥ 20 分钟才加，免得每句都带。 */
export const PHONE_TIME_PREFIX = /^\s*\[发送于[^\]\n]{0,30}\]\s*/gm
export function phonePromptTimePrefix(at: number) {
  const date = new Date(at)
  return `[发送于 ${date.getMonth() + 1}月${date.getDate()}日 星期${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}] `
}

export function phoneNowLabel(now: Date) {
  const hour = now.getHours()
  const period = hour < 5 ? '深夜' : hour < 9 ? '早上' : hour < 11 ? '上午' : hour < 13 ? '中午' : hour < 18 ? '下午' : hour < 23 ? '晚上' : '深夜'
  return `${now.getMonth() + 1}月${now.getDate()}日 星期${['日', '一', '二', '三', '四', '五', '六'][now.getDay()]} ${pad(hour)}:${pad(now.getMinutes())}（${period}）`
}

/** v323：一段对话最后一次真的有人说话的时间（消息 id 即时间戳），没有就退回 updatedAt。 */
export function lastPlayedAt(conversation: { messages: readonly Pick<Message, 'id' | 'phoneNotice'>[]; updatedAt?: number }, now = Date.now()) {
  let last = 0
  for (const message of conversation.messages) { if (message.phoneNotice) continue; const at = messageTime(message, now); if (at && at > last) last = at }
  return last || conversation.updatedAt || 0
}

/** v323：给模型看的日期 + 隔了多久：2026-11-20 21:30（3天前）。 */
export function agoLabel(at: number, now = Date.now()) {
  if (!at) return ''
  const date = new Date(at)
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  const diff = Math.max(0, now - at)
  const ago = diff < 3_600_000 ? '不到1小时前' : diff < 86_400_000 ? `${Math.floor(diff / 3_600_000)}小时前` : diff < 30 * 86_400_000 ? `${Math.floor(diff / 86_400_000)}天前` : `${Math.floor(diff / (30 * 86_400_000))}个多月前`
  return `${stamp}（${ago}）`
}
