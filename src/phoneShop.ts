/** 小手机“整改小卖部”：角色花服刑积分买东西、投许愿瓶；造物主在许愿墙上实现或驳回（驳回退分）。存在本机 localStorage。 */
import { POINT_REWARDS, addPoints, type PointsState } from './phonePoints'

export const PHONE_SHOP_KEY = 'weijing.phoneShop'
export const PHONE_SHOP_EVENT = 'weijing-phone-shop'

export type ShopItem = { name: string; cost: number; icon: string; desc: string; wish?: boolean }
export const SHOP_ITEMS: ShopItem[] = [
  { name: '许愿瓶', cost: 60, icon: '🫙', desc: '写下想要的东西，造物主决定实不实现', wish: true },
  { name: '改群昵称', cost: 15, icon: '🏷️', desc: '给自己或狱友改一天群昵称' },
  { name: '加餐券', cost: 25, icon: '🍱', desc: '剧情里吃顿好的' },
  { name: '专属称号', cost: 35, icon: '🎖️', desc: '让造物主赐一个称号' },
  { name: '放风券', cost: 45, icon: '🌿', desc: '单独陪造物主出去走走一段剧情' },
  { name: '单独约会', cost: 120, icon: '💌', desc: '和造物主单独约会一场' },
  ...POINT_REWARDS.map((item) => ({ name: item.name, cost: item.cost, icon: '🎫', desc: '特权' })),
]

export type ShopOrder = { id: string; buyerId: string; item: string; cost: number; wish?: string; at: number; status: 'pending' | 'granted' | 'rejected'; doneAt?: number }

export function readShop(): ShopOrder[] {
  try { const value = JSON.parse(localStorage.getItem(PHONE_SHOP_KEY) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
}
export function writeShop(orders: ShopOrder[]) {
  try { localStorage.setItem(PHONE_SHOP_KEY, JSON.stringify(orders.slice(-300))) } catch { /* ignore */ }
  window.dispatchEvent(new Event(PHONE_SHOP_EVENT))
}

export function findShopItem(raw: string) {
  const text = raw.trim()
  if (!text) return undefined
  return SHOP_ITEMS.find((item) => text === item.name) || SHOP_ITEMS.find((item) => text.includes(item.name) || item.name.includes(text))
}

/** 买一件：钱够就扣分、记一笔订单；许愿瓶要带愿望。 */
export function buyShopItem(points: PointsState, orders: ShopOrder[], buyerId: string, item: ShopItem, wish: string, at: number) {
  const balance = points.balances[buyerId] || 0
  const cleanWish = wish.trim().slice(0, 80)
  if (item.wish && !cleanWish) return { ok: false as const, reason: '许愿瓶要写愿望', points, orders }
  if (balance < item.cost) return { ok: false as const, reason: `积分不够（${balance}/${item.cost}）`, points, orders }
  const order: ShopOrder = { id: `shop-${at}-${Math.random().toString(36).slice(2, 7)}`, buyerId, item: item.name, cost: item.cost, wish: item.wish ? cleanWish : undefined, at, status: 'pending' }
  return { ok: true as const, order, points: addPoints(points, buyerId, -item.cost, `小卖部：${item.name}`, at), orders: [...orders, order] }
}

/** 造物主处理一笔：实现，或驳回并退回积分。 */
export function settleShopOrder(points: PointsState, orders: ShopOrder[], orderId: string, grant: boolean, at: number) {
  const order = orders.find((item) => item.id === orderId)
  if (!order || order.status !== 'pending') return { points, orders }
  const nextOrders = orders.map((item) => item.id === orderId ? { ...item, status: grant ? 'granted' as const : 'rejected' as const, doneAt: at } : item)
  return { points: grant ? points : addPoints(points, order.buyerId, order.cost, `驳回退款：${order.item}`, at), orders: nextOrders }
}

const BUY_TAG = /[【[]\s*(?:购买|买|兑换)\s*[：:]?\s*([^】\]：:]{1,20})(?:[：:]\s*([^】\]]{0,80}))?[】\]]/g
const WISH_TAG = /[【[]\s*许愿\s*[：:]\s*([^】\]]{1,80})[】\]]/g

/** 处理角色消息里的【购买：商品】【购买：许愿瓶：愿望】【许愿：愿望】，换成一行看得见的小票。 */
export function applyShopTags(points: PointsState, orders: ShopOrder[], buyerId: string, text: string, at: number) {
  let nextPoints = points
  let nextOrders = orders
  const bought: string[] = []
  const handle = (item: ShopItem | undefined, wish: string) => {
    if (!item) return ''
    const result = buyShopItem(nextPoints, nextOrders, buyerId, item, wish, at)
    if (!result.ok) return `🛒 买「${item.name}」失败：${result.reason}`
    nextPoints = result.points
    nextOrders = result.orders
    bought.push(item.name)
    return item.wish ? `🫙 投了一个许愿瓶 -${item.cost}｜${result.order.wish}` : `🛒 买了「${item.name}」-${item.cost}`
  }
  let out = text.replace(WISH_TAG, (_all, wish: string) => handle(SHOP_ITEMS[0], wish))
  out = out.replace(BUY_TAG, (_all, name: string, extra?: string) => handle(findShopItem(name), extra || ''))
  return { points: nextPoints, orders: nextOrders, text: out.replace(/\n{3,}/g, '\n\n').trim(), bought, changed: bought.length > 0 }
}

/** 给模型看的小卖部规则和这个人最近的许愿/订单状态。 */
export function buildShopNote(orders: ShopOrder[], people: Array<{ id: string; name: string }>, userName: string) {
  const ids = new Set(people.map((item) => item.id))
  const nameOf = (id: string) => people.find((item) => item.id === id)?.name || ''
  const statusText = { pending: '等她处理', granted: '她已实现', rejected: '被她驳回（已退分）' }
  const recent = orders.filter((item) => ids.has(item.buyerId)).slice(-8)
  const list = recent.map((item) => `${nameOf(item.buyerId)}：${item.wish ? `许愿「${item.wish}」` : item.item}（${statusText[item.status]}）`).join('；')
  return `【整改小卖部】积分可以在小卖部花，消息最后单独一行写【购买：商品名】；许愿瓶写【购买：许愿瓶：你想要的东西】（或【许愿：内容】），愿望由${userName}决定实现还是驳回，驳回会退分。商品：${SHOP_ITEMS.map((item) => `${item.name} ${item.cost}`).join('、')}。别乱花，也别每条都买。${list ? `\n最近的订单：${list}。已实现的可以开心/得意，被驳回的可以小小委屈。` : ''}`
}
