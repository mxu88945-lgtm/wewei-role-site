import { useState } from 'react'
import type { RedPacket, RedPacketLineInfo } from './phoneFun'

/** 微信式“发红包”页：个数、总积分、留言，大号金额，塞进红包。 */
export function RedPacketSendSheet({ dm = false, memberCount, onSend, onClose }: { dm?: boolean; memberCount: number; onSend: (total: number, count: number, note: string) => void; onClose: () => void }) {
  const [total, setTotal] = useState('')
  const [count, setCount] = useState(dm ? '1' : String(Math.min(9, Math.max(1, memberCount))))
  const [note, setNote] = useState('')
  const totalNumber = Math.floor(Number(total) || 0)
  const countNumber = Math.floor(Number(count) || 0)
  const problem = !totalNumber ? '' : totalNumber > 500 ? '一个红包最多 500 积分' : countNumber < 1 || countNumber > 9 ? '红包个数 1—9 个' : totalNumber < countNumber ? '每个红包至少 1 积分' : ''
  const ready = totalNumber > 0 && !problem
  return <div className="red-packet-layer" role="dialog" aria-modal="true" aria-label="发红包">
    <header><button type="button" aria-label="返回" onClick={onClose}>‹</button><strong>发红包</strong><span /></header>
    <div className="red-packet-form">
      {!dm && <><label className="red-packet-field"><span>红包个数</span><input inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value.replace(/\D/g, '').slice(0, 1))} placeholder="填写个数" /><em>个</em></label>
      <small className="red-packet-hint">本群共 {memberCount} 人 · 拼手气红包</small></>}
      <label className="red-packet-field"><span>{dm ? '积分' : '总积分'}</span><input inputMode="numeric" value={total} onChange={(event) => setTotal(event.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="0" /><em>积分</em></label>
      <label className="red-packet-field red-packet-note"><input value={note} maxLength={30} onChange={(event) => setNote(event.target.value)} placeholder="恭喜发财，大吉大利" /></label>
      {problem && <p className="red-packet-problem">{problem}</p>}
      <div className="red-packet-amount"><b>{totalNumber}</b><span>积分</span></div>
      <button type="button" className="red-packet-submit" disabled={!ready} onClick={() => onSend(totalNumber, countNumber, note.trim())}>塞积分进红包</button>
    </div>
    <footer>造物主请客，不扣你的积分 · 未领取的红包 24 小时后失效</footer>
  </div>
}

/** 聊天里的红包卡片。 */
export function RedPacketCard({ info, packet, ordinal, onOpen }: { info: RedPacketLineInfo; packet: RedPacket | null; ordinal?: number; onOpen: () => void }) {
  const grabbed = packet?.grabs.length || 0
  const done = packet ? grabbed >= packet.count : false
  const expired = packet ? !done && Date.now() - packet.at > 24 * 3600000 : false
  const status = done ? '已被领完' : expired ? '已过期' : grabbed ? `已领取 ${grabbed}/${info.count}` : ''
  const best = done && packet && packet.count > 1 ? packet.grabs.reduce((top, grab) => grab.amount > top.amount ? grab : top) : null
  return <div className="red-packet-wrap">
    <button type="button" className={`red-packet-card${done || expired ? ' opened' : ''}`} onClick={onOpen} aria-label={`${info.fromName}的积分红包`}>
      <span className="red-packet-card-main"><i aria-hidden="true" /><span><strong>{info.note || '恭喜发财，大吉大利'}</strong>{status && <small>{status}</small>}</span></span>
      <span className="red-packet-card-foot">积分红包{ordinal && ordinal > 1 ? ` · 第${ordinal}个` : ''} · {info.total} 积分</span>
    </button>
    {packet && packet.grabs.length > 0 && <ul className="red-packet-grabs" aria-label="谁抢了多少">{packet.grabs.map((grab) => <li key={grab.id}><span>{grab.name}</span><b>+{grab.amount}</b>{best?.id === grab.id && <em>手气最佳</em>}</li>)}</ul>}
  </div>
}

/** 点开红包看谁抢了多少。 */
export function RedPacketDetail({ info, packet, ordinal, onClose }: { info: RedPacketLineInfo; packet: RedPacket | null; ordinal?: number; onClose: () => void }) {
  const grabs = packet?.grabs || []
  const taken = grabs.reduce((sum, grab) => sum + grab.amount, 0)
  const full = packet ? grabs.length >= packet.count && packet.count > 1 : false
  const best = full ? grabs.reduce((top, grab) => grab.amount > top.amount ? grab : top) : null
  return <div className="red-packet-detail-layer" role="dialog" aria-modal="true" aria-label="红包详情">
    <button className="drawer-backdrop" aria-label="关闭红包详情" onClick={onClose} />
    <section className="red-packet-detail">
      <div className="red-packet-detail-top"><button type="button" aria-label="关闭" onClick={onClose}>×</button><strong>{info.fromName}的{ordinal && ordinal > 1 ? `第${ordinal}个` : ''}红包</strong><small>{info.note || '恭喜发财，大吉大利'}</small></div>
      <p className="red-packet-detail-sum">{packet ? `${info.count} 个红包共 ${info.total} 积分，已领取 ${grabs.length}/${info.count} 个（${taken}/${info.total}）` : '这个红包的记录不在这台设备上'}</p>
      <ul>{grabs.map((grab) => <li key={grab.id}><span>{grab.name}<small>{new Date(grab.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small></span><b>{grab.amount} 积分{best?.id === grab.id && <em>手气最佳</em>}</b></li>)}</ul>
      {packet && !grabs.length && <p className="red-packet-detail-empty">还没人抢，等他们冒泡吧</p>}
    </section>
  </div>
}

/** 转账页：选一个人、填积分和留言，直接到账。 */
export function TransferSheet({ members, onSend, onClose }: { members: Array<{ id: string; name: string }>; onSend: (toId: string, amount: number, note: string) => void; onClose: () => void }) {
  const [toId, setToId] = useState(members.length === 1 ? members[0].id : '')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const value = Math.floor(Number(amount) || 0)
  const problem = value > 500 ? '一次最多转 500 积分' : ''
  const ready = Boolean(toId) && value > 0 && !problem
  return <div className="red-packet-layer transfer-layer" role="dialog" aria-modal="true" aria-label="转账">
    <header><button type="button" aria-label="返回" onClick={onClose}>‹</button><strong>转账</strong><span /></header>
    <div className="red-packet-form">
      <div className="transfer-people" role="radiogroup" aria-label="转给谁">{members.map((member) => <button key={member.id} type="button" role="radio" aria-checked={toId === member.id} className={toId === member.id ? 'active' : ''} onClick={() => setToId(member.id)}>{member.name}</button>)}</div>
      <label className="red-packet-field"><span>积分</span><input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="0" /><em>积分</em></label>
      <label className="red-packet-field red-packet-note"><input value={note} maxLength={30} onChange={(event) => setNote(event.target.value)} placeholder="添加转账说明" /></label>
      {problem && <p className="red-packet-problem">{problem}</p>}
      <div className="red-packet-amount"><b>{value}</b><span>积分</span></div>
      <button type="button" className="red-packet-submit transfer-submit" disabled={!ready} onClick={() => onSend(toId, value, note.trim())}>转账给{members.find((member) => member.id === toId)?.name || '…'}</button>
    </div>
    <footer>造物主请客，不扣你的积分 · 立即到账，只有他收到</footer>
  </div>
}

/** 聊天里的转账卡片（微信样式）。 */
export function TransferCard({ toName, amount, note }: { toName: string; amount: number; note: string }) {
  return <div className="transfer-card" aria-label={`转账给${toName || '对方'} ${amount} 积分`}>
    <div className="transfer-card-main">
      <i aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9h13l-4-4" /><path d="M19 15H6l4 4" /></svg></i>
      <div><strong>{amount} 积分</strong><small>{toName ? `转账给${toName}` : '你发起了一笔转账'}</small>{note && <em>{note}</em>}</div>
    </div>
    <div className="transfer-card-foot">转账 · 已收款</div>
  </div>
}
