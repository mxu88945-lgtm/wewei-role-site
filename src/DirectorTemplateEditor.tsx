import { useEffect, useState } from 'react'
import type { Character } from './characterCard'
import { completeChat, type ApiConfig } from './chatApi'
import { buildDirectorCardAssistantInput, parseDirectorCardAssistantResponse } from './directorCardAssistant'
import type { DirectorTemplateConfig } from './directorTemplate'

type Props = {
  value: DirectorTemplateConfig
  onCancel: () => void
  onSave: (value: DirectorTemplateConfig) => void
  existing?: boolean
  contextLabel?: string
  submitLabel?: string
  sourceCharacters?: Character[]
  userName?: string
  api?: ApiConfig
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
  { key: 'temporaryPlot', label: '临时剧情推进（可后期填写）', hint: '不绑定剧情仓也能用。填写后会持续作为导演的当前推进方向，写完记得手动清空；只推动 NPC、环境和外部事件，不替用户或独立角色做决定。', rows: 8, placeholder: '例如：今晚让旧案出现一条新线索，先由门外的快递和一通匿名电话把悬念递进来，停在用户可以回应的位置……' },
  { key: 'openingState', label: '开场锚点', hint: '新群聊开始时的时间、地点、在场者和悬而未决的事。', rows: 5, placeholder: '时间｜地点｜在场人物｜当前事件……' },
  { key: 'pacingNotes', label: '节奏补充', hint: '模板已经限制每轮只推进一小步，这里写本剧特色。', rows: 5, placeholder: '例如：商战线写实，感情变化必须由明确事件累积……' },
]

export default function DirectorTemplateEditor({ value, onCancel, onSave, existing, contextLabel, submitLabel, sourceCharacters = [], userName = '用户', api }: Props) {
  const [draft, setDraft] = useState(value)
  const [assistantState, setAssistantState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [assistantMessage, setAssistantMessage] = useState('')
  useEffect(() => {
    setDraft(value)
    setAssistantState('idle')
    setAssistantMessage('')
  }, [value])

  const autoFill = async () => {
    if (!sourceCharacters.length) {
      setAssistantState('error')
      setAssistantMessage('请先在上一步选择至少一张独立角色卡。')
      return
    }
    if (!api?.apiKey?.trim() || !api.baseUrl?.trim() || !api.modelName?.trim()) {
      setAssistantState('error')
      setAssistantMessage('当前 API 还没有可用的密钥或模型，请先去 API 设置。')
      return
    }

    setAssistantState('working')
    setAssistantMessage(`正在读取 ${sourceCharacters.length} 张独立角色卡、开场白和世界书…`)
    let response = ''
    try {
      const input = buildDirectorCardAssistantInput({ current: draft, characters: sourceCharacters, userName })
      await completeChat({
        api,
        messages: [
          { role: 'system', content: '你是公演导演卡整理助手。只整理明确来源的角色卡资料，只输出合法 JSON，不续写剧情。' },
          { role: 'user', content: input },
        ],
        temperature: .1,
        topP: 1,
        maxTokens: 9000,
        streaming: false,
        signal: new AbortController().signal,
        onDelta: (delta) => { response += delta },
      })
      setDraft(parseDirectorCardAssistantResponse(response, draft))
      setAssistantState('done')
      setAssistantMessage('导演卡草稿已填好。请快速看一遍，确认后再保存；以后换一批独立角色卡时可以重新生成。')
    } catch (error) {
      setAssistantState('error')
      setAssistantMessage(error instanceof Error ? error.message : '自动整理失败，请重试。')
    }
  }

  return <>
    <header className="page-header"><button className="icon-button" onClick={onCancel}>‹</button><h1>共演导演资料</h1><div className="header-action"><span className="saved-label">{contextLabel || (existing ? '本群专属' : '新建实例')}</span></div></header>
    <section className="content-stack director-editor-page">
      <div className={`director-assistant-card ${assistantState}`}><span>✦</span><div><strong>导演卡自动整理</strong><small>{assistantMessage || `已选 ${sourceCharacters.length} 张独立角色卡；助手会读取角色卡主体、开场白和世界书，生成下方各项内容。`}</small></div><button disabled={assistantState === 'working'} onClick={() => void autoFill()}>{assistantState === 'working' ? '正在读取…' : assistantState === 'done' ? '重新生成' : '读取角色卡自动填写'}</button></div>
      {sourceCharacters.length ? <div className="director-source-cards"><small>本次导演卡的资料来源</small><div>{sourceCharacters.map((character) => <span key={character.id}>{character.avatar ? <img src={character.avatar} alt="" /> : character.name.slice(-1)}{character.name}</span>)}</div></div> : <div className="director-source-empty">还没有绑定独立角色卡。返回上一步选择角色后，就能让助手自动整理。</div>}
      <div className="director-rule-card"><strong>模板权限已经锁死</strong><p>导演只演 NPC、环境和剧情推进；不演用户主角，不演任何独立角色卡。幕后资料只进入导演私有世界书。</p></div>
      {fields.map((field) => <label className="director-field" key={field.key}><span><strong>{field.label}</strong><small>{field.hint}</small></span>{field.rows ? <textarea rows={field.rows} value={String(draft[field.key] || '')} placeholder={field.placeholder} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} /> : <input value={String(draft[field.key] || '')} placeholder={field.placeholder} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} />}</label>)}
      <button className="primary-button full" onClick={() => onSave(draft)}>{submitLabel || (existing ? '保存并更新本群导演' : '保存导演资料')}</button>
    </section>
  </>
}
