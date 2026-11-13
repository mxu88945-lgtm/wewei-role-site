import { useMemo, useState, type CSSProperties } from 'react'
import type { PersonaTap } from './PersonaTaskCards'
import {
  PERSONA_GIFT_CATEGORIES, PERSONA_GIFT_MAKER_COLORS, giftCardLabel, giftShelfFor, giftTiles, makePersonaGift, personaGiftEvent,
  type PersonaGift, type PersonaGiftCatalogItem, type PersonaGiftEvent, type PersonaGiftTab,
} from './personaGifts'

const giftStyle = (gift: { colors: [string, string] }) => ({ '--gift-a': gift.colors[0], '--gift-b': gift.colors[1] }) as CSSProperties
const day = (at: number) => new Date(at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })

/** v231/v233：消息里的礼物卡（她送 TA 的挂在她的消息里，TA 送她的挂在 TA 的回复下）。 */
export function PersonaGiftCard({ gift, from, to }: { gift: PersonaGiftEvent; from: string; to: string }) {
  const label = giftCardLabel(gift, from, to)
  return <article className={`persona-gift-card ${gift.direction}`} style={giftStyle(gift)} aria-label={`${label}：${gift.name}`}>
    <span className="persona-gift-art" aria-hidden="true">{gift.icon}</span>
    <div className="persona-gift-copy">
      <small>{label}</small>
      <strong>{gift.name}</strong>
      <span>{gift.subtitle}</span>
      {gift.note && <em>“{gift.note}”</em>}
    </div>
  </article>
}

/** v233：设置里的「礼物架」：全部自制礼物（我做的 / TA 做的）+「让 TA 送礼物」开关。 */
export function PersonaGiftsPanel({ name, gifts, enabled, onToggle, onRemove, onOpenCatalog, tap }: { name: string; gifts: PersonaGift[]; enabled: boolean; onToggle: () => void; onRemove: (id: string) => void; onOpenCatalog?: () => void; tap: PersonaTap }) {
  const list = [...gifts].reverse()
  return <section className="persona-life-panel">
    <div className="persona-toggle-row"><div><strong>让 {name} 送礼物</strong><small>想送你点什么时，{name} 偶尔会从图鉴里挑一份，或亲手做一份放进礼物架。关掉后 TA 不再送，你送的礼物照样能收到。所有窗口共用。</small></div><button className={`switch ${enabled ? 'on' : ''}`} aria-label="让 TA 送礼物" aria-pressed={enabled} {...tap(onToggle)}><span /></button></div>
    {onOpenCatalog && <button type="button" className="secondary-button persona-gift-open" {...tap(onOpenCatalog)}>打开礼物图鉴</button>}
    <div className="persona-gift-shelf" aria-label="礼物架">
      {list.map((gift) => <div key={gift.id} className="persona-gift-shelf-row" style={giftStyle(gift)}>
        <span className="persona-gift-art" aria-hidden="true">{gift.icon}</span>
        <span className="persona-gift-shelf-copy"><strong>{gift.name}<i>{gift.maker === 'user' ? '我做的' : 'TA 做的'}</i></strong><small>{day(gift.createdAt)} · {gift.note || gift.subtitle}</small></span>
        <button type="button" aria-label={`删除${gift.name}`} {...tap(() => { if (window.confirm(`把「${gift.name}」从礼物架上拿走？聊天里的礼物卡会保留。`)) onRemove(gift.id) })}>×</button>
      </div>)}
      {!list.length && <p className="persona-empty">还没有。你和 {name} 亲手做的礼物都会放在这里。</p>}
    </div>
  </section>
}

type Pending = { item: PersonaGiftCatalogItem | PersonaGift; note: string }

/** v233：礼物图鉴（＋ 菜单 →「礼物」）。分类、网格、自制、往来、请 TA 送。 */
export function PersonaGiftSheet({ roleName, shelf, history, canRoleSend, busy, onSend, onSave, onRemove, onRequest, onClose, tap }: {
  roleName: string; shelf: PersonaGift[]; history: PersonaGiftEvent[]; canRoleSend: boolean; busy: boolean
  onSend: (gift: PersonaGiftEvent) => void; onSave: (gift: PersonaGift) => void; onRemove: (id: string) => void; onRequest: () => void; onClose: () => void; tap: PersonaTap
}) {
  const [tab, setTab] = useState<PersonaGiftTab>('all')
  const [makerOpen, setMakerOpen] = useState(false)
  const [form, setForm] = useState({ icon: '', name: '', subtitle: '', color: 0 })
  const [pending, setPending] = useState<Pending | null>(null)
  const mine = useMemo(() => giftShelfFor(shelf), [shelf])
  const tiles = giftTiles(tab, mine)
  const recent = history.slice(-12).reverse()
  const draft = makePersonaGift({ icon: form.icon, name: form.name || '礼物名', subtitle: form.subtitle || '一句描述', colors: PERSONA_GIFT_MAKER_COLORS[form.color], maker: 'user' }, 0)
  const save = (andSend: boolean) => {
    const gift = makePersonaGift({ icon: form.icon, name: form.name, subtitle: form.subtitle, colors: PERSONA_GIFT_MAKER_COLORS[form.color], maker: 'user' })
    if (!gift) return
    onSave(gift)
    setMakerOpen(false)
    setForm({ icon: '', name: '', subtitle: '', color: 0 })
    if (andSend) setPending({ item: gift, note: '' })
    else setTab('custom')
  }
  return <div className="persona-gift-sheet" role="dialog" aria-modal="true" aria-label="礼物图鉴">
    <button type="button" className="persona-gift-scrim" aria-label="关闭礼物图鉴" {...tap(onClose)} />
    <section className="persona-gift-panel">
      <header className="persona-gift-head"><div><strong>礼物图鉴</strong><small>挑一份心意，送给 {roleName}。</small></div><button type="button" aria-label="关闭" {...tap(onClose)}>×</button></header>
      <nav className="persona-gift-tabs" aria-label="礼物分类">{PERSONA_GIFT_CATEGORIES.map((item) => <button type="button" key={item.id} className={item.id === tab ? 'active' : ''} aria-pressed={item.id === tab} {...tap(() => setTab(item.id))}>{item.label}</button>)}</nav>
      <div className="persona-gift-scroll">
        {makerOpen && <section className="persona-gift-maker" style={giftStyle(draft || { colors: PERSONA_GIFT_MAKER_COLORS[form.color] })}>
          <div className="persona-gift-maker-preview"><span className="persona-gift-art" aria-hidden="true">{draft?.icon || '🎁'}</span><div><strong>{form.name.trim() || '礼物名'}</strong><small>{form.subtitle.trim() || '一句描述'}</small></div></div>
          <div className="persona-gift-maker-row"><input value={form.icon} maxLength={8} placeholder="🎁" aria-label="图标（一个 emoji）" onChange={(event) => setForm({ ...form, icon: event.target.value })} /><input value={form.name} maxLength={24} placeholder="礼物名，例如：会发光的贝壳" aria-label="礼物名" onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
          <input value={form.subtitle} maxLength={60} placeholder="一句描述，例如：海边捡的，留着等你" aria-label="一句描述" onChange={(event) => setForm({ ...form, subtitle: event.target.value })} />
          <div className="persona-gift-colors" role="radiogroup" aria-label="颜色">{PERSONA_GIFT_MAKER_COLORS.map((colors, index) => <button type="button" key={colors.join()} role="radio" aria-checked={index === form.color} aria-label={`颜色 ${index + 1}`} className={index === form.color ? 'active' : ''} style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }} {...tap(() => setForm({ ...form, color: index }))} />)}</div>
          <div className="persona-gift-actions"><button type="button" {...tap(() => setMakerOpen(false))}>取消</button><button type="button" disabled={!form.name.trim()} {...tap(() => save(false))}>放进礼物架</button><button type="button" className="primary" disabled={!form.name.trim() || busy} {...tap(() => save(true))}>做好就送给 TA</button></div>
        </section>}
        <div className="persona-gift-grid">
          {(tab === 'all' || tab === 'custom') && !makerOpen && <button type="button" className="persona-gift-tile add" {...tap(() => { setPending(null); setMakerOpen(true) })}><span>＋</span><strong>自制礼物</strong><small>图鉴里没有的，亲手做一份</small></button>}
          {tiles.map((item) => <div key={item.id} className={`persona-gift-tile${'maker' in item ? ' custom' : ''}${pending?.item.id === item.id ? ' active' : ''}`} style={giftStyle(item)}>
            <button type="button" className="persona-gift-tile-main" {...tap(() => { setMakerOpen(false); setPending({ item, note: '' }) })}>
              {'maker' in item && <i>{item.maker === 'user' ? '我做的' : 'TA 做的'}</i>}
              <span aria-hidden="true">{item.icon}</span><strong>{item.name}</strong><small>{item.subtitle}</small>
            </button>
            {'maker' in item && <button type="button" className="persona-gift-tile-remove" aria-label={`删除${item.name}`} {...tap(() => { if (window.confirm(`把「${item.name}」从礼物架拿走？已经送出的礼物卡不受影响。`)) { onRemove(item.id); if (pending?.item.id === item.id) setPending(null) } })}>×</button>}
          </div>)}
          {tab === 'custom' && !tiles.length && <p className="persona-empty">还没有自制礼物。{roleName} 也可能亲手做一份送你。</p>}
        </div>
        <section className="persona-gift-history" aria-label="礼物往来">
          <div className="persona-gift-history-head"><strong>礼物往来</strong><small>{history.length} 份</small></div>
          {recent.map((item) => <div key={`${item.createdAt}-${item.giftId}-${item.direction}`} className="persona-gift-history-row"><span aria-hidden="true">{item.icon}</span><p><strong>{item.name}</strong><small>{item.direction === 'user-to-role' ? `我 → ${roleName}` : `${roleName} → 我`} · {day(item.createdAt)}</small></p></div>)}
          {!recent.length && <p className="persona-empty">第一份礼物还在等你。</p>}
        </section>
        <button type="button" className="persona-gift-request" disabled={busy || !canRoleSend} {...tap(onRequest)}>{canRoleSend ? `看看 ${roleName} 会送我什么` : `「让 TA 送礼物」已关闭`}</button>
      </div>
      {pending && <footer className="persona-gift-send" style={giftStyle(pending.item)}>
        <div className="persona-gift-send-item"><span className="persona-gift-art" aria-hidden="true">{pending.item.icon}</span><div><strong>{pending.item.name}</strong><small>{pending.item.subtitle}</small></div><button type="button" aria-label="取消" {...tap(() => setPending(null))}>×</button></div>
        <div className="persona-gift-send-row"><input value={pending.note} maxLength={240} placeholder="写一句附言（可以留空）" aria-label="附言" onChange={(event) => setPending({ ...pending, note: event.target.value })} /><button type="button" className="primary" disabled={busy} {...tap(() => { onSend(personaGiftEvent(pending.item, 'user-to-role', pending.note)); setPending(null) })}>送出</button></div>
      </footer>}
    </section>
  </div>
}

