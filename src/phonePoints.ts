/** 小手机“服刑积分”：每日签到、角色自报加减分、兑换特权、造物主裁决。全部存在本机 localStorage。 */
export const PHONE_POINTS_KEY = 'weijing.phonePoints'
export const PHONE_POINTS_EVENT = 'weijing-phone-points'
export const CHECKIN_POINTS = 10
export const SELF_CLAIM_MAX = 5

export type PointsLog = { id: string; delta: number; reason: string; at: number }
export type PointsState = { balances: Record<string, number>; lastCheckin: Record<string, string>; log: PointsLog[] }
export const EMPTY_POINTS: PointsState = { balances: {}, lastCheckin: {}, log: [] }

export const POINT_REWARDS = [
  { name: '私聊优先权', cost: 30 },
  { name: '匿名发帖', cost: 20 },
  { name: '论坛置顶', cost: 40 },
  { name: '免于公开处刑', cost: 50 },
  { name: '剧情减刑申请', cost: 80 },
] as const

export function readPoints(): PointsState {
  try { return { ...EMPTY_POINTS, ...(JSON.parse(localStorage.getItem(PHONE_POINTS_KEY) || 'null') || {}) } } catch { return EMPTY_POINTS }
}
export function writePoints(state: PointsState) {
  try { localStorage.setItem(PHONE_POINTS_KEY, JSON.stringify({ ...state, log: state.log.slice(-600) })) } catch { /* ignore */ }
  window.dispatchEvent(new Event(PHONE_POINTS_EVENT))
}

export const dayKey = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }

export function addPoints(state: PointsState, id: string, delta: number, reason: string, at: number): PointsState {
  return { ...state, balances: { ...state.balances, [id]: (state.balances[id] || 0) + delta }, log: [...state.log, { id, delta, reason, at }] }
}

const POINTS_TAG = /[【[]\s*积分\s*([+＋\-－−]?\s*\d{1,3})\s*(?:[：:，,]\s*([^】\]]{0,40}))?[】\]]/g
const REDEEM_TAG = /[【[]\s*兑换\s*[：:]?\s*([^】\]]{1,20})[】\]]/g

/**
 * 处理一条角色消息：当天第一次说话自动签到；【积分 +N：理由】自报（加分最多 +5，扣分不限但最多 -50）；
 * 【兑换：特权名】扣分兑换。标签在消息里换成一行可见的小字，群友都看得到。
 */
export function applyMessagePoints(state: PointsState, id: string, text: string, at: number) {
  let next = state
  const redeemed: string[] = []
  let out = text.replace(POINTS_TAG, (_all, raw: string, reason?: string) => {
    const value = Number(raw.replace(/\s/g, '').replace(/[＋]/, '+').replace(/[－−]/, '-'))
    if (!Number.isFinite(value) || value === 0) return ''
    const delta = value > 0 ? Math.min(value, SELF_CLAIM_MAX) : Math.max(value, -50)
    const why = (reason || '').trim() || (delta > 0 ? '自报加分' : '自报扣分')
    next = addPoints(next, id, delta, why, at)
    return `⚖️ 积分 ${delta > 0 ? '+' : ''}${delta}｜${why}`
  })
  out = out.replace(REDEEM_TAG, (_all, raw: string) => {
    const reward = POINT_REWARDS.find((item) => raw.includes(item.name) || item.name.includes(raw.trim()))
    if (!reward) return ''
    const balance = next.balances[id] || 0
    if (balance < reward.cost) return `🎫 兑换「${reward.name}」失败：积分不够（${balance}/${reward.cost}）`
    next = addPoints(next, id, -reward.cost, `兑换：${reward.name}`, at)
    redeemed.push(reward.name)
    return `🎫 兑换「${reward.name}」-${reward.cost}`
  })
  if (next.lastCheckin[id] !== dayKey(at)) {
    next = addPoints({ ...next, lastCheckin: { ...next.lastCheckin, [id]: dayKey(at) } }, id, CHECKIN_POINTS, '每日签到', at)
    out = `${out.trim()}\n📋 今日签到 +${CHECKIN_POINTS}`
  }
  return { state: next, text: out.replace(/\n{3,}/g, '\n\n').trim(), redeemed }
}

/** 给模型看的积分规则和当前排名。 */
export function buildPointsNote(state: PointsState, people: Array<{ id: string; name: string }>, userName: string) {
  const ranking = people.map((person) => ({ ...person, points: state.balances[person.id] || 0 })).sort((a, b) => b.points - a.points)
  return `【整改中心·服刑积分】${userName}是造物主兼监狱长，你们是被她拉进来“整改”的角色，靠积分减刑。
规则：每天第一次发言自动签到 +10（系统会记，不用你写）；主动认错、提醒造物主吃饭喝水、翻旧账攻击狱友这类表现，可以在消息最后单独一行自报【积分 +N：理由】（每次最多 +5，别每条都报）；被抓包、私聊争宠被转发公开、剧情里再犯旧罪，要自己老实写【积分 -N：理由】；锁造物主手机由造物主看效果酌情加减。
积分可兑换（消息最后单独一行写【兑换：名称】）：${POINT_REWARDS.map((item) => `${item.name} ${item.cost}`).join('、')}。
当前积分：${ranking.map((item) => `${item.name} ${item.points}`).join('，') || '大家都是 0'}。可以拿排名互相嘲讽。`
}

/** 今天（本机日期）每人净得多少积分，取前 N 名；没人得分就空。 */
export function todayTopPoints(state: PointsState, people: Array<{ id: string; name: string }>, at: number, limit = 3) {
  const today = dayKey(at)
  const totals = new Map<string, number>()
  for (const entry of state.log) if (dayKey(entry.at) === today) totals.set(entry.id, (totals.get(entry.id) || 0) + entry.delta)
  return people.map((person) => ({ ...person, points: totals.get(person.id) || 0 })).filter((item) => item.points > 0).sort((a, b) => b.points - a.points).slice(0, limit)
}
