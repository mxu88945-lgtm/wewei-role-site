import { useState } from 'react'
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
