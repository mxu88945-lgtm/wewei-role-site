import { useState } from 'react'
import type { PresetSection } from './presetConfig'

type Props = { sections: PresetSection[]; onChange: (sections: PresetSection[]) => void; onBack: () => void }

export default function PresetEditor({ sections, onChange, onBack }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = sections.find((section) => section.id === editingId)

  const patch = (id: string, next: Partial<PresetSection>) => onChange(sections.map((section) => section.id === id ? { ...section, ...next } : section))
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= sections.length) return
    const next = [...sections]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  const add = () => {
    const section = { id: crypto.randomUUID(), name: `自定义提示词 ${sections.length + 1}`, content: '', enabled: true }
    onChange([...sections, section])
    setEditingId(section.id)
  }

  return <section className="preset-page">
    <header className="page-header"><button className="icon-button" onClick={onBack}>‹</button><h1>编辑预设</h1><span className="saved-label">自动保存</span></header>
    <div className="preset-intro"><div><strong>全局提示词</strong><small>{sections.filter((item) => item.enabled).length} / {sections.length} 条启用 · 从上到下发送</small></div><button onClick={add}>＋ 添加</button></div>
    <div className="preset-list">
      {sections.map((section, index) => <article className={`preset-row${section.enabled ? '' : ' disabled'}`} key={section.id}>
        <div className="preset-order"><button disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button disabled={index === sections.length - 1} onClick={() => move(index, 1)}>↓</button></div>
        <button className="preset-row-main" onClick={() => setEditingId(section.id)}><strong>{section.name}</strong><small>{section.content || '点击填写提示词内容'}</small></button>
        <button className={`switch ${section.enabled ? 'on' : ''}`} aria-label={section.enabled ? '停用' : '启用'} onClick={() => patch(section.id, { enabled: !section.enabled })}><span /></button>
      </article>)}
    </div>
    <div className="privacy-note">栏目顺序就是注入顺序。关闭后内容仍会保留，但不会发送给模型。</div>

    {editing && <div className="preset-editor-layer">
      <button className="preset-editor-backdrop" aria-label="关闭编辑" onClick={() => setEditingId(null)} />
      <section className="preset-editor-sheet">
        <header><div><small>编辑提示词栏目</small><strong>{editing.name}</strong></div><button onClick={() => setEditingId(null)}>×</button></header>
        <label>名称<input value={editing.name} onChange={(event) => patch(editing.id, { name: event.target.value })} /></label>
        <label>内容<textarea rows={12} value={editing.content} onChange={(event) => patch(editing.id, { content: event.target.value })} placeholder="填写会发送给模型的提示词…" /></label>
        <div className="preset-editor-actions"><button className="danger-link" onClick={() => { if (sections.length > 1 && window.confirm(`删除“${editing.name}”？`)) { onChange(sections.filter((item) => item.id !== editing.id)); setEditingId(null) } }}>删除栏目</button><button className="primary-button" onClick={() => setEditingId(null)}>完成</button></div>
      </section>
    </div>}
  </section>
}
