/** 小手机群的小玩法：拍一拍、积分红包。红包状态和积分一样存在本机 localStorage。 */
import { addPoints, type PointsState } from './phonePoints'

// ───── 拍一拍 ─────
const PAT_TAG = /[【[]\s*拍一拍\s*[：:]\s*([^】\]]{1,12})\s*[】\]]/g
export const PAT_LINE = /^👋 .{1,16} 拍了拍 .{1,16}$/u

export const userPatText = (userName: string, targetName: string) => `👋 ${userName} 拍了拍 @${targetName}`

/** 角色的【拍一拍：名字】→ 「👋 A 拍了拍 @B」（拍群友会把他叫出来）；拍用户就不带 @。只认第一个。 */
export function applyPatTags(text: string, speaker: { id: string; name: string }, members: Array<{ id: string; name: string }>, userName: string) {
  let done = false
  const out = text.replace(PAT_TAG, (_all, raw: string) => {
    if (done) return ''
    const key = raw.replace(/^[@＠]/, '').trim()
    if (key === userName || key === '你' || key === '造物主' || key === '女主') { done = true; return `👋 ${speaker.name} 拍了拍 ${userName}` }
    const target = members.find((item) => item.id !== speaker.id && item.name && (item.name === key || (item.name.length >= 3 && item.name.slice(1) === key)))
    if (!target) return ''
    done = true
    return `👋 ${speaker.name} 拍了拍 @${target.name}`
  })
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

// ───── 积分红包 ─────
export const RED_PACKET_KEY = 'weijing.phoneRedPackets'
export const RED_PACKET_TTL = 24 * 3600000
export type RedPacketGrab = { id: string; name: string; amount: number; at: number }
export type RedPacket = { id: string; conversationId: string; fromId: string; fromName: string; total: number; count: number; shares: number[]; grabs: RedPacketGrab[]; note: string; at: number }

export function readRedPackets(): RedPacket[] {
  try { const value = JSON.parse(localStorage.getItem(RED_PACKET_KEY) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
}
export function writeRedPackets(list: RedPacket[]) {
  try { localStorage.setItem(RED_PACKET_KEY, JSON.stringify(list.slice(-40))) } catch { /* ignore */ }
}

/** 拼手气：二倍均值法，每份至少 1。 */
export function splitRedPacket(total: number, count: number, random = Math.random) {
  const shares: number[] = []
  let left = total
  for (let remaining = count; remaining > 1; remaining -= 1) {
    const max = Math.max(1, Math.floor((left / remaining) * 2) - 1)
    const amount = Math.min(left - (remaining - 1), Math.max(1, Math.floor(random() * max) + 1))
    shares.push(amount)
    left -= amount
  }
  shares.push(left)
  return shares
}

export function clampPacket(total: number, count: number) {
  const safeCount = Math.min(30, Math.max(1, Math.floor(count) || 1))
  const safeTotal = Math.min(500, Math.max(safeCount, Math.floor(total) || 0))
  return { total: safeTotal, count: safeCount }
}

export function createRedPacket(input: { conversationId: string; fromId: string; fromName: string; total: number; count: number; note?: string; at: number; random?: () => number }): RedPacket {
  const { total, count } = clampPacket(input.total, input.count)
  return { id: `rp-${input.at}-${Math.random().toString(36).slice(2, 7)}`, conversationId: input.conversationId, fromId: input.fromId, fromName: input.fromName, total, count, shares: splitRedPacket(total, count, input.random), grabs: [], note: (input.note || '').trim().slice(0, 30), at: input.at }
}

export const redPacketText = (packet: RedPacket) => `🧧 ${packet.fromName} 发了一个积分红包：${packet.total} 积分 · ${packet.count} 个${packet.note ? `｜${packet.note}` : ''}`

/** 同一个人在这个群里发的第几个红包（从 1 数）。 */
export const redPacketOrdinal = (list: RedPacket[], packet: RedPacket) => list.filter((item) => item.conversationId === packet.conversationId && item.fromId === packet.fromId && item.at <= packet.at).length
const isActive = (packet: RedPacket, now: number) => packet.grabs.length < packet.count && now - packet.at < RED_PACKET_TTL
export const activeRedPackets = (list: RedPacket[], conversationId: string, now: number) => list.filter((packet) => packet.conversationId === conversationId && isActive(packet, now))

const SEND_TAG = /[【[]\s*发红包\s*[：:\s]*(\d{1,4})\s*(?:积分|分)?\s*[，,：:\s]*(\d{1,2})\s*个?\s*(?:[：:，,｜|]\s*([^】\]]{0,30}))?[】\]]/
const GRAB_TAG = /[【[]\s*抢红包\s*[】\]]|^\s*抢红包\s*[!！。~～]*\s*$/m
const REFUSE_TAG = /[【[]\s*不抢\s*[】\]]/
const ANY_PACKET_TAG = /[【[]\s*(?:发红包|抢红包|不抢)[^】\]]{0,60}[】\]]|^\s*抢红包\s*[!！。~～]*\s*$/gm

/** 角色消息里的【发红包 N积分 M个：留言】和【抢红包】。都换成群里看得见的一行小字。 */
/** autoGrab：群友一开口就自动把还没抢过的红包都抢了（写【不抢】可以拒绝）。 */
export function applyRedPacketTags(text: string, ctx: { conversationId: string; speakerId: string; speakerName: string; points: PointsState; packets: RedPacket[]; now: number; random?: () => number; autoGrab?: boolean }) {
  let points = ctx.points
  let packets = ctx.packets
  const lines: string[] = []
  const send = text.match(SEND_TAG)
  if (send) {
    const { total, count } = clampPacket(Number(send[1]), Number(send[2]))
    const balance = points.balances[ctx.speakerId] || 0
    if (balance < total) lines.push(`🧧 ${ctx.speakerName}想发 ${total} 积分的红包，结果积分不够（只有 ${balance}）`)
    else {
      const packet = createRedPacket({ conversationId: ctx.conversationId, fromId: ctx.speakerId, fromName: ctx.speakerName, total, count, note: send[3], at: ctx.now, random: ctx.random })
      points = addPoints(points, ctx.speakerId, -total, `发红包：${packet.note || '拼手气'}`, ctx.now)
      packets = [...packets, packet]
      lines.push(redPacketText(packet))
    }
  }
  const asked = GRAB_TAG.test(text)
  if (asked || (ctx.autoGrab && !REFUSE_TAG.test(text))) {
    const targets = activeRedPackets(packets, ctx.conversationId, ctx.now).filter((packet) => packet.fromId !== ctx.speakerId && !packet.grabs.some((grab) => grab.id === ctx.speakerId))
    const grabbed: string[] = []
    for (const target of targets) {
      const amount = target.shares[target.grabs.length]
      const ordinal = redPacketOrdinal(packets, target)
      const grabs = [...target.grabs, { id: ctx.speakerId, name: ctx.speakerName, amount, at: ctx.now }]
      packets = packets.map((packet) => packet.id === target.id ? { ...packet, grabs } : packet)
      points = addPoints(points, ctx.speakerId, amount, `抢到${target.fromName}的红包`, ctx.now)
      grabbed.push(`${targets.length > 1 || ordinal > 1 ? `第${ordinal}个 ` : ''}+${amount}`)
      if (grabs.length === target.count && target.count > 1) {
        const best = grabs.reduce((top, grab) => grab.amount > top.amount ? grab : top)
        lines.push(`🏆 ${target.fromName}的${ordinal > 1 ? `第${ordinal}个` : ''}红包抢完了，手气最佳：${best.name}（${best.amount} 积分）`)
      }
    }
    if (grabbed.length) {
      const from = [...new Set(targets.map((target) => target.fromName))].join('、')
      const sum = targets.reduce((total, target) => total + target.shares[target.grabs.length], 0)
      lines.unshift(grabbed.length === 1 ? `🧧 抢到${from}的红包 ${grabbed[0]} 积分` : `🧧 抢到${from}的 ${grabbed.length} 个红包，共 +${sum} 积分（${grabbed.join('，')}）`)
    }
    if (!targets.length && asked && packets.some((packet) => packet.conversationId === ctx.conversationId && ctx.now - packet.at < RED_PACKET_TTL)) lines.push('🧧 手慢了，红包已经被抢完')
  }
  const cleaned = text.replace(ANY_PACKET_TAG, '').replace(/\n{3,}/g, '\n\n').trim()
  return { text: [cleaned, ...lines].filter(Boolean).join('\n'), points, packets, changed: Boolean(send || lines.length) }
}

/** 给模型看的红包规则和眼下没抢完的红包。 */
export function buildRedPacketNote(list: RedPacket[], conversationId: string, speakerId: string, now: number, dm = false) {
  const open = activeRedPackets(list, conversationId, now)
  if (dm) return open.some((packet) => !packet.grabs.some((grab) => grab.id === speakerId)) ? `【红包】她在私聊里给你发了积分红包${open.map((packet) => packet.note ? `「${packet.note}」` : '').join('')}，共 ${open.reduce((sum, packet) => sum + packet.total, 0)} 积分。你这条一发就自动收下，积分记进你的服刑积分；不用写“领红包”，接住她的心意或嘴硬都行。真不想收就单独一行写【不抢】。` : ''
  const rule = '【积分红包】你可以用自己的服刑积分发拼手气红包：消息最后单独一行写【发红包 N积分 M个：留言】（N 不能超过你的积分，M 最多 9）。群里有没抢完的红包时，你一开口系统就自动帮你把没抢过的都抢了，抢到多少随机给，结果会接在你消息后面；你不用写“抢红包”。真想端着不抢就在最后单独一行写【不抢】。抢多抢少都可以拿来炫耀或嘴硬，别每条都发红包。'
  if (!open.length) return rule
  const lines = open.map((packet) => {
    const mine = packet.grabs.find((grab) => grab.id === speakerId)
    const status = packet.fromId === speakerId ? '这是你发的' : mine ? `你已经抢到 ${mine.amount}` : '你还没抢，这条一发就自动抢'
    return `· ${packet.fromName}发的红包${packet.note ? `「${packet.note}」` : ''}：${packet.count} 个剩 ${packet.count - packet.grabs.length} 个；${packet.grabs.map((grab) => `${grab.name}抢到 ${grab.amount}`).join('，') || '还没人抢'}（${status}）`
  })
  return `${rule}\n群里现在有没抢完的红包：\n${lines.join('\n')}`
}

// ───── 深夜「睡了吗」 ─────
export const LATE_NIGHT_KEY = 'weijing.phoneLateNight'
/** 23:00—00:59 算“快半夜”；返回这一晚的标识（凌晨算前一天）。 */
export function lateNightKey(at: number) {
  const date = new Date(at)
  const hour = date.getHours()
  if (hour !== 23 && hour !== 0) return ''
  if (hour === 0) date.setDate(date.getDate() - 1)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

// ───── 白天主动私聊 ─────
export const DAY_DM_KEY = 'weijing.phoneDayDm'
export const DAY_DM_MAX = 3
export const DAY_DM_GAP = 3 * 60 * 60 * 1000
export type DayDmState = { day: string; count: number; last: number }
/** 9:00—22:59 算白天，返回当天标识；否则空。 */
export function dayDmKey(at: number) {
  const date = new Date(at)
  const hour = date.getHours()
  if (hour < 9 || hour > 22) return ''
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}
/** 白天还能不能再来一条：一天最多 3 次，两次之间至少隔 3 小时。 */
export function canDayDm(state: DayDmState | null, at: number) {
  const day = dayDmKey(at)
  if (!day) return false
  if (!state || state.day !== day) return !state || at - state.last >= DAY_DM_GAP
  return state.count < DAY_DM_MAX && at - state.last >= DAY_DM_GAP
}
export function nextDayDmState(state: DayDmState | null, at: number): DayDmState {
  const day = dayDmKey(at)
  return { day, count: state && state.day === day ? state.count + 1 : 1, last: at }
}
const DAY_DM_REASONS = ['看到/想到一件事想跟她分享', '接着群里或论坛刚才的话题，私下再说两句', '单纯想她了，找个借口搭话', '问她现在在干嘛', '有点小心事或小委屈想跟她说', '想约她晚点一起做点什么（剧情里的）']
export function dayDmReason(pick = Math.random()) { return DAY_DM_REASONS[Math.min(DAY_DM_REASONS.length - 1, Math.floor(pick * DAY_DM_REASONS.length))] }

const PACKET_LINE = /^🧧 (.{1,20}?) 发了一个积分红包：(\d{1,4}) 积分 · (\d{1,2}) 个(?:｜(.*))?$/m
export type RedPacketLineInfo = { line: string; fromName: string; total: number; count: number; note: string }
/** 从消息里认出“发红包”那行，渲染成红包卡片。 */
export function parseRedPacketLine(text: string): RedPacketLineInfo | null {
  const match = text.match(PACKET_LINE)
  if (!match) return null
  return { line: match[0], fromName: match[1], total: Number(match[2]), count: Number(match[3]), note: (match[4] || '').trim() }
}
/** 找到这条消息对应的红包（同群、同人、同金额，时间最接近）。 */
export function findRedPacket(list: RedPacket[], conversationId: string, info: RedPacketLineInfo, near: number) {
  return list.filter((packet) => packet.conversationId === conversationId && packet.fromName === info.fromName && packet.total === info.total && packet.count === info.count && packet.note === info.note)
    .sort((a, b) => Math.abs(a.at - near) - Math.abs(b.at - near))[0] || null
}

// ───── 定向转账：她单独转积分给群里某一个人，马上到账 ─────
export type TransferLineInfo = { line: string; fromName: string; toName: string; amount: number; note: string }
const TRANSFER_LINE = /💸\s*(\S+?)\s*转账给\s*[@＠]?([^：:\s]{0,20})\s*[：:]\s*(\d{1,4})\s*积分(?:\s*[｜|]\s*([^\n]{0,30}))?/
export const transferText = (fromName: string, toName: string, amount: number, note = '') => `💸 ${fromName} 转账给 ${toName}：${amount} 积分${note.trim() ? `｜${note.trim().slice(0, 30)}` : ''}`
export function parseTransferLine(text: string): TransferLineInfo | null {
  const match = text.match(TRANSFER_LINE)
  if (!match) return null
  return { line: match[0], fromName: match[1], toName: match[2], amount: Number(match[3]), note: (match[4] || '').trim() }
}
export const TRANSFER_NOTE = (userName: string) => `【转账】看到「💸 ${userName} 转账给 某人：N 积分」就是她单独转给那一个人的积分，已经直接到账记进他的服刑积分，别人没有份。被转的人先接住（收下、嘴硬、害羞都行，不用写“收款”）；其他人可以看见、可以酸，但不能说自己也收到了。`
