import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Character } from './characterCard'
import { PHONE_GIFT_CATALOG, PHONE_GIFT_CATEGORIES, PHONE_GIFTS_EVENT, makeDiyGift, phoneGiftsFor, readPhoneGifts, type PhoneGiftCategory, type PhoneGiftItem } from './phoneGifts'

type Props = {
  members: Character[]
  groups: Array<{ id: string; title: string; memberIds: string[]; updatedAt: number }>
  onSend: (item: PhoneGiftItem, character: Character, note: string, destinationId: string) => Promise<void>
}

const when = (at: number) => new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function PhoneGifts({ members, groups, onSend }: Props) {
  const [characterId, setCharacterId] = useState(members[0]?.id || '')
  const [category, setCategory] = useState<'all' | PhoneGiftCategory>('all')
  const [selected, setSelected] = useState<PhoneGiftItem | null>(null)
  const [note, setNote] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [diyOpen, setDiyOpen] = useState(false)
  const [diyName, setDiyName] = useState('')
  const [diyIcon, setDiyIcon] = useState('🎁')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const sync = () => setTick((value) => value + 1)
    window.addEventListener(PHONE_GIFTS_EVENT, sync)
    return () => window.removeEventListener(PHONE_GIFTS_EVENT, sync)
  }, [])
  useEffect(() => {
    if (!members.some((item) => item.id === characterId)) setCharacterId(members[0]?.id || '')
  }, [members, characterId])

  const person = members.find((item) => item.id === characterId)
  const destinations = useMemo(() => groups.filter((group) => group.memberIds.includes(characterId)).sort((a, b) => b.updatedAt - a.updatedAt), [groups, characterId])
  useEffect(() => {
    if (!destinationId || (destinationId !== 'dm' && !destinations.some((item) => item.id === destinationId))) setDestinationId(destinations[0]?.id || 'dm')
  }, [destinations, destinationId])
  const items = category === 'all' ? PHONE_GIFT_CATALOG : PHONE_GIFT_CATALOG.filter((item) => item.category === category)
  const history = useMemo(() => {
    void tick
    return characterId ? phoneGiftsFor(readPhoneGifts(), characterId).slice(0, 12) : []
  }, [characterId, tick])

  const send = async (item: PhoneGiftItem) => {
    if (!person || busy) return
    setBusy(true)
    setError('')
    try {
      await onSend(item, person, note, destinationId || 'dm')
      setSelected(null)
      setDiyOpen(false)
      setDiyName('')
      setDiyIcon('🎁')
      setNote('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '礼物没送出去，再试一次。')
    } finally {
      setBusy(false)
    }
  }

  if (!members.length) return <div className="phone-gifts-empty">先建一个小手机群。群里的角色才会出现在收礼人名单里。</div>

  return <section className="phone-gifts">
    <header className="phone-gifts-hero">
      <span>GIFT · 心意</span>
      <h2>给 TA 的心意，不只一种</h2>
      <p>可以公开送进群里，也可以只放进 TA 的私聊。</p>
    </header>

    <div className="phone-gift-people" aria-label="选择收礼人">
      {members.map((member) => <button key={member.id} className={member.id === characterId ? 'active' : ''} onClick={() => { setCharacterId(member.id); setSelected(null); setDiyOpen(false) }}>
        {member.avatar ? <img src={member.avatar} alt="" /> : <i>{member.name.slice(-1)}</i>}
        <span>{member.name}</span>
      </button>)}
    </div>

    <div className="phone-gift-categories">
      {PHONE_GIFT_CATEGORIES.map((item) => <button key={item.id} className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)}>{item.label}</button>)}
    </div>

    <div className="phone-gift-routes" aria-label="选择送礼场合">
      <small>送到哪里</small>
      <div>{destinations.map((group) => <button key={group.id} className={destinationId === group.id ? 'active' : ''} onClick={() => setDestinationId(group.id)}>👥 {group.title}</button>)}<button className={destinationId === 'dm' ? 'active' : ''} onClick={() => setDestinationId('dm')}>🔒 只发私聊</button></div>
      <p>{destinationId === 'dm' ? '只有 TA 看得到，回应也留在私聊。' : '礼物会公开出现在群里；收礼人先回应，其他群友都看得见，可以接着酸。'}</p>
    </div>

    <div className="phone-gift-grid">
      <button className="phone-gift-item diy" onClick={() => { setDiyOpen(true); setSelected(null); setNote('') }}>
        <span className="phone-gift-art">🖌️</span><strong>亲手做一份</strong><small>名字、图案与附言都由你定</small><em>独一份</em>
      </button>
      {items.map((item) => <button key={item.id} className="phone-gift-item" style={{ '--gift-a': item.colors[0], '--gift-b': item.colors[1] } as CSSProperties} onClick={() => { setSelected(item); setDiyOpen(false); setNote('') }}>
        <span className="phone-gift-art">{item.icon}</span><strong>{item.name}</strong><small>{item.subtitle}</small><em>♥ {item.heart}</em>
      </button>)}
    </div>

    {(selected || diyOpen) && <div className="phone-gift-compose">
      <header><div><small>送给 {person?.name}</small><strong>{selected ? `${selected.icon} ${selected.name}` : '🖌️ 亲手做一份'}</strong></div><button aria-label="关闭" onClick={() => { setSelected(null); setDiyOpen(false); setNote('') }}>×</button></header>
      {diyOpen && <div className="phone-gift-diy-row"><input aria-label="礼物图案" maxLength={8} value={diyIcon} onChange={(event) => setDiyIcon(event.target.value)} /><input aria-label="礼物名字" maxLength={24} value={diyName} onChange={(event) => setDiyName(event.target.value)} placeholder="给这份礼物起个名字" /></div>}
      <textarea rows={3} maxLength={240} value={note} onChange={(event) => setNote(event.target.value)} placeholder="写一句只给 TA 看的附言……" />
      {error && <p role="alert">{error}</p>}
      <button className="phone-gift-send" disabled={busy || (diyOpen && !diyName.trim())} onClick={() => void send(selected || makeDiyGift(diyName, note, diyIcon))}>{busy ? '正在送到 TA 手里…' : '送出礼物并去看 TA 回应'}</button>
    </div>}

    <section className="phone-gift-history">
      <header><strong>{person?.name}收到的礼物</strong><small>{history.length ? `最近 ${history.length} 份` : '还没有送过'}</small></header>
      {!history.length && <p>第一份会被记进你们两个人的礼物记录里。</p>}
      {history.map((record) => <article key={record.id}><i>{record.giftIcon}</i><div><strong>{record.giftName}{record.diy ? ' · 手作' : ''}</strong><small>{when(record.createdAt)}{record.note ? ` · ${record.note}` : ''}</small>{record.reaction && <p>“{record.reaction}”</p>}</div></article>)}
    </section>
    <footer>♥ 心意值只表示礼物分量，不扣造物主的服刑积分。</footer>
  </section>
}
