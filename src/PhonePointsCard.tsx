import { useEffect, useState } from 'react'
import type { Character } from './characterCard'
import { PHONE_POINTS_EVENT, addPoints, readPoints, writePoints, type PointsState } from './phonePoints'
import { PHONE_SHOP_EVENT, SHOP_ITEMS, readShop, settleShopOrder, writeShop, type ShopOrder } from './phoneShop'

type Tab = 'rank' | 'shop' | 'wish'

export default function PhonePointsCard({ members }: { members: Character[] }) {
  const [state, setState] = useState<PointsState>(readPoints)
  const [orders, setOrders] = useState<ShopOrder[]>(readShop)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('rank')
  const [picked, setPicked] = useState('')
  useEffect(() => {
    const sync = () => { setState(readPoints()); setOrders(readShop()) }
    window.addEventListener(PHONE_POINTS_EVENT, sync)
    window.addEventListener(PHONE_SHOP_EVENT, sync)
    return () => { window.removeEventListener(PHONE_POINTS_EVENT, sync); window.removeEventListener(PHONE_SHOP_EVENT, sync) }
  }, [])
  if (!members.length) return null
  const nameOf = (id: string) => members.find((item) => item.id === id)?.name || '已离开的角色'
  const ranking = [...members].sort((a, b) => (state.balances[b.id] || 0) - (state.balances[a.id] || 0))
  const top = ranking[0]
  const pending = orders.filter((item) => item.status === 'pending').length
  const judge = (id: string, delta: number) => { const next = addPoints(state, id, delta, '造物主裁决', Date.now()); setState(next); writePoints(next) }
  const settle = (order: ShopOrder, grant: boolean) => {
    if (!grant && !window.confirm(`驳回${nameOf(order.buyerId)}的「${order.wish || order.item}」？会退回 ${order.cost} 积分。`)) return
    const next = settleShopOrder(readPoints(), readShop(), order.id, grant, Date.now())
    writePoints(next.points); writeShop(next.orders); setState(next.points); setOrders(next.orders)
  }
  const statusText = { pending: '待处理', granted: '已实现', rejected: '已驳回·退分' }
  const when = (at: number) => { const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
  return <section className="phone-web-settings">
    <button type="button" className="phone-web-row" onClick={() => setOpen(!open)}><span>⚖️ 服刑积分</span><small>{top ? `榜首 ${top.name} ${state.balances[top.id] || 0} 分${pending ? ` · ${pending} 个待处理` : ''}` : ''}</small></button>
    {open && <div className="phone-web-form phone-points">
      <div className="phone-points-tabs">{([['rank', '排行'], ['shop', '小卖部'], ['wish', `许愿墙${pending ? ` ${pending}` : ''}`]] as Array<[Tab, string]>).map(([key, label]) => <button key={key} type="button" className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>
      {tab === 'rank' && <>
        {ranking.map((member, index) => <div key={member.id} className="phone-points-row">
          <button type="button" className="phone-points-name" onClick={() => setPicked(picked === member.id ? '' : member.id)}><b>{index + 1}</b>{member.name}<em>{state.balances[member.id] || 0}</em></button>
          {picked === member.id && <div className="phone-points-judge">{[-20, -5, 5, 10].map((delta) => <button key={delta} type="button" className={delta < 0 ? 'minus' : ''} onClick={() => judge(member.id, delta)}>{delta > 0 ? '+' : ''}{delta}</button>)}</div>}
        </div>)}
        <p>每天第一次发言自动签到 +10；完成剧本要求、认错守规矩可以自报加分（催你吃饭不算），被抓包扣分。积分拿去小卖部花。点名字可以亲自加减分。</p>
        {state.log.length > 0 && <div className="phone-points-log">{state.log.slice(-8).reverse().map((entry, index) => <span key={`${entry.at}-${index}`}>{nameOf(entry.id)} {entry.delta > 0 ? '+' : ''}{entry.delta}｜{entry.reason}</span>)}</div>}
      </>}
      {tab === 'shop' && <>
        <div className="phone-shop-grid">{SHOP_ITEMS.map((item) => <div key={item.name} className="phone-shop-item"><i>{item.icon}</i><strong>{item.name}</strong><small>{item.desc}</small><em>{item.cost} 分</em></div>)}</div>
        <p>他们自己花积分来买，你不用操作。买了的东西和许愿瓶都会进许愿墙，由你决定实现还是驳回，驳回会退分。</p>
      </>}
      {tab === 'wish' && <>
        {orders.length === 0 && <p>还没人来买东西。</p>}
        {[...orders].reverse().slice(0, 40).map((order) => <div key={order.id} className={`phone-wish ${order.status}`}>
          <div><b>{order.wish ? '🫙' : SHOP_ITEMS.find((item) => item.name === order.item)?.icon || '🛒'} {nameOf(order.buyerId)}</b><small>{when(order.at)} · -{order.cost}</small></div>
          <p>{order.wish ? `「${order.wish}」` : order.item}</p>
          {order.status === 'pending' ? <div className="phone-points-judge"><button type="button" className="minus" onClick={() => settle(order, false)}>驳回</button><button type="button" onClick={() => settle(order, true)}>实现</button></div> : <span>{statusText[order.status]}</span>}
        </div>)}
      </>}
    </div>}
  </section>
}
