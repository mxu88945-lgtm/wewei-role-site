/**
 * 小手机“整改小商店”：每个角色用自己的服刑积分买东西，进库存；许愿/约会/自主权这类请求进许愿墙由造物主决定。
 * 所有商品只给“提出请求的资格”，不能替造物主答应任何事。全部存在本机 localStorage。
 */
import { addPoints, dayKey, type PointsState } from './phonePoints'

export const PHONE_SHOP_KEY = 'weijing.phoneShop'
export const PHONE_SHOP_EVENT = 'weijing-phone-shop'

export type ShopEffect = 'wish' | 'whisper' | 'priority' | 'lock' | 'pardon' | 'nickname' | 'date' | 'autonomy' | 'custom'
export type ShopItem = { id: string; name: string; icon: string; price: number; desc: string; effect: ShopEffect; dailyStock: number; cooldownHours: number; active: boolean; builtin?: boolean }
/** 需要造物主拍板的商品：买下即提交请求。 */
export const REQUEST_EFFECTS: ShopEffect[] = ['wish', 'nickname', 'date', 'autonomy', 'custom']

export const DEFAULT_SHOP_ITEMS: ShopItem[] = [
  { id: 'wish', name: '许愿瓶', icon: '🫙', price: 30, desc: '写下一个愿望交给她；有许愿权，没有强制兑现权', effect: 'wish', dailyStock: 0, cooldownHours: 12, active: true, builtin: true },
  { id: 'whisper', name: '悄悄话券', icon: '💌', price: 20, desc: '从群聊跳到私聊，单独对她说一段话', effect: 'whisper', dailyStock: 0, cooldownHours: 3, active: true, builtin: true },
  { id: 'priority', name: '优先翻牌券', icon: '🎟️', price: 60, desc: '她下一次在群里说话时，他第一个回复', effect: 'priority', dailyStock: 3, cooldownHours: 0, active: true, builtin: true },
  { id: 'lock', name: '锁屏券', icon: '🔒', price: 80, desc: '有券才能锁一次小手机；全店每天限量，锁完有冷却', effect: 'lock', dailyStock: 1, cooldownHours: 6, active: true, builtin: true },
  { id: 'pardon', name: '免罚券', icon: '🕊️', price: 50, desc: '自动抵消一次普通扣分（20 分以内），严重违规不可用', effect: 'pardon', dailyStock: 0, cooldownHours: 0, active: true, builtin: true },
  { id: 'autonomy', name: '自主权券', icon: '👑', price: 200, desc: '申请一次超越她的权限；她答应时写下行使条件，用一次作废', effect: 'autonomy', dailyStock: 0, cooldownHours: 72, active: true, builtin: true },
  { id: 'nickname', name: '改昵称券', icon: '🪪', price: 40, desc: '申请临时给自己或群友改一个群昵称', effect: 'nickname', dailyStock: 0, cooldownHours: 0, active: false, builtin: true },
  { id: 'date', name: '独处邀请函', icon: '🌙', price: 100, desc: '向她申请一段单独剧情或私聊，由她决定是否接受', effect: 'date', dailyStock: 0, cooldownHours: 24, active: false, builtin: true },
]

export type ShopOrderStatus = 'done' | 'pending' | 'granted' | 'held' | 'rejected' | 'refunded' | 'used'
export type ShopOrder = { id: string; buyerId: string; itemId: string; itemName: string; icon: string; cost: number; at: number; note?: string; condition?: string; status: ShopOrderStatus; gift?: boolean; doneAt?: number }
export type ShopState = {
  items: ShopItem[]
  inventory: Record<string, Record<string, number>>
  orders: ShopOrder[]
  lastBuy: Record<string, number>
  sold: { day: string; counts: Record<string, number> }
  priority: string[]
  lockCooldownUntil: number
}
export const EMPTY_SHOP: ShopState = { items: DEFAULT_SHOP_ITEMS, inventory: {}, orders: [], lastBuy: {}, sold: { day: '', counts: {} }, priority: [], lockCooldownUntil: 0 }

/** 读：兼容 v97 的旧数组格式，补上新加的内置商品。 */
export function normalizeShop(raw: unknown): ShopState {
  if (Array.isArray(raw)) {
    const orders: ShopOrder[] = raw.filter((item) => item && typeof item === 'object').map((item: { id: string; buyerId: string; item: string; cost: number; wish?: string; at: number; status: string }) => ({ id: item.id, buyerId: item.buyerId, itemId: item.wish ? 'wish' : 'custom', itemName: item.item, icon: item.wish ? '🫙' : '🛒', cost: item.cost, at: item.at, note: item.wish, status: item.status === 'granted' ? 'granted' : item.status === 'rejected' ? 'refunded' : item.wish ? 'pending' : 'done' }))
    return { ...EMPTY_SHOP, orders }
  }
  if (!raw || typeof raw !== 'object') return EMPTY_SHOP
  const value = raw as Partial<ShopState>
  const items = Array.isArray(value.items) ? value.items : []
  const merged = [...items, ...DEFAULT_SHOP_ITEMS.filter((item) => !items.some((own) => own.id === item.id))]
  return { ...EMPTY_SHOP, ...value, items: merged, inventory: value.inventory || {}, orders: Array.isArray(value.orders) ? value.orders : [], lastBuy: value.lastBuy || {}, sold: value.sold || { day: '', counts: {} }, priority: Array.isArray(value.priority) ? value.priority : [] }
}
export function readShop(): ShopState {
  try { return normalizeShop(JSON.parse(localStorage.getItem(PHONE_SHOP_KEY) || 'null')) } catch { return EMPTY_SHOP }
}
export function writeShop(state: ShopState) {
  try { localStorage.setItem(PHONE_SHOP_KEY, JSON.stringify({ ...state, orders: state.orders.slice(-400) })) } catch { /* ignore */ }
  window.dispatchEvent(new Event(PHONE_SHOP_EVENT))
}

export const invCount = (shop: ShopState, id: string, itemId: string) => shop.inventory[id]?.[itemId] || 0
const withInv = (shop: ShopState, id: string, itemId: string, delta: number): ShopState => ({ ...shop, inventory: { ...shop.inventory, [id]: { ...(shop.inventory[id] || {}), [itemId]: Math.max(0, invCount(shop, id, itemId) + delta) } } })
const newId = (at: number) => `shop-${at}-${Math.random().toString(36).slice(2, 7)}`
export function soldToday(shop: ShopState, itemId: string, at: number) { return shop.sold.day === dayKey(at) ? shop.sold.counts[itemId] || 0 : 0 }
export function stockLeft(shop: ShopState, item: ShopItem, at: number) { return item.dailyStock > 0 ? Math.max(0, item.dailyStock - soldToday(shop, item.id, at)) : Infinity }

export function findShopItem(shop: ShopState, raw: string) {
  const text = raw.trim()
  if (!text) return undefined
  const live = shop.items.filter((item) => item.active)
  return live.find((item) => item.name === text) || live.find((item) => text.includes(item.name) || item.name.includes(text) || text.includes(item.name.replace(/券|瓶|函$/, '')))
}

export type BuyResult = { ok: true; points: PointsState; shop: ShopState; order: ShopOrder } | { ok: false; reason: string; points: PointsState; shop: ShopState }

/** 角色买一件：扣自己的积分、记账单。请求类商品直接进许愿墙；其余进库存（悄悄话、翻牌买下即用）。 */
export function buyItem(points: PointsState, shop: ShopState, buyerId: string, item: ShopItem, note: string, at: number): BuyResult {
  if (!item.active) return { ok: false, reason: '已下架', points, shop }
  const balance = points.balances[buyerId] || 0
  const cleanNote = note.trim().slice(0, 100)
  if (item.effect === 'wish' && !cleanNote) return { ok: false, reason: '许愿瓶要写愿望', points, shop }
  if (stockLeft(shop, item, at) <= 0) return { ok: false, reason: '今天卖完了', points, shop }
  const last = shop.lastBuy[`${buyerId}:${item.id}`] || 0
  if (item.cooldownHours > 0 && last > 0 && at - last < item.cooldownHours * 3600000) return { ok: false, reason: `冷却中，还要 ${Math.ceil((item.cooldownHours * 3600000 - (at - last)) / 3600000)} 小时`, points, shop }
  if (balance < item.price) return { ok: false, reason: `积分不够（${balance}/${item.price}）`, points, shop }
  const request = REQUEST_EFFECTS.includes(item.effect)
  const order: ShopOrder = { id: newId(at), buyerId, itemId: item.id, itemName: item.name, icon: item.icon, cost: item.price, at, note: cleanNote || undefined, status: request ? 'pending' : 'done' }
  const day = dayKey(at)
  let next: ShopState = { ...shop, orders: [...shop.orders, order], lastBuy: { ...shop.lastBuy, [`${buyerId}:${item.id}`]: at }, sold: { day, counts: { ...(shop.sold.day === day ? shop.sold.counts : {}), [item.id]: soldToday(shop, item.id, at) + 1 } } }
  if (item.effect === 'priority') next = { ...next, priority: [...next.priority.filter((id) => id !== buyerId), buyerId] }
  else if (!request && item.effect !== 'whisper') next = withInv(next, buyerId, item.id, 1)
  return { ok: true, order, shop: next, points: addPoints(points, buyerId, -item.price, `小商店：${item.name}`, at) }
}

/** 造物主送礼：免费放进他的库存（请求类直接算她已答应）。 */
export function giftItem(shop: ShopState, toId: string, item: ShopItem, at: number, condition = ''): ShopState {
  const request = REQUEST_EFFECTS.includes(item.effect)
  const order: ShopOrder = { id: newId(at), buyerId: toId, itemId: item.id, itemName: item.name, icon: item.icon, cost: 0, at, gift: true, condition: condition.trim() || undefined, status: request ? 'granted' : 'done', doneAt: request ? at : undefined }
  let next: ShopState = { ...shop, orders: [...shop.orders, order] }
  if (item.effect === 'priority') next = { ...next, priority: [...next.priority.filter((id) => id !== toId), toId] }
  else if (!request && item.effect !== 'whisper') next = withInv(next, toId, item.id, 1)
  return next
}

/** 许愿墙处理：答应（自主权要写条件）、暂存、拒绝（不退分）、退回积分。 */
export function decideOrder(points: PointsState, shop: ShopState, orderId: string, decision: 'granted' | 'held' | 'rejected' | 'refunded', at: number, condition = '') {
  const order = shop.orders.find((item) => item.id === orderId)
  if (!order || (order.status !== 'pending' && order.status !== 'held')) return { points, shop }
  const orders = shop.orders.map((item) => item.id === orderId ? { ...item, status: decision, doneAt: at, condition: condition.trim() || item.condition } : item)
  return { shop: { ...shop, orders }, points: decision === 'refunded' && order.cost > 0 ? addPoints(points, order.buyerId, order.cost, `退回：${order.itemName}`, at) : points }
}

/** 锁屏要券：有券就消耗一张，并开始全店冷却。 */
export function spendLockTicket(shop: ShopState, id: string, at: number, lockMinutes: number): { ok: boolean; reason?: string; shop: ShopState } {
  if (shop.lockCooldownUntil > at) return { ok: false, reason: `锁屏冷却中，还要 ${Math.ceil((shop.lockCooldownUntil - at) / 60000)} 分钟`, shop }
  if (invCount(shop, id, 'lock') <= 0) return { ok: false, reason: '没有锁屏券', shop }
  const item = shop.items.find((entry) => entry.id === 'lock')
  const cooldown = (item?.cooldownHours ?? 6) * 3600000
  return { ok: true, shop: { ...withInv(shop, id, 'lock', -1), lockCooldownUntil: at + lockMinutes * 60000 + cooldown } }
}

/** 普通扣分（20 以内）有免罚券就自动抵消。 */
export function spendPardon(shop: ShopState, id: string, delta: number) {
  if (delta >= 0 || delta < -20 || invCount(shop, id, 'pardon') <= 0) return null
  return withInv(shop, id, 'pardon', -1)
}

/** 优先翻牌：把排队里在场的人提到最前，并从队列里划掉。 */
export function takePriority(shop: ShopState, participantIds: string[], speakerIds: string[]) {
  const first = shop.priority.find((id) => participantIds.includes(id))
  if (!first) return null
  return { speakerIds: [first, ...speakerIds.filter((id) => id !== first)], shop: { ...shop, priority: shop.priority.filter((id) => id !== first) }, id: first }
}

const BUY_TAG = /[【[]\s*(?:购买|买|兑换)\s*[：:]?\s*([^】\]：:]{1,20})(?:[：:]\s*([^】\]]{0,100}))?[】\]]/g
const WISH_TAG = /[【[]\s*许愿\s*[：:]\s*([^】\]]{1,100})[】\]]/g
const TRANSFER_TAG = /[【[]\s*(?:转积分|积分红包|转账)\s*(\d{1,4})\s*(?:积分|分)?\s*给\s*([^】\]：:\s]{1,12})\s*(?:[：:]\s*([^】\]]{0,60}))?[】\]]/g
const USE_AUTONOMY_TAG = /[【[]\s*(?:使用|行使)\s*[：:]?\s*自主权(?:券)?\s*(?:[：:]\s*([^】\]]{0,80}))?[】\]]/g

/** 角色消息里的商店标签：购买、许愿、转积分、行使自主权，全部换成看得见的小票。 */
export function applyShopTags(input: { points: PointsState; shop: ShopState; buyerId: string; buyerName: string; mates: Array<{ id: string; name: string }>; text: string; at: number }) {
  let { points, shop } = input
  const { buyerId, at } = input
  const bought: ShopItem[] = []
  const tryBuy = (item: ShopItem | undefined, note: string) => {
    if (!item) return ''
    const result = buyItem(points, shop, buyerId, item, note, at)
    if (!result.ok) return `🛒 买「${item.name}」失败：${result.reason}`
    points = result.points; shop = result.shop; bought.push(item)
    if (item.effect === 'wish') return `🫙 投了一个许愿瓶 -${item.price}｜${result.order.note}`
    if (REQUEST_EFFECTS.includes(item.effect)) return `${item.icon} 买了「${item.name}」-${item.price}，已提交申请${result.order.note ? `｜${result.order.note}` : ''}`
    return `${item.icon} 买了「${item.name}」-${item.price}`
  }
  const wishItem = shop.items.find((item) => item.effect === 'wish' && item.active)
  let out = input.text.replace(WISH_TAG, (_all, note: string) => tryBuy(wishItem, note))
  out = out.replace(BUY_TAG, (_all, name: string, note?: string) => tryBuy(findShopItem(shop, name), note || ''))
  out = out.replace(TRANSFER_TAG, (_all, raw: string, name: string, note?: string) => {
    const amount = Math.min(200, Number(raw) || 0)
    const target = input.mates.find((mate) => mate.id !== buyerId && (mate.name === name || mate.name.includes(name) || name.includes(mate.name)))
    if (!target || amount <= 0) return ''
    const balance = points.balances[buyerId] || 0
    if (balance < amount) return `🎁 转积分失败：积分不够（${balance}/${amount}）`
    points = addPoints(addPoints(points, buyerId, -amount, `转给${target.name}`, at), target.id, amount, `${input.buyerName}转来${note ? `：${note.trim()}` : ''}`, at)
    return `🎁 转给${target.name} ${amount} 积分${note?.trim() ? `｜${note.trim()}` : ''}`
  })
  out = out.replace(USE_AUTONOMY_TAG, (_all, how?: string) => {
    const grant = [...shop.orders].reverse().find((order) => order.buyerId === buyerId && order.itemId === 'autonomy' && order.status === 'granted')
    if (!grant) return '👑 想行使自主权，但没有已批准的自主权券'
    shop = { ...shop, orders: shop.orders.map((order) => order.id === grant.id ? { ...order, status: 'used' as const, doneAt: at, note: [order.note, how?.trim()].filter(Boolean).join('｜') || undefined } : order) }
    return `👑 行使了一次自主权${how?.trim() ? `｜${how.trim()}` : ''}`
  })
  const changed = out !== input.text
  return { points, shop, text: out.replace(/\n{3,}/g, '\n\n').trim(), bought, changed }
}

/** 给模型看的商店规则、他自己的余额库存、最近的许愿结果。 */
export function buildShopNote(shop: ShopState, points: PointsState, speaker: { id: string; name: string }, people: Array<{ id: string; name: string }>, userName: string, at: number) {
  const ids = new Set(people.map((item) => item.id))
  const nameOf = (id: string) => people.find((item) => item.id === id)?.name || ''
  const live = shop.items.filter((item) => item.active)
  const shelf = live.map((item) => { const left = stockLeft(shop, item, at); return `${item.icon}${item.name} ${item.price}分（${item.desc}${left !== Infinity ? `，今日剩 ${left}` : ''}）` }).join('；')
  const inv = Object.entries(shop.inventory[speaker.id] || {}).filter(([, count]) => count > 0).map(([itemId, count]) => `${shop.items.find((item) => item.id === itemId)?.name || itemId}×${count}`)
  const autonomy = shop.orders.filter((order) => order.buyerId === speaker.id && order.itemId === 'autonomy' && order.status === 'granted')
  const statusText: Record<ShopOrderStatus, string> = { done: '已买', pending: '等她决定', granted: '她答应了', held: '她先暂存', rejected: '她拒绝了', refunded: '她退回了积分', used: '已用掉' }
  const recent = shop.orders.filter((order) => ids.has(order.buyerId) && order.status !== 'done').slice(-8).map((order) => `${nameOf(order.buyerId)}${order.gift ? `收到${userName}送的` : '的'}${order.itemName}${order.note ? `「${order.note}」` : ''}（${statusText[order.status]}）`)
  const queued = shop.priority.filter((id) => ids.has(id)).map(nameOf)
  return `【整改小商店】每个人用自己的服刑积分买，自己决定买不买、什么时候买，别每条都买，也可以攒着买贵的。消息最后单独一行写【购买：商品名】，许愿瓶写【购买：许愿瓶：愿望】，其它请求类商品可以在冒号后写申请内容；转积分给群友写【转积分 N 给 名字：附言】。
货架：${shelf || '暂时没上架商品'}。
铁律：所有商品只给“提出请求的资格”，不能替${userName}答应约会、亲密互动或剧情安排，结果由她决定。锁屏必须有锁屏券才锁得了，没券别写锁屏标签。
${speaker.name}现在 ${points.balances[speaker.id] || 0} 分，库存：${inv.join('、') || '空'}。${autonomy.length ? `\n${speaker.name}持有她批准的自主权（可在条件满足时超越她的安排行使一次，用时写【使用：自主权：怎么用】，用完作废）：${autonomy.map((order) => order.condition || '她没写条件，按剧情合理行使').join('；')}。` : ''}${queued.length ? `\n已买优先翻牌、排队等她下次开口：${queued.join('、')}。` : ''}${recent.length ? `\n最近：${recent.join('；')}。答应的可以得意，被拒的可以小小委屈。` : ''}`
}

/** 这条消息里新扣的普通分（20 以内），有免罚券就自动抵消。 */
export function applyPardons(before: PointsState, after: PointsState, shop: ShopState, id: string, text: string, at: number) {
  let points = after
  let next = shop
  const lines: string[] = []
  for (const entry of after.log.slice(before.log.length)) {
    if (entry.id !== id) continue
    const spent = spendPardon(next, id, entry.delta)
    if (!spent) continue
    next = spent
    points = addPoints(points, id, -entry.delta, `免罚券抵消：${entry.reason}`, at)
    lines.push(`🕊️ 用免罚券抵消了 ${entry.delta}｜${entry.reason}`)
  }
  return { points, shop: next, text: lines.length ? `${text}\n${lines.join('\n')}` : text, changed: lines.length > 0 }
}
