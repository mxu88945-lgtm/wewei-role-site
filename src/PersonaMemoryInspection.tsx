import { useEffect, useState, type PointerEvent } from 'react'
import { formatPersonaStatusTime, personaCompressionStatus } from './personaCompressionStatus'
import type { PersonaWindow } from './personaWindow'
import type { PersonaMemoryAudit, PersonaRecallSource } from './personaWindowMemory'
import { personaReplyText } from './personaWindowPresentation'

export function PersonaMemoryInspection({ audit }: { audit?: PersonaMemoryAudit }) {
  return <section className="persona-source-card persona-memory-inspection">
    <strong>本轮记忆使用记录</strong>
    {!audit ? <small>发送一条消息后，这里会显示实际带入的记忆。查看请求预览不会消耗召回冷却。</small> : <>
      <small>自动记忆层 {audit.used.toLocaleString()} / {audit.budget.toLocaleString()} 字 · 旧原文 {audit.sources.length} 个来源</small>
      {audit.query && <small>检索依据：{audit.query}</small>}
      {audit.lanes.map((lane) => <details key={lane.key}><summary>{lane.label} · {lane.chars ? `${lane.chars} 字` : '未带入'}{lane.key === 'original' ? ` · 命中 ${lane.selected} / 候选 ${lane.candidates}${lane.suppressed ? ` · 冷却 ${lane.suppressed}` : ''}` : ''}</summary><pre>{lane.preview || '这一层本轮没有相关内容。'}</pre></details>)}
    </>}
  </section>
}

/** Large originals stay out of the message DOM until she opens a receipt. */
export function PersonaRecallReceipt({ sources, persona }: { sources: PersonaRecallSource[]; persona: PersonaWindow }) {
  const [open, setOpen] = useState(false)
  return <details className="persona-recall-receipt" onToggle={(event) => setOpen(event.currentTarget.open)}><summary>已召回 {sources.length} 条旧原文</summary>{open && sources.map((source) => {
    const thread = persona.threads.find((item) => item.id === source.threadId)
    const message = thread?.messages.find((item) => item.id === source.messageId)
    const text = message ? message.role === 'assistant' ? personaReplyText(message.text) : message.text : ''
    return <div key={`${source.threadId}-${source.messageId}`}><small>{thread?.title || source.title} · {source.role === 'user' ? '你的原话' : 'TA 的原话'}{source.createdAt ? ` · ${new Date(source.createdAt).toLocaleString()}` : ''}</small><pre>{text ? `${Array.from(text).slice(0, 6000).join('')}${text.length > 6000 ? '\n【原文较长，可到来源窗口查看完整内容】' : ''}` : '来源消息已被删除，当前不再提供这条原文。'}</pre></div>
  })}</details>
}

type CompressionInput = Omit<Parameters<typeof personaCompressionStatus>[0], 'now'>

/** v225：本窗连续性档案状态（只读），条件与后台整理一致；满 240 条且没有阻碍时才给「现在整理」。 */
export function PersonaCompressionCard({ input, onCompress, tap }: { input: CompressionInput; onCompress: () => void; tap: (action: () => void) => { onPointerUp: (event: PointerEvent) => void; onClick: () => void } }) {
  const [now, setNow] = useState(() => Date.now())
  const [open, setOpen] = useState(false)
  const failureAt = input.failure?.at
  useEffect(() => {
    setNow(Date.now())
    if (!failureAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [failureAt, input.running])
  const status = personaCompressionStatus({ ...input, now })
  const { archive } = status
  return <section className="persona-source-card persona-compression-card">
    <strong>连续性档案</strong>
    <small>本窗 {status.outstanding.toLocaleString()} / {status.trigger} 条待整理 · 共 {status.total.toLocaleString()} 条消息</small>
    {archive
      ? <small>上次整理：{archive.updatedAt ? formatPersonaStatusTime(archive.updatedAt) : '时间未记录'} · 已整理到第 {archive.through.toLocaleString()} 条 · 保留最近 {status.keepRecent} 条原文{archive.fallback ? <span className="persona-compression-tag">本地摘录（模型无正文）</span> : null}</small>
      : <small>还没整理过，满 {status.trigger} 条后自动整理</small>}
    {status.blockers.map((blocker) => <small key={blocker.kind} className={`persona-compression-blocker ${blocker.kind}`}>{blocker.label}</small>)}
    {archive && <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>查看档案原文 · {archive.text.length.toLocaleString()} 字（只读）</summary>{open && <pre>{archive.text}</pre>}</details>}
    {status.canCompressNow && <button type="button" className="secondary-button persona-compression-now" {...tap(onCompress)}>现在整理</button>}
  </section>
}
