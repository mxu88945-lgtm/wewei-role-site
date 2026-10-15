import { useState } from 'react'
import { NOTICE_DURATIONS, PHONE_REPLY_MODES, noticeRemaining, type PhoneReplyMode } from './phoneGroup'
import { readPoints, todayTopPoints } from './phonePoints'

type Member = { id: string; name: string; avatar?: string }
type Notice = { text: string; at: number; until?: number | null } | null | undefined

/** 小手机「聊天信息」页（微信样式）：成员、群公告、积分榜、谁来回，都收在这里，不再挂在聊天页顶上。 */
export function PhoneChatInfo({ title, dm, members, notice, mode, onMode, onSaveNotice, onClose, onSearch, onGroupSettings, onChatSettings }: {
  title: string
  dm: boolean
  members: Member[]
  notice: Notice
  mode: PhoneReplyMode
  onMode: (mode: PhoneReplyMode) => void
  onSaveNotice: (text: string, hours: number) => void
  onClose: () => void
  onSearch: () => void
  onGroupSettings?: () => void
  onChatSettings: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(notice?.text || '')
  const [hours, setHours] = useState<number>(24)
  const points = readPoints()
  const today = todayTopPoints(points, members, Date.now(), 99)
  const totals = members.map((member) => ({ ...member, points: points.balances[member.id] || 0 })).sort((a, b) => b.points - a.points)
  const medal = (index: number) => ['🥇', '🥈', '🥉'][index] || `${index + 1}.`
  return <div className="wx-info-layer" role="dialog" aria-modal="true" aria-label="聊天信息">
    <header className="wx-info-header"><button aria-label="返回" onClick={onClose}>‹</button><strong>聊天信息{dm ? '' : `（${members.length}）`}</strong><button aria-label="查找聊天内容" onClick={onSearch}>⌕</button></header>
    <div className="wx-info-scroll">
      <section className="wx-info-members">
        {members.map((member) => <div key={member.id}>{member.avatar ? <img src={member.avatar} alt="" /> : <i>{member.name.slice(-1)}</i>}<span>{member.name}</span></div>)}
        {onGroupSettings && <button aria-label="管理成员" onClick={onGroupSettings}><i>＋</i><span /></button>}
      </section>
      {!dm && <section className="wx-info-group">
        <button onClick={onGroupSettings}><span>群聊名称</span><em>{title}</em><b>›</b></button>
        {!editing ? <button className="wx-info-notice" onClick={() => { setText(notice?.text || ''); setEditing(true) }}>
          <span>群公告</span><b>›</b>
          <p>{notice?.text || '未设置（写了之后群里每个人都会看到并照着来）'}</p>
          {notice?.text && <small>{noticeRemaining(notice.until)}</small>}
        </button> : <div className="wx-info-notice-edit">
          <span>群公告</span>
          <textarea rows={4} maxLength={200} value={text} autoFocus onFocus={(event) => { const el = event.currentTarget; window.setTimeout(() => el.scrollIntoView({ block: 'center' }), 300) }} onChange={(event) => setText(event.target.value)} placeholder="例如：今晚谁先提吃饭谁扣 5 分。" />
          <div className="wx-info-chips">{NOTICE_DURATIONS.map((item) => <button key={item.hours} className={hours === item.hours ? 'active' : ''} onClick={() => setHours(item.hours)}>{item.label}</button>)}</div>
          <div className="wx-info-notice-actions"><button onClick={() => setEditing(false)}>取消</button>{notice?.text && <button onClick={() => { onSaveNotice('', 0); setText(''); setEditing(false) }}>撤下</button>}<button className="primary" onClick={() => { onSaveNotice(text.trim(), hours); setEditing(false) }}>发布</button></div>
        </div>}
      </section>}
      {!dm && <section className="wx-info-group wx-info-points">
        <div className="wx-info-title"><span>积分榜</span><small>群里每个人都看得到排名</small></div>
        <p className="wx-info-sub">今日</p>
        {today.length ? <ol>{today.map((item, index) => <li key={item.id}><b>{medal(index)}</b><span>{item.name}</span><em>+{item.points}</em></li>)}</ol> : <p className="wx-info-empty">今天还没人拿到分</p>}
        <p className="wx-info-sub">总积分</p>
        <ol>{totals.map((item, index) => <li key={item.id}><b>{medal(index)}</b><span>{item.name}</span><em>{item.points}</em></li>)}</ol>
      </section>}
      {!dm && <section className="wx-info-group">
        <div className="wx-info-title"><span>谁来回</span></div>
        {PHONE_REPLY_MODES.map((item) => <button key={item.id} className={`wx-info-mode${mode === item.id ? ' active' : ''}`} onClick={() => onMode(item.id)}><span>{item.label}<small>{item.hint}</small></span><b>{mode === item.id ? '✓' : ''}</b></button>)}
      </section>}
      <section className="wx-info-group">
        <button onClick={onSearch}><span>查找聊天内容</span><b>›</b></button>
        {onGroupSettings && <button onClick={onGroupSettings}><span>群设置（成员、头像、规则）</span><b>›</b></button>}
        <button onClick={onChatSettings}><span>聊天设置（背景、模型、记忆）</span><b>›</b></button>
      </section>
    </div>
  </div>
}
