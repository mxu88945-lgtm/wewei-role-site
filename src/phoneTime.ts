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
