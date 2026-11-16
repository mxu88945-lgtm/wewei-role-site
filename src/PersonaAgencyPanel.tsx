import { useState } from 'react'
import type { PersonaTap } from './PersonaTaskCards'
import { canAskNote, currentBody, formatLeft, pauseActive, type PersonaBodyState, type PersonaPause, type PersonaPrivateNote } from './personaAgency'

const day = (at: number) => new Date(at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })

function Toggle({ title, note, on, onToggle, tap }: { title: string; note: string; on: boolean; onToggle: () => void; tap: PersonaTap }) {
  return <div className="persona-toggle-row"><div><strong>{title}</strong><small>{note}</small></div><button className={`switch ${on ? 'on' : ''}`} aria-label={title} aria-pressed={on} {...tap(onToggle)}><span /></button></div>
}

/** v261：TA 的小天地——暂停的权利、隐私室、身体状态（各一个开关，默认关）。 */
export default function PersonaAgencyPanel({ name, flags, pause, room, body, busy, onToggle, onAsk, tap }: {
  name: string
  flags: { pause: boolean; room: boolean; body: boolean }
  pause?: PersonaPause
  room: PersonaPrivateNote[]
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
    <Toggle title="身体状态" note={`${name}会累、会困：久聊精力会降，深夜容易困，歇一阵就恢复。只悄悄影响语气，每轮多带一行。`} on={flags.body} onToggle={() => onToggle('body')} tap={tap} />
    {state && <p className="persona-agency-status">精力 {state.energy} · 困意 {state.sleepy}{state.note ? ` · ${state.note}` : ''}</p>}
  </section>
}
