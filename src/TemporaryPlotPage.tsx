import { useState } from 'react'
export type PlotTemplate = { id: string; title: string; text: string; updatedAt: number }

export default function TemporaryPlotPage({ value, onChange, templates, onTemplatesChange, onBack }: { value: string; onChange: (value: string) => void; templates: PlotTemplate[]; onTemplatesChange: (templates: PlotTemplate[]) => void; onBack: () => void }) {
  const [title, setTitle] = useState('')
  const [notice, setNotice] = useState('')
  const saveTemplate = () => {
    if (!value.trim() || !title.trim()) return
    onTemplatesChange([...templates, { id: crypto.randomUUID(), title: title.trim(), text: value, updatedAt: Date.now() }])
    setTitle(''); setNotice('已加入收藏，其他对话也可选用；只有载入后才会发送。')
  }
  const loadTemplate = (template: PlotTemplate) => {
    if (value.trim() && value !== template.text && !window.confirm('载入这份收藏并替换当前临时剧情？')) return
    onChange(template.text); setNotice(`已载入「${template.title}」，可继续修改。`)
  }
  return <section className="story-tools-page">
    <header className="story-tools-header"><button onClick={onBack} aria-label="返回聊天设置">‹</button><h2>临时剧情</h2><span>自动保存</span></header>
    <p>仅本对话生效。下一次 @ 谁，就交给被点名的模型；单人聊天直接发送或续演即可。原文不作为聊天消息显示。</p>
    <label>下一次回复的幕后安排<textarea rows={12} value={value} onChange={(event) => onChange(event.target.value)} placeholder="例如：让他接到一通紧急电话，发现之前忽略的线索……" /></label>
    <div className="story-tools-actions"><button disabled={!value} onClick={() => onChange('')}>清空 / 取消</button></div>
    <p>成功回复后清空；失败或停止时保留。一次 @ 多人时，所有被点名的角色读取本次安排。生成期间的新修改留给下一轮。</p>
    <article className="story-tools-card"><h3>收藏当前安排</h3><label>收藏名称<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="突发来电、配角入场……" /></label><button className="secondary-button" disabled={!title.trim() || !value.trim()} onClick={saveTemplate}>保存到剧情收藏</button></article>
    <h3>剧情收藏（{templates.length}）</h3>
    {templates.map((template) => <article className="story-tools-card" key={template.id}><strong>{template.title}</strong><p className="story-tools-excerpt">{template.text.slice(0, 160)}{template.text.length > 160 ? '…' : ''}</p><div className="story-tools-actions"><button onClick={() => loadTemplate(template)}>载入并修改</button><button onClick={() => { if (window.confirm(`删除收藏「${template.title}」？当前临时剧情不受影响。`)) onTemplatesChange(templates.filter((item) => item.id !== template.id)) }}>删除收藏</button></div></article>)}
    {!templates.length && <p>还没有收藏。载入收藏不会自动发送，也不会自动 @ 角色。</p>}
    {notice && <p role="status">{notice}</p>}
  </section>
}
