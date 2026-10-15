import { useEffect, useState } from 'react'
import type { Character } from './characterCard'
import { PHONE_POINTS_EVENT, addPoints, readPoints, writePoints, type PointsState } from './phonePoints'
import { PHONE_SHOP_EVENT, REQUEST_EFFECTS, decideOrder, giftItem, invCount, readShop, stockLeft, writeShop, type ShopItem, type ShopOrder, type ShopState } from './phoneShop'

type Section = 'shelf' | 'wall' | 'people' | 'owner'
const STATUS: Record<ShopOrder['status'], string> = { done: '已买', pending: '待你决定', granted: '已答应', held: '暂存中', rejected: '已拒绝', refunded: '已退回积分', used: '已行使' }
const when = (at: number) => { const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

export default function PhoneShop({ members, userName }: { members: Character[]; userName: string }) {
  const [shop, setShop] = useState<ShopState>(readShop)
  const [points, setPoints] = useState<PointsState>(readPoints)
  const [section, setSection] = useState<Section>('shelf')
  const [who, setWho] = useState('')
  const [editing, setEditing] = useState<string>('')
  useEffect(() => {
    const sync = () => { setShop(readShop()); setPoints(readPoints()) }
    window.addEventListener(PHONE_SHOP_EVENT, sync)
    window.addEventListener(PHONE_POINTS_EVENT, sync)
    return () => { window.removeEventListener(PHONE_SHOP_EVENT, sync); window.removeEventListener(PHONE_POINTS_EVENT, sync) }
  }, [])
  const save = (next: ShopState, nextPoints?: PointsState) => { setShop(next); writeShop(next); if (nextPoints) { setPoints(nextPoints); writePoints(nextPoints) } }
  const nameOf = (id: string) => members.find((item) => item.id === id)?.name || '已离开的角色'
  const now = Date.now()
  const pending = shop.orders.filter((order) => order.status === 'pending' || order.status === 'held')
  const person = members.find((item) => item.id === who) || members[0]

  const decide = (order: ShopOrder, decision: 'granted' | 'held' | 'rejected' | 'refunded') => {
    let condition = ''
    if (decision === 'granted' && order.itemId === 'autonomy') {
      const text = window.prompt(`给${nameOf(order.buyerId)}写下行使自主权的剧本条件：`, '')
      if (text === null) return
      condition = text
    }
    if (decision === 'rejected' && !window.confirm('拒绝且不退积分？')) return
    const next = decideOrder(readPoints(), readShop(), order.id, decision, Date.now(), condition)
    save(next.shop, next.points)
  }
  const gift = (item: ShopItem) => {
    if (!person) return
    let condition = ''
    if (item.effect === 'autonomy') { const text = window.prompt(`送${person.name}一次自主权，写下行使条件：`, ''); if (text === null) return; condition = text }
    else if (!window.confirm(`送${person.name}一张「${item.name}」？`)) return
    save(giftItem(readShop(), person.id, item, Date.now(), condition))
  }
  const giftPoints = () => {
    if (!person) return
    const raw = window.prompt(`送${person.name}多少积分？`, '20')
    const amount = Math.round(Number(raw))
    if (!raw || !Number.isFinite(amount) || amount <= 0) return
    const next = addPoints(readPoints(), person.id, Math.min(amount, 1000), `${userName}送的`, Date.now())
    setPoints(next); writePoints(next)
  }
  const deduct = () => {
    if (!person) return
    const raw = window.prompt(`扣${person.name}多少分？`, '10')
    const amount = Math.round(Number(raw))
    if (!raw || !Number.isFinite(amount) || amount <= 0) return
    const reason = window.prompt('扣分理由（他们会看到）：', '违规')?.trim() || '违规'
    let next = addPoints(readPoints(), person.id, -Math.min(amount, 1000), `${userName}扣分：${reason}`, Date.now())
    const current = readShop()
    if (amount <= 20 && invCount(current, person.id, 'pardon') > 0 && window.confirm(`${person.name}有免罚券，让他用掉一张抵消这次扣分吗？`)) {
      next = addPoints(next, person.id, Math.min(amount, 1000), `免罚券抵消：${reason}`, Date.now())
      save({ ...current, inventory: { ...current.inventory, [person.id]: { ...(current.inventory[person.id] || {}), pardon: invCount(current, person.id, 'pardon') - 1 } } })
    }
    setPoints(next); writePoints(next)
  }
  const updateItem = (id: string, patch: Partial<ShopItem>) => save({ ...shop, items: shop.items.map((item) => item.id === id ? { ...item, ...patch } : item) })
  const addCustom = () => {
    const name = window.prompt('新商品名字：', '')?.trim()
    if (!name) return
    const price = Math.max(1, Math.round(Number(window.prompt('价格（积分）：', '50')) || 50))
    const desc = window.prompt('效果说明（会告诉他们）：', '向她申请一件事，由她决定')?.trim() || '向她申请一件事，由她决定'
    const item: ShopItem = { id: `custom-${Date.now()}`, name: name.slice(0, 12), icon: '🎁', price, desc: desc.slice(0, 60), effect: 'custom', dailyStock: 0, cooldownHours: 0, active: true }
    save({ ...shop, items: [...shop.items, item] })
  }

  if (!members.length) return <div className="phone-shop"><p className="phone-shop-empty">先建一个群，商店才开门。</p></div>
  return <div className="phone-shop">
    <div className="phone-points-tabs four">{([['shelf', '货架'], ['wall', `许愿墙${pending.length ? ` ${pending.length}` : ''}`], ['people', '他们'], ['owner', '店主']] as Array<[Section, string]>).map(([key, label]) => <button key={key} type="button" className={section === key ? 'active' : ''} onClick={() => setSection(key)}>{label}</button>)}</div>

    {section === 'shelf' && <>
      <div className="phone-shop-grid">{shop.items.filter((item) => item.active).map((item) => { const left = stockLeft(shop, item, now); return <div key={item.id} className="phone-shop-item"><i>{item.icon}</i><strong>{item.name}</strong><small>{item.desc}</small><em>{item.price} 分{left !== Infinity ? ` · 今日剩 ${left}` : ''}</em></div> })}</div>
      <p className="phone-shop-tip">他们自己攒分、自己决定买。所有商品只给“提出请求的资格”，答不答应都由你。转积分：【转积分 N 给 名字：附言】。</p>
    </>}

    {section === 'wall' && <>
      {shop.orders.filter((order) => order.status !== 'done').length === 0 && <p className="phone-shop-empty">许愿墙还空着。</p>}
      {[...shop.orders].filter((order) => order.status !== 'done').reverse().slice(0, 50).map((order) => <div key={order.id} className={`phone-wish ${order.status}`}>
        <div><b>{order.icon} {nameOf(order.buyerId)} · {order.itemName}</b><small>{when(order.at)}{order.gift ? ' · 你送的' : ` · -${order.cost}`}</small></div>
        {order.note && <p>「{order.note}」</p>}
        {order.condition && <p className="phone-wish-condition">条件：{order.condition}</p>}
        {order.status === 'pending' || order.status === 'held'
          ? <div className="phone-wish-actions"><button type="button" onClick={() => decide(order, 'granted')}>答应</button>{order.status === 'pending' && <button type="button" onClick={() => decide(order, 'held')}>暂存</button>}<button type="button" className="minus" onClick={() => decide(order, 'rejected')}>拒绝</button><button type="button" className="minus" onClick={() => decide(order, 'refunded')}>退回积分</button></div>
          : <span>{STATUS[order.status]}</span>}
      </div>)}
    </>}

    {section === 'people' && person && <>
      <div className="phone-shop-people">{members.map((member) => <button key={member.id} type="button" className={member.id === person.id ? 'active' : ''} onClick={() => setWho(member.id)}>{member.name}<em>{points.balances[member.id] || 0}</em></button>)}</div>
      <div className="phone-shop-card">
        <div className="phone-shop-balance"><strong>{person.name}</strong><span>{points.balances[person.id] || 0} 分</span><button type="button" className="minus" onClick={deduct}>扣分</button><button type="button" onClick={giftPoints}>送积分</button></div>
        <h4>库存</h4>
        <div className="phone-shop-inv">{shop.items.filter((item) => invCount(shop, person.id, item.id) > 0).map((item) => <span key={item.id}>{item.icon}{item.name}×{invCount(shop, person.id, item.id)}</span>)}{shop.orders.filter((order) => order.buyerId === person.id && order.itemId === 'autonomy' && order.status === 'granted').map((order) => <span key={order.id}>👑自主权（{order.condition || '无条件'}）</span>)}{shop.priority.includes(person.id) && <span>🎟️翻牌排队中</span>}</div>
        <h4>送礼</h4>
        <div className="phone-shop-gifts">{shop.items.filter((item) => (item.active && !REQUEST_EFFECTS.includes(item.effect) && item.effect !== 'whisper') || item.effect === 'autonomy').map((item) => <button key={item.id} type="button" onClick={() => gift(item)}>{item.icon}{item.name}</button>)}</div>
        <h4>账单</h4>
        <div className="phone-points-log">{[...points.log].filter((entry) => entry.id === person.id).slice(-12).reverse().map((entry, index) => <span key={`${entry.at}-${index}`}>{when(entry.at)} {entry.delta > 0 ? '+' : ''}{entry.delta}｜{entry.reason}</span>)}</div>
      </div>
    </>}

    {section === 'owner' && <>
      {shop.items.map((item) => <div key={item.id} className={`phone-owner-item${item.active ? '' : ' off'}`}>
        <button type="button" className="phone-owner-head" onClick={() => setEditing(editing === item.id ? '' : item.id)}><span>{item.icon} {item.name}</span><small>{item.price} 分 · {item.active ? '在售' : '已下架'}</small></button>
        {editing === item.id && <div className="phone-owner-form">
          <label>价格<input type="number" min={0} value={item.price} onChange={(event) => updateItem(item.id, { price: Math.max(0, Math.round(Number(event.target.value) || 0)) })} /></label>
          <label>每日库存（0 不限）<input type="number" min={0} value={item.dailyStock} onChange={(event) => updateItem(item.id, { dailyStock: Math.max(0, Math.round(Number(event.target.value) || 0)) })} /></label>
          <label>每人冷却（小时）<input type="number" min={0} value={item.cooldownHours} onChange={(event) => updateItem(item.id, { cooldownHours: Math.max(0, Number(event.target.value) || 0) })} /></label>
          <label>说明<input value={item.desc} onChange={(event) => updateItem(item.id, { desc: event.target.value.slice(0, 60) })} /></label>
          <div className="phone-wish-actions"><button type="button" onClick={() => updateItem(item.id, { active: !item.active })}>{item.active ? '下架' : '上架'}</button>{!item.builtin && <button type="button" className="minus" onClick={() => { if (window.confirm(`删掉「${item.name}」？`)) save({ ...shop, items: shop.items.filter((entry) => entry.id !== item.id) }) }}>删除</button>}</div>
        </div>}
      </div>)}
      <button type="button" className="phone-owner-add" onClick={addCustom}>＋ 上架自定义商品</button>
      <p className="phone-shop-tip">自定义商品买下后会进许愿墙，由你决定。锁屏券的冷却从锁屏结束后开始算，全店共用。</p>
    </>}
  </div>
}
