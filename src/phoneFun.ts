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
  const safeCount = Math.min(9, Math.max(1, Math.floor(count) || 1))
  const safeTotal = Math.min(200, Math.max(safeCount, Math.floor(total) || 0))
  return { total: safeTotal, count: safeCount }
}

export function createRedPacket(input: { conversationId: string; fromId: string; fromName: string; total: number; count: number; note?: string; at: number; random?: () => number }): RedPacket {
  const { total, count } = clampPacket(input.total, input.count)
  return { id: `rp-${input.at}-${Math.random().toString(36).slice(2, 7)}`, conversationId: input.conversationId, fromId: input.fromId, fromName: input.fromName, total, count, shares: splitRedPacket(total, count, input.random), grabs: [], note: (input.note || '').trim().slice(0, 30), at: input.at }
}

export const redPacketText = (packet: RedPacket) => `🧧 ${packet.fromName} 发了一个积分红包：${packet.total} 积分 · ${packet.count} 个${packet.note ? `｜${packet.note}` : ''}`

const isActive = (packet: RedPacket, now: number) => packet.grabs.length < packet.count && now - packet.at < RED_PACKET_TTL
export const activeRedPackets = (list: RedPacket[], conversationId: string, now: number) => list.filter((packet) => packet.conversationId === conversationId && isActive(packet, now))

const SEND_TAG = /[【[]\s*发红包\s*[：:\s]*(\d{1,4})\s*(?:积分|分)?\s*[，,：:\s]*(\d{1,2})\s*个?\s*(?:[：:，,｜|]\s*([^】\]]{0,30}))?[】\]]/
const GRAB_TAG = /[【[]\s*抢红包\s*[】\]]/
const ANY_PACKET_TAG = /[【[]\s*(?:发红包|抢红包)[^】\]]{0,60}[】\]]/g

/** 角色消息里的【发红包 N积分 M个：留言】和【抢红包】。都换成群里看得见的一行小字。 */
export function applyRedPacketTags(text: string, ctx: { conversationId: string; speakerId: string; speakerName: string; points: PointsState; packets: RedPacket[]; now: number; random?: () => number }) {
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
  if (GRAB_TAG.test(text)) {
    const target = activeRedPackets(packets, ctx.conversationId, ctx.now).find((packet) => packet.fromId !== ctx.speakerId && !packet.grabs.some((grab) => grab.id === ctx.speakerId))
    if (target) {
      const amount = target.shares[target.grabs.length]
      const grabs = [...target.grabs, { id: ctx.speakerId, name: ctx.speakerName, amount, at: ctx.now }]
      packets = packets.map((packet) => packet.id === target.id ? { ...packet, grabs } : packet)
      points = addPoints(points, ctx.speakerId, amount, `抢到${target.fromName}的红包`, ctx.now)
      lines.push(`🧧 抢到${target.fromName}的红包 +${amount} 积分`)
      if (grabs.length === target.count && target.count > 1) {
        const best = grabs.reduce((top, grab) => grab.amount > top.amount ? grab : top)
        lines.push(`🏆 红包抢完了，手气最佳：${best.name}（${best.amount} 积分）`)
      }
    } else if (packets.some((packet) => packet.conversationId === ctx.conversationId && ctx.now - packet.at < RED_PACKET_TTL)) lines.push('🧧 手慢了，红包已经被抢完')
  }
  const cleaned = text.replace(ANY_PACKET_TAG, '').replace(/\n{3,}/g, '\n\n').trim()
  return { text: [cleaned, ...lines].filter(Boolean).join('\n'), points, packets, changed: Boolean(send || lines.length) }
}

/** 给模型看的红包规则和眼下没抢完的红包。 */
export function buildRedPacketNote(list: RedPacket[], conversationId: string, speakerId: string, now: number) {
  const open = activeRedPackets(list, conversationId, now)
  const rule = '【积分红包】你可以用自己的服刑积分发拼手气红包：消息最后单独一行写【发红包 N积分 M个：留言】（N 不能超过你的积分，M 最多 9）。群里有没抢完的红包时，想抢就单独一行写【抢红包】，抢到多少系统随机给。抢多抢少都可以拿来炫耀或嘴硬，别每条都发红包。'
  if (!open.length) return rule
  const lines = open.map((packet) => {
    const mine = packet.grabs.find((grab) => grab.id === speakerId)
    const status = packet.fromId === speakerId ? '这是你发的' : mine ? `你已经抢到 ${mine.amount}` : '你还没抢'
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
