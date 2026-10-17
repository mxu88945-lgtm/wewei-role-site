import { useEffect, useState, type PointerEvent } from 'react'
import { taskClock, taskIsActive, type PersonaTask } from './personaTasks'

export type PersonaTap = (action: () => void) => { onPointerUp: (event: PointerEvent) => void; onClick: () => void }
function useTaskTime(tasks: PersonaTask[]) {
  const [now, setNow] = useState(Date.now)
  const active = tasks.some(taskIsActive)
  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    tick()
    const timer = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [active])
  return now
}

export function PersonaTaskCards({ tasks, busy, onAction, onReact, tap, compact = false }: { tasks: PersonaTask[]; busy: boolean; onAction: (id: string, action: 'done' | 'cancel') => void; onReact: (id: string) => void; tap: PersonaTap; compact?: boolean }) {
  const now = useTaskTime(tasks)
  return <div className={`persona-task-cards${compact ? ' compact' : ''}`}>{tasks.map((task) => {
    const active = taskIsActive(task), overdue = active && task.dueAt <= now
    const progress = Math.max(0, Math.min(100, (now - task.createdAt) / Math.max(1, task.dueAt - task.createdAt) * 100))
    return <article key={task.id} className={`persona-task-card${overdue ? ' due' : ''}${task.doneAt !== undefined ? ' done' : ''}`}>
      <div className="persona-task-label">{task.doneAt !== undefined ? '✓ 已完成' : task.canceledAt !== undefined ? '已取消' : '◷ 任务卡'}</div>
      <strong>{task.text}</strong>
      <div className="persona-task-count">{active ? overdue ? '⏰ 时间到了' : taskClock(task.dueAt - now) : task.doneAt !== undefined ? `用时 ${taskClock(task.doneAt - task.createdAt)} · ${task.doneAt <= task.dueAt ? '按时完成' : '超时完成'}` : '不再提醒'}</div>
      {active && <><div className="persona-task-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div><div className="persona-task-actions"><button {...tap(() => onAction(task.id, 'done'))}>完成</button><button {...tap(() => onAction(task.id, 'cancel'))}>取消</button></div></>}
      {task.doneAt !== undefined && task.reactedAt === undefined && <button className="soft-button" disabled={busy} {...tap(() => onReact(task.id))}>让 TA 回应</button>}
    </article>
  })}</div>
}

export function PersonaTaskPanel({ tasks, enabled, busy, onEnabled, onCreate, onAction, onReact, tap }: { tasks: PersonaTask[]; enabled: boolean; busy: boolean; onEnabled: () => void; onCreate: (text: string, minutes: number) => void; onAction: (id: string, action: 'done' | 'cancel') => void; onReact: (id: string) => void; tap: PersonaTap }) {
  const [text, setText] = useState(''), [minutes, setMinutes] = useState('30')
  const valid = Boolean(text.trim()) && Number.isFinite(Number(minutes)) && Number(minutes) >= 1 && Number(minutes) <= 10080
  return <section className="persona-task-panel">
    <div className="persona-toggle-row"><div><strong>允许 TA 发任务卡</strong><small>每轮最多一张。已有任务不受开关影响。</small></div><button className={`switch ${enabled ? 'on' : ''}`} aria-label="允许 TA 发任务卡" aria-pressed={enabled} {...tap(onEnabled)}><span /></button></div>
    <p className="persona-prompt-save">任务只属于当前聊天窗口。页面打开时显示倒计时；离开后回来会按实际时间更新，不会在关闭应用后唤醒模型。</p>
    <label className="persona-memory-field"><strong>新任务</strong><input value={text} maxLength={500} placeholder="想让 TA 提醒你什么？" onChange={(event) => setText(event.target.value)} /><span className="persona-task-duration"><input aria-label="任务倒计时分钟" type="number" inputMode="numeric" min={1} max={10080} value={minutes} onChange={(event) => setMinutes(event.target.value)} /> 分钟后</span><button className="primary-button" disabled={!valid} {...tap(() => { if (valid) { onCreate(text.trim(), Number(minutes)); setText('') } })}>创建任务卡</button></label>
    <div className="persona-task-list" role="region" aria-label="当前窗口任务列表" tabIndex={0}><PersonaTaskCards tasks={[...tasks].reverse()} busy={busy} onAction={onAction} onReact={onReact} tap={tap} />{!tasks.length && <p className="persona-empty">还没有任务，也可以在聊天里请 TA 给你一张。</p>}</div>
  </section>
}

export function PersonaTaskPin({ tasks, onOpen, onDone, tap }: { tasks: PersonaTask[]; onOpen: () => void; onDone: (id: string) => void; tap: PersonaTap }) {
  const now = useTaskTime(tasks)
  const first = tasks[0]
  if (!first) return null
  const overdue = first.dueAt <= now
  return <div className="persona-task-pin" role="status" aria-label={`任务倒计时：${first.text}`}>
    <button className="persona-task-pin-body" {...tap(onOpen)} aria-label={`查看任务：${first.text}`}>
      <strong>{first.text}</strong>
      <span className="persona-task-pin-clock">{overdue ? '⏰ 时间到了' : taskClock(first.dueAt - now)}</span>
      {tasks.length > 1 && <em>共 {tasks.length} 项 ›</em>}
    </button>
    <button className="persona-task-pin-done" {...tap(() => onDone(first.id))} aria-label={`完成任务：${first.text}`}>完成</button>
  </div>
}
