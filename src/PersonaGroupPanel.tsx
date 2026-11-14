import { useRef, useState, type FocusEvent, type PointerEvent } from 'react'
import type { Character } from './characterCard'
import type { PersonaThread, PersonaWindow } from './personaWindow'
import { addGuest, deleteGuest, inviteGuest, isImageAvatar, pendingGuestCount, PERSONA_GROUP_GUEST_LIMIT, replyModeOf, resolveGuest, setReplyMode, updateGuest, type PersonaGuest, type PersonaReplyMode } from './personaGroup'
import { squareAvatarFromFile } from './groupAvatar'

type Tap = (action: () => void) => { onPointerUp: (event: PointerEvent) => void; onClick: () => void }

function GuestAvatar({ name, avatar }: { name: string; avatar?: string }) {
  return <span className="persona-avatar small persona-guest-avatar">{isImageAvatar(avatar) ? <img src={avatar} alt="" /> : avatar?.trim() ? <i>{avatar.trim().slice(0, 2)}</i> : name.slice(-1)}</span>
}

/**
 * v234 ••• →「群聊成员」：拉人进来（角色卡 / 手写简卡）、请出与拉回、回复模式、客人的世界观与窗口记忆。
 * 主人格始终在场，不能请出。
 */
export default function PersonaGroupPanel({ persona, thread, characters, mainName, mainAvatar, userName, tap, onFocus, onChange, onDismiss, onExtract, busy }: {
  persona: PersonaWindow
  thread: PersonaThread
  characters: Character[]
  mainName: string
  mainAvatar?: string
  userName: string
  tap: Tap
  onFocus: (event: FocusEvent<HTMLElement>) => void
  onChange: (transform: (persona: PersonaWindow) => PersonaWindow) => void
  /** 请出：页面顺手在后台整理他的窗口记忆。 */
  onDismiss: (guestId: string) => void
  onExtract: (guestId: string) => void
  busy: (guestId: string) => boolean
}) {
  const [query, setQuery] = useState('')
  const [pickOpen, setPickOpen] = useState(false)
  const [draftOpen, setDraftOpen] = useState(false)
  const [draft, setDraft] = useState({ name: '', avatar: '', persona: '', world: '' })
  const [openId, setOpenId] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const guests = persona.guests || []
  const presentIds = (thread.memberIds || []).filter((id) => guests.some((guest) => guest.id === id))
  const present = presentIds.map((id) => guests.find((guest) => guest.id === id)!).filter(Boolean)
  const absent = guests.filter((guest) => !presentIds.includes(guest.id))
  const full = presentIds.length >= PERSONA_GROUP_GUEST_LIMIT
  const mode = replyModeOf(thread)
  const reserved = [mainName, userName]
  const q = query.trim().toLocaleLowerCase()
  const cardChoices = characters.filter((character) => character.id !== persona.characterId && !guests.some((guest) => guest.source === 'card' && guest.characterId === character.id) && (!q || character.name.toLocaleLowerCase().includes(q) || (character.libraryGroup || '').toLocaleLowerCase().includes(q))).slice(0, 60)

  const addCard = (character: Character) => {
    if (full) return
    onChange((current) => addGuest(current, thread.id, { source: 'card', characterId: character.id, name: character.name, ...(character.avatar ? { avatar: character.avatar } : {}) }, reserved).persona)
    setPickOpen(false); setQuery('')
  }
  const addCustom = () => {
    if (full || !draft.name.trim()) return
    onChange((current) => addGuest(current, thread.id, { source: 'custom', name: draft.name, ...(draft.avatar.trim() ? { avatar: draft.avatar.trim() } : {}), ...(draft.persona.trim() ? { persona: draft.persona } : {}), ...(draft.world.trim() ? { world: draft.world } : {}) }, reserved).persona)
    setDraft({ name: '', avatar: '', persona: '', world: '' }); setDraftOpen(false)
  }
  const pickAvatar = async (file: File | undefined) => {
    setAvatarError('')
    if (!file) return
    if (!/^image\//.test(file.type) && !/\.(?:jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)) { setAvatarError('请选一张图片。'); return }
    try { const avatar = await squareAvatarFromFile(file); setDraft((current) => ({ ...current, avatar })) } catch { setAvatarError('这张图读不出来，换一张试试。') }
  }
  const setMode = (next: PersonaReplyMode) => onChange((current) => setReplyMode(current, thread.id, next))

  const guestEditor = (guest: PersonaGuest) => {
    const resolved = resolveGuest(guest, characters)
    const pending = pendingGuestCount(persona, guest.id)
    return <div className="persona-guest-editor">
      {guest.source === 'custom' && <label className="persona-memory-field"><strong>人设</strong><textarea rows={3} maxLength={8000} value={guest.persona || ''} onFocus={onFocus} placeholder="他是谁、性格和说话方式" onChange={(event) => { const value = event.target.value; onChange((current) => updateGuest(current, guest.id, { persona: value })) }} /></label>}
      <label className="persona-memory-field"><strong>他的世界观</strong><textarea rows={3} maxLength={8000} value={guest.world || ''} onFocus={onFocus} placeholder={guest.source === 'card' ? '不填就只借人不借戏：不带原卡剧情和人物关系；想让他带着自己的故事来就写在这里' : '他来自哪里、那个世界的规则'} onChange={(event) => { const value = event.target.value; onChange((current) => updateGuest(current, guest.id, { world: value })) }} /><small>{guest.source === 'card' ? `性格与说话方式实时读角色卡「${resolved.name}」，原卡剧情不带进来。` : '随这张简卡保存在人格窗口里。'}</small></label>
      <div className="persona-guest-memory">
        <div><strong>他在这扇窗口的记忆（{guest.memories.length}）</strong><small>只记他在场时的事，不进 {mainName} 的长期记忆。{pending ? `有 ${pending} 条新消息待整理。` : ''}</small></div>
        {guest.memories.slice().reverse().slice(0, 20).map((entry) => <div key={entry.id} className="persona-guest-memory-row"><span><b>{entry.title}</b>{entry.content}</span><button className="danger-link" aria-label={`删除记忆${entry.title}`} {...tap(() => onChange((current) => updateGuest(current, guest.id, { memories: (current.guests || []).find((item) => item.id === guest.id)?.memories.filter((item) => item.id !== entry.id) || [] })))}>删除</button></div>)}
        <button className="soft-button" disabled={busy(guest.id) || pending < 2} {...tap(() => onExtract(guest.id))}>{busy(guest.id) ? '正在整理…' : `整理他的新记忆（${pending} 条）`}</button>
      </div>
      <button className="danger-link" {...tap(() => { if (window.confirm(`彻底删除客人「${resolved.name}」和他在这里的记忆？他说过的话会保留。`)) { onChange((current) => deleteGuest(current, guest.id)); setOpenId(null) } })}>彻底删除这位客人</button>
    </div>
  }

  const guestRow = (guest: PersonaGuest, isPresent: boolean) => {
    const resolved = resolveGuest(guest, characters)
    return <article key={guest.id} className="persona-guest-row">
      <div className="persona-guest-head">
        <button className="persona-guest-main" aria-expanded={openId === guest.id} {...tap(() => setOpenId(openId === guest.id ? null : guest.id))}><GuestAvatar name={resolved.name} avatar={resolved.avatar} /><span><strong>{resolved.name}</strong><small>{guest.source === 'card' ? '角色卡' : '手写简卡'} · {guest.memories.length} 条窗口记忆</small></span></button>
        {isPresent
          ? <button className="soft-button" {...tap(() => onDismiss(guest.id))}>请出</button>
          : <button className="soft-button" disabled={full} {...tap(() => onChange((current) => inviteGuest(current, thread.id, guest.id)))}>拉回</button>}
      </div>
      {openId === guest.id && guestEditor(guest)}
    </article>
  }

  return <section className="persona-group-panel">
    <div className="persona-prompt-note"><strong>临时群聊</strong><p>把别的角色拉进这扇窗口，像长剧情一样一起接戏。{mainName} 始终在场；请出的客人卡和记忆都留着，拉回来还记得。只有 {mainName} 时，一切和平常一样。</p></div>

    <p className="persona-settings-caption">回复方式</p>
    <div className="persona-group-modes" role="radiogroup" aria-label="回复方式">
      <button role="radio" aria-checked={mode === 'mention'} className={mode === 'mention' ? 'on' : ''} {...tap(() => setMode('mention'))}><strong>@ 点名</strong><small>你 @ 谁谁说，点几个按顺序各回一条；没 @ 就是 {mainName}</small></button>
      <button role="radio" aria-checked={mode === 'natural'} className={mode === 'natural' ? 'on' : ''} {...tap(() => setMode('natural'))}><strong>自然接话</strong><small>由 TA 们自己判断谁接话，每轮最多 3 人</small></button>
    </div>

    <p className="persona-settings-caption">在场（{presentIds.length + 1}）</p>
    <div className="persona-group-list">
      <article className="persona-guest-row"><div className="persona-guest-head"><span className="persona-guest-main"><span className="persona-avatar small">{mainAvatar ? <img src={mainAvatar} alt="" /> : mainName.slice(-1)}</span><span><strong>{mainName}</strong><small>窗口主人 · 始终在场</small></span></span></div></article>
      {present.map((guest) => guestRow(guest, true))}
    </div>

    <div className="persona-group-add">
      <button className="secondary-button" disabled={full} aria-expanded={pickOpen} {...tap(() => { setPickOpen(!pickOpen); setDraftOpen(false) })}>＋ 从角色卡拉人</button>
      <button className="secondary-button" disabled={full} aria-expanded={draftOpen} {...tap(() => { setDraftOpen(!draftOpen); setPickOpen(false) })}>＋ 手写简卡</button>
    </div>
    {full && <small className="persona-drawer-hint">同时最多 {PERSONA_GROUP_GUEST_LIMIT} 位客人，先请出一位再拉人。</small>}
    {pickOpen && !full && <div className="persona-group-pick">
      <input className="persona-search" value={query} onFocus={onFocus} onChange={(event) => setQuery(event.target.value)} placeholder="搜索角色名或分组" />
      <div className="persona-library">
        {cardChoices.map((character) => <button key={character.id} className="persona-library-item" {...tap(() => addCard(character))}><GuestAvatar name={character.name} avatar={character.avatar} /><span><strong>{character.name}</strong><small>{character.tagline || character.libraryGroup || '拉进这扇窗口'}</small></span><i>＋</i></button>)}
        {!cardChoices.length && <p className="persona-empty">没有可拉的角色卡了。</p>}
      </div>
    </div>}
    {draftOpen && !full && <div className="persona-group-draft">
      <label className="persona-memory-field"><strong>名字</strong><input value={draft.name} maxLength={40} onFocus={onFocus} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：阿七" /></label>
      <div className="persona-memory-field"><strong>头像（可选）</strong><div className="persona-group-avatar-field"><GuestAvatar name={draft.name || '?'} avatar={draft.avatar} /><input value={isImageAvatar(draft.avatar) ? '' : draft.avatar} maxLength={4} onFocus={onFocus} onChange={(event) => setDraft({ ...draft, avatar: event.target.value })} placeholder="一个 emoji" /><button type="button" className="soft-button" {...tap(() => fileRef.current?.click())}>选图</button>{draft.avatar && <button type="button" className="danger-link" {...tap(() => setDraft({ ...draft, avatar: '' }))}>清除</button>}</div>{avatarError && <small>{avatarError}</small>}<input ref={fileRef} type="file" hidden onChange={(event) => { const file = event.currentTarget.files?.[0]; void pickAvatar(file).finally(() => { if (fileRef.current) fileRef.current.value = '' }) }} /></div>
      <label className="persona-memory-field"><strong>人设</strong><textarea rows={3} maxLength={8000} value={draft.persona} onFocus={onFocus} onChange={(event) => setDraft({ ...draft, persona: event.target.value })} placeholder="他是谁、性格和说话方式" /></label>
      <label className="persona-memory-field"><strong>世界观（可选）</strong><textarea rows={3} maxLength={8000} value={draft.world} onFocus={onFocus} onChange={(event) => setDraft({ ...draft, world: event.target.value })} placeholder="他来自哪里、那个世界的规则" /></label>
      <button className="primary-button" disabled={!draft.name.trim()} {...tap(addCustom)}>拉进这扇窗口</button>
    </div>}

    {absent.length > 0 && <><p className="persona-settings-caption">不在场的客人（{absent.length}）</p>
      <div className="persona-group-list">{absent.map((guest) => guestRow(guest, false))}</div></>}
  </section>
}
