import type { CSSProperties } from 'react'
import type { PersonaTap } from './PersonaTaskCards'
import type { PersonaGift } from './personaGifts'

const giftStyle = (gift: PersonaGift) => ({ '--gift-a': gift.colors[0], '--gift-b': gift.colors[1] }) as CSSProperties
const day = (at: number) => new Date(at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })

/** v231：消息下的礼物卡（他亲手做的那一份）。 */
export function PersonaGiftCard({ gift, from, to }: { gift: PersonaGift; from: string; to: string }) {
  return <article className="persona-gift-card" style={giftStyle(gift)} aria-label={`${from}送给${to}的礼物：${gift.name}`}>
    <span className="persona-gift-art" aria-hidden="true">{gift.icon}</span>
    <div className="persona-gift-copy">
      <small>{from} 亲手做给 {to}</small>
      <strong>{gift.name}</strong>
      <span>{gift.subtitle}</span>
      {gift.note && <em>“{gift.note}”</em>}
    </div>
  </article>
}

/** v231：设置里的「他做的礼物」：礼物架 + 开关。 */
export function PersonaGiftsPanel({ name, gifts, enabled, onToggle, onRemove, tap }: { name: string; gifts: PersonaGift[]; enabled: boolean; onToggle: () => void; onRemove: (id: string) => void; tap: PersonaTap }) {
  const list = [...gifts].reverse()
  return <section className="persona-life-panel">
    <div className="persona-toggle-row"><div><strong>让 {name} 自己做礼物</strong><small>想送你点什么时，{name} 偶尔会亲手做一份，变成礼物卡放进这里。所有窗口共用。</small></div><button className={`switch ${enabled ? 'on' : ''}`} aria-label="让 TA 自己做礼物" aria-pressed={enabled} {...tap(onToggle)}><span /></button></div>
    <div className="persona-gift-shelf" aria-label="他做的礼物">
      {list.map((gift) => <div key={gift.id} className="persona-gift-shelf-row" style={giftStyle(gift)}>
        <span className="persona-gift-art" aria-hidden="true">{gift.icon}</span>
        <span className="persona-gift-shelf-copy"><strong>{gift.name}</strong><small>{day(gift.createdAt)} · {gift.note || gift.subtitle}</small></span>
        <button type="button" aria-label={`删除${gift.name}`} {...tap(() => { if (window.confirm(`把「${gift.name}」从礼物架上拿走？聊天里的礼物卡会保留。`)) onRemove(gift.id) })}>×</button>
      </div>)}
      {!list.length && <p className="persona-empty">还没有。{name} 亲手做的礼物会放在这里。</p>}
    </div>
  </section>
}
