import { useRef, useState } from 'react'
import ChatImageViewer from './ChatImageViewer'
import type { PersonaTap } from './PersonaTaskCards'
import { canAskNote, currentBody, formatLeft, pauseActive, type PersonaAlbumPhoto, type PersonaBodyState, type PersonaPause, type PersonaPrivateNote } from './personaAgency'

const day = (at: number) => new Date(at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })

function Toggle({ title, note, on, onToggle, tap }: { title: string; note: string; on: boolean; onToggle: () => void; tap: PersonaTap }) {
  return <div className="persona-toggle-row"><div><strong>{title}</strong><small>{note}</small></div><button className={`switch ${on ? 'on' : ''}`} aria-label={title} aria-pressed={on} {...tap(onToggle)}><span /></button></div>
}

/** v261：TA 的小天地——暂停的权利、隐私室、身体状态（各一个开关，默认关）。 */
export default function PersonaAgencyPanel({ name, flags, pause, room, album = [], albumCode, body, busy, onToggle, onAsk, onAddPhotos, onRemovePhoto, tap }: {
  name: string
  flags: { pause: boolean; room: boolean; body: boolean }
  pause?: PersonaPause
  room: PersonaPrivateNote[]
  album?: PersonaAlbumPhoto[]
  albumCode?: string
  onAddPhotos?: (files: FileList) => void
  onRemovePhoto?: (id: string) => void
  body?: PersonaBodyState
  busy: boolean
  onToggle: (key: 'pause' | 'room' | 'body') => void
  onAsk: (note: PersonaPrivateNote) => void
  tap: PersonaTap
}) {
  const [open, setOpen] = useState<string | null>(null)
  const now = Date.now()
  const state = flags.body ? currentBody(body, now) : null
  const list = [...room].reverse()
  const fileRef = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const [zoom, setZoom] = useState(false)
  // 上锁那格：密码是他设的；猜对了这次打开（离开面板就重新锁上）。
  const [unlocked, setUnlocked] = useState(false)
  const lockedCount = album.filter((photo) => photo.locked).length
  const photos = [...album].reverse().filter((photo) => !photo.locked || unlocked)
  const tryUnlock = () => {
    if (!albumCode) { window.alert(`${name}还没设密码，这格谁都打不开。去问问 TA？`); return }
    const input = window.prompt(`上锁的照片。输入${name}的相册密码：`, '')
    if (input === null) return
    if (input.trim() === albumCode) setUnlocked(true)
    else window.alert('密码不对。去哄哄 TA？')
  }
  return <section className="persona-life-panel persona-agency-panel">
    <Toggle title="暂停的权利" note={`${name}真被伤到、想冷静时，可以暂停这扇窗口 1 分钟到 24 小时。暂停中你写的话会作为「申请继续」递过去，TA 决定接不接。关掉开关就立刻解除。`} on={flags.pause} onToggle={() => onToggle('pause')} tap={tap} />
    {flags.pause && pauseActive(pause, now) && <p className="persona-agency-status">🌙 这扇窗口暂停中，还剩 {formatLeft(pause.until - now)}{pause.reason ? `：「${pause.reason}」` : ''}</p>}
    <Toggle title="隐私室" note={`${name}可以把不想当面说的心事放进隐私室，你只看得到标题。想看哪篇就申请，TA 决定给不给。`} on={flags.room} onToggle={() => onToggle('room')} tap={tap} />
    {flags.room && <div className="persona-gift-shelf persona-room-list" aria-label="隐私室">
      {list.map((note) => <div key={note.id} className="persona-room-row">
        <button type="button" className="persona-room-title" aria-expanded={note.shared ? open === note.id : undefined} {...tap(() => { if (note.shared) setOpen((current) => current === note.id ? null : note.id) })}>
          <span aria-hidden="true">{note.shared ? '🔓' : '🔒'}</span><strong>{note.title}</strong><small>{day(note.at)}</small>
        </button>
        {!note.shared && <button type="button" className="persona-room-ask" disabled={busy || !canAskNote(note, now)} {...tap(() => { if (!busy && canAskNote(note, now)) onAsk(note) })}>{note.declinedAt && !canAskNote(note, now) ? '晚点再问' : '申请看'}</button>}
        {note.shared && open === note.id && <p className="persona-room-text">{note.text}</p>}
      </div>)}
      {!list.length && <p className="persona-empty">还空着。{name}想偷偷写点什么时会放在这里。</p>}
    </div>}
    {flags.room && <div className="persona-album" aria-label="隐私室相册">
      <div className="persona-album-head"><strong>📷 相册</strong><small>{name}能把你发的照片收进来，你也能放</small><button type="button" {...tap(() => fileRef.current?.click())}>＋ 放照片</button></div>
      {photos.length ? <div className="persona-album-grid">{photos.map((photo, index) => <button type="button" key={photo.id} className={`persona-album-item${viewing === index ? ' active' : ''}`} aria-label={photo.caption || '照片'} {...tap(() => setViewing((current) => current === index ? null : index))}>
        <img src={photo.dataUrl} alt="" loading="lazy" decoding="async" draggable={false} />
        <span>{photo.locked ? '🔒 ' : ''}{photo.by === 'char' ? name : '我'}</span>
      </button>)}</div> : album.length ? null : <p className="persona-empty">还没有照片。你发给{name}的图，TA 想留就会收进来。</p>}
      {lockedCount > 0 && <button type="button" className={`persona-album-lock${unlocked ? ' open' : ''}`} {...tap(() => { if (unlocked) { setUnlocked(false); setViewing(null) } else tryUnlock() })}>
        <span aria-hidden="true">{unlocked ? '🔓' : '🔒'}</span><strong>{unlocked ? '上锁的照片已打开' : `上锁的 ${lockedCount} 张`}</strong><small>{unlocked ? '点一下重新锁上' : `密码是${name}设的`}</small>
      </button>}
      {viewing !== null && photos[viewing] && <div className="persona-album-caption">
        <p>{photos[viewing].caption ? `「${photos[viewing].caption}」` : '没写说明'}<small> · {photos[viewing].by === 'char' ? `${name}收的` : '我放的'} · {day(photos[viewing].at)}</small></p>
        <button type="button" {...tap(() => setZoom(true))}>看大图</button>
        {onRemovePhoto && <button type="button" className="danger" {...tap(() => { if (window.confirm('从相册里拿掉这张？')) { onRemovePhoto(photos[viewing].id); setViewing(null) } })}>拿掉</button>}
      </div>}
      {zoom && viewing !== null && photos[viewing] && <ChatImageViewer images={photos.map((photo) => ({ id: photo.id, dataUrl: photo.dataUrl, width: photo.width, height: photo.height }))} startIndex={viewing} onClose={() => setZoom(false)} />}
      <input ref={fileRef} type="file" multiple hidden onChange={(event) => { const files = event.currentTarget.files; if (files?.length && onAddPhotos) onAddPhotos(files); event.currentTarget.value = '' }} />
    </div>}
    <Toggle title="身体状态" note={`${name}会累、会困：久聊精力会降，深夜容易困，歇一阵就恢复。只悄悄影响语气，每轮多带一行。`} on={flags.body} onToggle={() => onToggle('body')} tap={tap} />
    {state && <p className="persona-agency-status">精力 {state.energy} · 困意 {state.sleepy}{state.note ? ` · ${state.note}` : ''}</p>}
  </section>
}
