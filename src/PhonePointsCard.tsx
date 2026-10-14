import { useEffect, useState } from 'react'
import type { Character } from './characterCard'
import { PHONE_POINTS_EVENT, POINT_REWARDS, addPoints, readPoints, writePoints, type PointsState } from './phonePoints'

export default function PhonePointsCard({ members }: { members: Character[] }) {
  const [state, setState] = useState<PointsState>(readPoints)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState('')
  useEffect(() => {
    const sync = () => setState(readPoints())
    window.addEventListener(PHONE_POINTS_EVENT, sync)
    return () => window.removeEventListener(PHONE_POINTS_EVENT, sync)
  }, [])
  if (!members.length) return null
  const nameOf = (id: string) => members.find((item) => item.id === id)?.name || '已离开的角色'
  const ranking = [...members].sort((a, b) => (state.balances[b.id] || 0) - (state.balances[a.id] || 0))
  const top = ranking[0]
  const judge = (id: string, delta: number) => { const next = addPoints(state, id, delta, '造物主裁决', Date.now()); setState(next); writePoints(next) }
  return <section className="phone-web-settings">
    <button type="button" className="phone-web-row" onClick={() => setOpen(!open)}><span>⚖️ 服刑积分</span><small>{top ? `榜首 ${top.name} ${state.balances[top.id] || 0} 分 · 点开裁决` : ''}</small></button>
    {open && <div className="phone-web-form phone-points">
      {ranking.map((member, index) => <div key={member.id} className="phone-points-row">
        <button type="button" className="phone-points-name" onClick={() => setPicked(picked === member.id ? '' : member.id)}><b>{index + 1}</b>{member.name}<em>{state.balances[member.id] || 0}</em></button>
        {picked === member.id && <div className="phone-points-judge">{[-20, -5, 5, 10].map((delta) => <button key={delta} type="button" className={delta < 0 ? 'minus' : ''} onClick={() => judge(member.id, delta)}>{delta > 0 ? '+' : ''}{delta}</button>)}</div>}
      </div>)}
      <p>每天第一次发言自动签到 +10；他们会自报认错、提醒你吃饭加分，被抓包扣分。可兑换：{POINT_REWARDS.map((item) => `${item.name} ${item.cost}`).join('、')}。点名字可以亲自加减分。</p>
      {state.log.length > 0 && <div className="phone-points-log">{state.log.slice(-8).reverse().map((entry, index) => <span key={`${entry.at}-${index}`}>{nameOf(entry.id)} {entry.delta > 0 ? '+' : ''}{entry.delta}｜{entry.reason}</span>)}</div>}
    </div>}
  </section>
}
