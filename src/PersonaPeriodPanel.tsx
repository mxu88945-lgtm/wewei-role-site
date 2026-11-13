import { useState, type FocusEvent } from 'react'
import type { PersonaTap } from './PersonaTaskCards'
import { addPeriodRange, dayMark, diffDays, markPeriodEnd, markPeriodStart, monthGrid, openEntry, periodStats, removePeriodEntry } from './periodLog'
import { localToday, periodStore, usePeriodLog } from './lifeRecordsStore'

const WEEK = ['一', '二', '三', '四', '五', '六', '日']
const md = (date: string) => { const [, m, d] = date.split('-').map(Number); return `${m}月${d}日` }

export default function PersonaPeriodPanel({ name, tap, onFocus }: { name: string; tap: PersonaTap; onFocus?: (event: FocusEvent<HTMLElement>) => void }) {
  const state = usePeriodLog()
  const today = localToday()
  const stats = periodStats(state, today)
  const open = openEntry(state, today)
  const [cursor, setCursor] = useState(() => { const now = new Date(); return { y: now.getFullYear(), m: now.getMonth() } })
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const cells = monthGrid(cursor.y, cursor.m)
  const shift = (delta: number) => setCursor(({ y, m }) => { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const recent = [...state.entries].reverse().slice(0, 6)
  const canAdd = Boolean(start) && diffDays(today, start) >= 0 && (!end || diffDays(end, start) >= 0)
  return <section className="persona-life-panel">
    <div className="persona-period-summary">
      <strong>{stats.label}</strong>
      {stats.hasData && <small>平均周期 {stats.avgCycle} 天 · 经期约 {stats.avgLength} 天{stats.nextStart && stats.phase !== 'period' ? ` · 预计 ${md(stats.nextStart)}` : ''}</small>}
      <div className="persona-period-actions">
        {open
          ? <button className="primary-button" {...tap(() => periodStore.set((s) => markPeriodEnd(s, today)))}>今天结束了</button>
          : <button className="primary-button" disabled={stats.phase === 'period'} {...tap(() => periodStore.set((s) => markPeriodStart(s, today)))}>今天来了</button>}
      </div>
    </div>
    <div className="persona-calendar" aria-label="经期日历">
      <div className="persona-calendar-head">
        <button aria-label="上个月" {...tap(() => shift(-1))}>‹</button>
        <strong>{cursor.y} 年 {cursor.m + 1} 月</strong>
        <button aria-label="下个月" {...tap(() => shift(1))}>›</button>
      </div>
      <div className="persona-calendar-grid">
        {WEEK.map((day) => <span key={day} className="persona-calendar-week">{day}</span>)}
        {cells.map((date, index) => {
          if (!date) return <span key={`blank-${index}`} />
          const mark = dayMark(state, date, today, stats)
          return <span key={date} className={`persona-calendar-day${mark ? ` is-${mark}` : ''}${date === today ? ' is-today' : ''}`} aria-label={`${md(date)}${mark === 'period' ? ' 经期' : mark === 'predicted' ? ' 预测' : ''}`}>{Number(date.slice(8))}</span>
        })}
      </div>
      <p className="persona-calendar-legend"><i className="is-period" />经期<i className="is-predicted" />预测</p>
    </div>
    <div className="persona-memory-field">
      <strong>补记一次</strong>
      <div className="persona-period-range">
        <label><small>开始</small><input type="date" value={start} max={today} onFocus={onFocus} onChange={(event) => setStart(event.target.value)} /></label>
        <label><small>结束（可空）</small><input type="date" value={end} min={start || undefined} max={today} onFocus={onFocus} onChange={(event) => setEnd(event.target.value)} /></label>
      </div>
      <button className="soft-button" disabled={!canAdd} {...tap(() => { if (!canAdd) return; periodStore.set((s) => addPeriodRange(s, start, end || null, today)); setStart(''); setEnd('') })}>添加</button>
    </div>
    {recent.length > 0 && <div className="persona-life-list" aria-label="最近记录">
      {recent.map((entry) => <div key={entry.id} className="persona-life-row">
        <span><strong>{md(entry.start)} – {entry.end ? md(entry.end) : '进行中'}</strong><small>{entry.end ? `${diffDays(entry.end, entry.start) + 1} 天` : ''}</small></span>
        <button className="persona-thread-action danger" aria-label={`删除${md(entry.start)}的记录`} {...tap(() => { if (window.confirm(`删除 ${md(entry.start)} 这次记录？`)) periodStore.set((s) => removePeriodEntry(s, entry.id)) })}>删除</button>
      </div>)}
    </div>}
    <div className="persona-toggle-row"><div><strong>让 {name} 知道</strong><small>经期中、经前几天会悄悄告诉 TA，让 TA 体贴一点。所有人格共用。</small></div><button className={`switch ${state.enabled ? 'on' : ''}`} aria-label={`让${name}知道经期`} aria-pressed={state.enabled} {...tap(() => periodStore.set((s) => ({ ...s, enabled: !s.enabled })))}><span /></button></div>
    <p className="persona-prompt-save">只存在这台设备上，随备份一起导出。预测仅供参考。</p>
  </section>
}
