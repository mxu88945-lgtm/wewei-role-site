import { useEffect, useState } from 'react'
import type { DirectorTemplateConfig } from './directorTemplate'

type Props = {
  value: DirectorTemplateConfig
  onCancel: () => void
  onSave: (value: DirectorTemplateConfig) => void
  existing?: boolean
}

const fields: Array<{ key: keyof DirectorTemplateConfig; label: string; hint: string; rows?: number; placeholder: string }> = [
  { key: 'directorName', label: '导演名称', hint: '只影响群聊里显示的名字，不改变权限边界。', placeholder: '共演厅·旁白导演' },
  { key: 'storyTitle', label: '剧目名称', hint: '这一份导演实例属于哪个故事。', placeholder: '例如：归国后的第三天' },
  { key: 'worldBackground', label: '公开世界背景', hint: '时代、地点、势力与所有成员都应该知道的事实。', rows: 6, placeholder: '不要把幕后秘密写在这里……' },
  { key: 'userProtagonist', label: '用户主角', hint: '写清身份与已公开经历；无论怎样都由用户本人控制。', rows: 5, placeholder: '姓名、身份、公开经历、当前目标……' },
  { key: 'independentRoles', label: '独立角色卡', hint: '列出群聊里各自独立发言的角色；导演绝不代演。', rows: 5, placeholder: '角色名｜身份｜与用户关系｜由独立角色卡控制' },
  { key: 'npcRoster', label: '导演可演 NPC', hint: '只放没有独立角色卡的人物；也可允许临时路人。', rows: 6, placeholder: 'NPC 名｜身份｜表层立场｜知道什么……' },
  { key: 'hiddenTruths', label: '幕后真相与知情边界', hint: '只进入导演私有世界书，不共享给其他角色。', rows: 7, placeholder: '真相｜当前知情者｜未知者｜揭露条件……' },
  { key: 'plotThreads', label: '剧情阶段与推进线', hint: '写阶段门槛、事件触发与不可提前发生的变化。', rows: 8, placeholder: '阶段一…\n进入阶段二的硬条件…\n阶段三…' },
  { key: 'openingState', label: '开场锚点', hint: '新群聊开始时的时间、地点、在场者和悬而未决的事。', rows: 5, placeholder: '时间｜地点｜在场人物｜当前事件……' },
  { key: 'pacingNotes', label: '节奏补充', hint: '模板已经限制每轮只推进一小步，这里写本剧特色。', rows: 5, placeholder: '例如：商战线写实，感情变化必须由明确事件累积……' },
]

export default function DirectorTemplateEditor({ value, onCancel, onSave, existing }: Props) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return <>
    <header className="page-header"><button className="icon-button" onClick={onCancel}>‹</button><h1>共演导演资料</h1><div className="header-action"><span className="saved-label">{existing ? '本群专属' : '新建实例'}</span></div></header>
    <section className="content-stack director-editor-page">
      <div className="director-rule-card"><strong>模板权限已经锁死</strong><p>导演只演 NPC、环境和剧情推进；不演用户主角，不演任何独立角色卡。幕后资料只进入导演私有世界书。</p></div>
      {fields.map((field) => <label className="director-field" key={field.key}><span><strong>{field.label}</strong><small>{field.hint}</small></span>{field.rows ? <textarea rows={field.rows} value={String(draft[field.key] || '')} placeholder={field.placeholder} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} /> : <input value={String(draft[field.key] || '')} placeholder={field.placeholder} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} />}</label>)}
      <button className="primary-button full" onClick={() => onSave(draft)}>{existing ? '保存并更新本群导演' : '保存导演资料'}</button>
    </section>
  </>
}
