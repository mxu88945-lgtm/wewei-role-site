import { useMemo, useState } from 'react'
import type { Character } from './characterCard'
import type { ApiConfig } from './chatApi'
import type { ApiChannel } from './apiChannels'
import { createStoryProject, type StoryProject } from './storyProject'
import StoryCockpitEditor from './StoryCockpitEditor'
import { captureAssistantMessageIds } from './storyContinuity'
import './story-project.css'

type ProjectConversation = {
  id: string
  title: string
  characterId: string
  participantIds?: string[]
  directorCharacterId?: string
  participantApiIds?: Record<string, string>
  participantModelNames?: Record<string, string>
  messages: { id: number; role: 'user' | 'assistant'; text: string; characterId?: string }[]
}

type ProjectIdentity = { id: string; name: string; description: string }

type Props = {
  projects: StoryProject[]
  characters: Character[]
  conversations: ProjectConversation[]
  identities: ProjectIdentity[]
  api: ApiConfig
  apiChannels: ApiChannel[]
  onBack: () => void
  onChange: (projects: StoryProject[]) => void
}

const toggleId = (ids: string[], id: string) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]

export default function StoryProjectManager({ projects, characters, conversations, identities, api, apiChannels, onBack, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<StoryProject | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [cockpitProjectId, setCockpitProjectId] = useState<string | null>(null)
  const visibleProjects = useMemo(() => projects.filter((project) => showArchived || project.status === 'active').sort((a, b) => b.updatedAt - a.updatedAt), [projects, showArchived])
  const directorCandidates = characters

  const beginCreate = () => {
    const next = createStoryProject()
    setDraft(next)
    setEditingId(next.id)
  }

  const beginEdit = (project: StoryProject) => {
    setDraft({ ...project, characterIds: [...project.characterIds], conversationIds: [...project.conversationIds] })
    setEditingId(project.id)
  }

  const save = () => {
    if (!draft?.title.trim()) return
    const next = { ...draft, title: draft.title.trim(), summary: draft.summary.trim(), worldBackground: draft.worldBackground.trim(), updatedAt: Date.now() }
    onChange(projects.some((project) => project.id === next.id) ? projects.map((project) => project.id === next.id ? next : project) : [...projects, next])
    setDraft(null)
    setEditingId(null)
  }

  const archive = (project: StoryProject) => {
    const status = project.status === 'archived' ? 'active' : 'archived'
    onChange(projects.map((item) => item.id === project.id ? { ...item, status, updatedAt: Date.now() } : item))
  }

  const remove = (project: StoryProject) => {
    if (!window.confirm(`删除剧本项目“${project.title}”？角色、聊天和记忆不会被删除。`)) return
    onChange(projects.filter((item) => item.id !== project.id))
  }

  const cockpitProject = projects.find((project) => project.id === cockpitProjectId)
  const cockpitConversation = cockpitProject && conversations.find((conversation) => cockpitProject.conversationIds.includes(conversation.id) && conversation.directorCharacterId === cockpitProject.directorCharacterId)
  const cockpitDirectorApiId = cockpitProject?.directorCharacterId ? cockpitConversation?.participantApiIds?.[cockpitProject.directorCharacterId] : undefined
  const cockpitBaseApi = apiChannels.find((channel) => channel.id === cockpitDirectorApiId) || api
  const cockpitApi = cockpitProject?.directorCharacterId && cockpitConversation?.participantModelNames?.[cockpitProject.directorCharacterId] ? { ...cockpitBaseApi, modelName: cockpitConversation.participantModelNames[cockpitProject.directorCharacterId] } : cockpitBaseApi
  if (cockpitProject) return <StoryCockpitEditor project={cockpitProject} characters={characters} conversations={conversations} userName={identities.find((identity) => identity.id === cockpitProject.personaId)?.name || identities[0]?.name || '用户'} api={cockpitApi} onBack={() => setCockpitProjectId(null)} onSetAutoContinuity={(enabled) => {
    const checkpoint = enabled ? captureAssistantMessageIds(cockpitProject, conversations) : cockpitProject.autoContinuity.lastProcessedAssistantMessageIds
    onChange(projects.map((project) => project.id === cockpitProject.id ? { ...project, autoContinuity: { ...project.autoContinuity, enabled, lastProcessedAssistantMessageIds: checkpoint, lastError: undefined, lastSummary: enabled ? '自动场记已开启，将从下一轮完整回复开始更新。' : project.autoContinuity.lastSummary }, updatedAt: Date.now() } : project))
  }} onSave={(cockpit) => {
    onChange(projects.map((project) => project.id === cockpitProject.id ? { ...project, cockpit, updatedAt: Date.now() } : project))
    setCockpitProjectId(null)
  }} />

  if (editingId && draft) return <>
    <header className="page-header"><button className="icon-button" onClick={() => { setEditingId(null); setDraft(null) }}>‹</button><h1>{projects.some((project) => project.id === editingId) ? '编辑剧本项目' : '新建剧本项目'}</h1><div className="header-action"><button className="text-button" disabled={!draft.title.trim()} onClick={save}>保存</button></div></header>
    <section className="content-stack story-project-editor">
      <div className="story-project-note"><strong>项目只负责把资料组织在一起</strong><small>不会迁移、复制或改写已有角色和聊天；剧情进度在驾驶舱独立维护。</small></div>
      <label>项目名称<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="例如：裴成砚 · 落水真相" /></label>
      <label>一句话简介<textarea rows={3} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} placeholder="这部戏的核心矛盾与当前方向" /></label>
      <label>用户身份<select value={draft.personaId || ''} onChange={(event) => setDraft({ ...draft, personaId: event.target.value || undefined })}><option value="">暂不指定</option>{identities.map((identity) => <option value={identity.id} key={identity.id}>{identity.name}</option>)}</select></label>
      <label>旁白／导演<select value={draft.directorCharacterId || ''} onChange={(event) => setDraft({ ...draft, directorCharacterId: event.target.value || undefined })}><option value="">暂不指定</option>{directorCandidates.map((character) => <option value={character.id} key={character.id}>{character.name}</option>)}</select></label>
      <fieldset><legend>绑定角色与 NPC</legend><small>只建立项目引用，角色卡仍保持独立。</small><div className="story-binding-list">{characters.map((character) => <button className={draft.characterIds.includes(character.id) ? 'selected' : ''} key={character.id} onClick={() => setDraft({ ...draft, characterIds: toggleId(draft.characterIds, character.id) })}><span>{character.avatar ? <img src={character.avatar} alt="" /> : character.name.slice(-1)}</span><div><strong>{character.name}</strong><small>{character.tagline || '角色卡'}</small></div><i>{draft.characterIds.includes(character.id) ? '✓' : '＋'}</i></button>)}</div></fieldset>
      <fieldset><legend>绑定现有对话</legend><small>可同时收进单聊与群聊，不会移动原聊天。</small><div className="story-binding-list compact">{conversations.map((conversation) => <button className={draft.conversationIds.includes(conversation.id) ? 'selected' : ''} key={conversation.id} onClick={() => setDraft({ ...draft, conversationIds: toggleId(draft.conversationIds, conversation.id) })}><div><strong>{conversation.title}</strong><small>{conversation.participantIds?.length ? `${conversation.participantIds.length} 位成员` : characters.find((character) => character.id === conversation.characterId)?.name || '单聊'}</small></div><i>{draft.conversationIds.includes(conversation.id) ? '✓' : '＋'}</i></button>)}</div></fieldset>
      <label>项目世界背景<textarea rows={10} value={draft.worldBackground} onChange={(event) => setDraft({ ...draft, worldBackground: event.target.value })} placeholder="只属于这部戏的时代、地点、社会规则与共享背景。暂不会覆盖现有剧场世界观。" /></label>
      <button className="primary-button full" disabled={!draft.title.trim()} onClick={save}>保存剧本项目</button>
    </section>
  </>

  return <>
    <header className="page-header"><button className="icon-button" onClick={onBack}>‹</button><h1>剧本项目</h1><div className="header-action"><button className="text-button" onClick={beginCreate}>＋ 新建</button></div></header>
    <section className="content-stack story-project-page">
      <div className="story-project-hero"><span>◈</span><div><strong>把一整部戏收进同一个项目</strong><small>角色、NPC、身份、对话与世界背景集中绑定；现有数据保持原样。</small></div></div>
      <div className="story-project-filter"><span>{projects.filter((project) => project.status === 'active').length} 个进行中</span>{projects.some((project) => project.status === 'archived') && <button onClick={() => setShowArchived(!showArchived)}>{showArchived ? '隐藏归档' : `查看归档（${projects.filter((project) => project.status === 'archived').length}）`}</button>}</div>
      {visibleProjects.map((project) => <article className={`story-project-card ${project.status}`} key={project.id}><button className="story-project-main" onClick={() => setCockpitProjectId(project.id)}><div><small>{project.status === 'archived' ? '已归档' : project.autoContinuity.enabled ? '自动场记已开启' : project.cockpit.currentLocation || project.cockpit.relationshipStage ? '驾驶舱已启用' : '正在共演'}</small><strong>{project.title}</strong><p>{project.cockpit.currentLocation ? `${project.cockpit.currentTime || '时间未定'} · ${project.cockpit.currentLocation}` : project.summary || '还没有填写项目简介。'}</p></div><i>›</i></button><div className="story-project-meta"><span>{project.characterIds.length} 个角色</span><span>{project.conversationIds.length} 段对话</span><span>{project.cockpit.openHooks.length} 个未完成钩子</span>{project.autoContinuity.enabled && <span>自动更新中</span>}</div><footer><button className="cockpit-entry" onClick={() => setCockpitProjectId(project.id)}>进入驾驶舱</button><button onClick={() => beginEdit(project)}>项目资料</button><button onClick={() => archive(project)}>{project.status === 'archived' ? '恢复' : '归档'}</button><button className="danger" onClick={() => remove(project)}>删除</button></footer></article>)}
      {!visibleProjects.length && <div className="story-project-empty"><span>✦</span><strong>{projects.length ? '进行中的项目都已归档' : '还没有剧本项目'}</strong><p>新建后再选择要绑定的角色和已有对话，不会自动迁移任何资料。</p><button className="primary-button" onClick={beginCreate}>建立第一部戏</button></div>}
    </section>
  </>
}
