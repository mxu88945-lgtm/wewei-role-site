import { useState } from 'react'
import type { Character } from './characterCard'
import { completeChat, type ApiConfig } from './chatApi'
import { createStoryCockpitDraft, normalizeStoryCockpit, type CharacterKnowledge, type StoryCockpit, type StoryEvidence, type StoryPlannedEvent, type StoryProject } from './storyProject'
import { buildCockpitAssistantInput, buildStoryCanonAssistantInput, parseCockpitAssistantResponse, parseStoryCanonAssistantResponse, type CockpitSourceConversation } from './storyCockpitAssistant'

const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean)
const text = (value: string[]) => value.join('\n')
const evidenceId = () => `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const plannedEventId = () => `planned-event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

export default function StoryCockpitEditor({ project, characters, conversations, userName, api, onBack, onSave, onEditProject, onSetAutoContinuity }: { project: StoryProject; characters: Character[]; conversations: CockpitSourceConversation[]; userName: string; api: ApiConfig; onBack: () => void; onSave: (cockpit: StoryCockpit) => void; onEditProject: () => void; onSetAutoContinuity: (enabled: boolean) => void }) {
  // A history rewrite invalidates AI-derived facts, but it must never blank the
  // user's saved cockpit. Otherwise merely reviewing and saving can erase it.
  const [draft, setDraft] = useState(() => createStoryCockpitDraft(project))
  const [assistantState, setAssistantState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [assistantMessage, setAssistantMessage] = useState('')
  const [canonState, setCanonState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [canonMessage, setCanonMessage] = useState('')
  const projectCharacters = project.characterIds.filter((id) => id !== project.directorCharacterId).map((id) => characters.find((item) => item.id === id)).filter(Boolean) as Character[]
  const boundConversations = conversations.filter((conversation) => project.conversationIds.includes(conversation.id))
  const updateEvidence = (id: string, patch: Partial<StoryEvidence>) => setDraft((current) => ({ ...current, evidence: current.evidence.map((item) => item.id === id ? { ...item, ...patch } : item) }))
  const updatePlannedEvent = (id: string, patch: Partial<StoryPlannedEvent>) => setDraft((current) => ({ ...current, plannedEvents: current.plannedEvents.map((item) => item.id === id ? { ...item, ...patch } : item) }))
  const knowledgeFor = (characterId: string) => draft.characterKnowledge.find((item) => item.characterId === characterId) || { characterId, knownFacts: [], unknownFacts: [], mistakenBeliefs: [] }
  const updateKnowledge = (next: CharacterKnowledge) => setDraft((current) => ({ ...current, characterKnowledge: current.characterKnowledge.some((item) => item.characterId === next.characterId) ? current.characterKnowledge.map((item) => item.characterId === next.characterId ? next : item) : [...current.characterKnowledge, next] }))

  const autoFill = async () => {
    if (!api?.apiKey?.trim() || !api.baseUrl?.trim() || !api.modelName?.trim()) { setAssistantState('error'); setAssistantMessage('当前 API 还没有可用的密钥或模型，请先去 API 设置。'); return }
    setAssistantState('working'); setAssistantMessage('正在读项目资料、角色卡和绑定对话…')
    let response = ''
    try {
      const input = buildCockpitAssistantInput({ project: { ...project, cockpit: draft }, characters: projectCharacters, conversations: boundConversations, userName })
      await completeChat({
        api, messages: [{ role: 'system', content: '你是严谨的剧情场记与信息边界审计员。必须只输出合法 JSON，不续写剧情，不替用户主角作决定，不把猜测写成事实。' }, { role: 'user', content: input }],
        temperature: .1, topP: 1, maxTokens: 8000, streaming: false, signal: new AbortController().signal,
        onDelta: (delta) => { response += delta },
      })
      const organized = parseCockpitAssistantResponse(response, projectCharacters.map((character) => character.id))
      setDraft((current) => ({
        ...organized,
        // These are explicit user-authored anchors. Re-analysis may rebuild
        // branch facts, but cannot delete events or roll the relationship back.
        relationshipStage: project.autoContinuity.needsReview ? current.relationshipStage : organized.relationshipStage,
        canon: current.canon,
        plannedEvents: current.plannedEvents,
      }))
      setAssistantState('done'); setAssistantMessage('草稿已填好。下面所有字段仍可修改，点“保存驾驶舱”后才会写入项目。')
    } catch (error) { setAssistantState('error'); setAssistantMessage(error instanceof Error ? error.message : '自动整理失败，请重试。') }
  }

  const summarizeWholeStory = async () => {
    if (!api?.apiKey?.trim() || !api.baseUrl?.trim() || !api.modelName?.trim()) { setCanonState('error'); setCanonMessage('当前 API 还没有可用的密钥或模型，请先去 API 设置。'); return }
    setCanonState('working'); setCanonMessage('正在回看整部剧本、核对已结案与未完主线…')
    let response = ''
    try {
      const input = buildStoryCanonAssistantInput({ project: { ...project, cockpit: draft }, characters: projectCharacters, conversations: boundConversations, userName })
      await completeChat({
        api,
        messages: [{ role: 'system', content: '你是严谨的剧本总编。只整理已经发生和明确保留的剧情，不续写，不复活已封存案件，只输出合法 JSON。' }, { role: 'user', content: input }],
        temperature: .1, topP: 1, maxTokens: 6000, streaming: false, signal: new AbortController().signal,
        onDelta: (delta) => { response += delta },
      })
      const canon = parseStoryCanonAssistantResponse(response)
      setDraft((current) => ({ ...current, canon }))
      setCanonState('done'); setCanonMessage('总纲草稿已生成。请核对“已封存结论”，保存后导演才会按它执行。')
    } catch (error) { setCanonState('error'); setCanonMessage(error instanceof Error ? error.message : '整部剧本总结失败，请重试。') }
  }

  return <>
    <header className="page-header"><button className="icon-button" onClick={onBack}>‹</button><h1>剧情驾驶舱</h1><div className="header-action"><button className="text-button" onClick={() => onSave(draft)}>保存</button></div></header>
    <section className="content-stack story-cockpit-page">
      <div className="cockpit-title-card"><small>{project.autoContinuity.needsReview ? '历史事实待复核 · 用户锚点已保留' : '当前剧本项目'}</small><strong>{project.title}</strong><p>{project.autoContinuity.needsReview ? '对话历史发生过改写。已保存内容不会清空；自动填写只重建可能受影响的事实，当前关系阶段和指定事件会原样保留。检查后保存即可恢复自动场记。' : project.autoContinuity.enabled ? '自动场记会在绑定对话完成一轮回复后更新；所有结果仍可在这里检查和修改。' : '手动整理结果先进入草稿，确认保存后才会写入项目。'}</p><button className="cockpit-project-edit" onClick={onEditProject}>编辑项目资料</button>{project.cockpitBackup && <button className="cockpit-project-edit" onClick={() => { setDraft(normalizeStoryCockpit(project.cockpitBackup)); setAssistantState('done'); setAssistantMessage('已把上一次保存的驾驶舱恢复到草稿；确认内容后再保存。') }}>恢复上次保存</button>}</div>
      <div className={`cockpit-assistant-card ${assistantState}`}><span>✦</span><div><strong>AI 打工助手</strong><small>{assistantMessage || `使用 ${api?.modelName || '当前聊天模型'}，自动读取 ${boundConversations.length} 段绑定对话并填写整张驾驶舱。`}</small></div><button disabled={assistantState === 'working'} onClick={autoFill}>{assistantState === 'working' ? '正在整理…' : assistantState === 'done' ? '重新分析' : '一键自动填写'}</button></div>
      <label className={`continuity-switch ${project.autoContinuity.enabled ? 'enabled' : ''} ${project.autoContinuity.lastError ? 'error' : ''}`}><div><strong>每轮自动场记</strong><small>{project.autoContinuity.lastError ? `上次更新失败：${project.autoContinuity.lastError}` : project.autoContinuity.lastSummary || '开启后，从下一轮完整回复开始自动消耗旧钩子并接续新阶段。'}</small></div><input type="checkbox" checked={project.autoContinuity.enabled} onChange={(event) => onSetAutoContinuity(event.target.checked)} /><i /></label>

      <section className="cockpit-panel canon-panel"><header><span>00</span><div><strong>核心剧情总纲</strong><small>整部剧本唯一的最高事实底稿，导演每轮必读</small></div></header><p className="planned-event-note">这里记录全剧已经确认的终局与当前篇章。已封存结论禁止被长期记忆、旧对话或模型猜测重新打开；自动场记不会改写这一区。</p><div className={`cockpit-assistant-card ${canonState}`}><span>✦</span><div><strong>总纲助手</strong><small>{canonMessage || `回看 ${boundConversations.length} 段绑定对话，整理全剧摘要、已封存结论与未完主线。`}</small></div><button disabled={canonState === 'working'} onClick={() => void summarizeWholeStory()}>{canonState === 'working' ? '正在回看…' : canonState === 'done' ? '重新总结' : '总结整部剧本'}</button></div><label>全剧核心摘要<textarea rows={8} value={draft.canon.synopsis} onChange={(event) => setDraft({ ...draft, canon: { ...draft.canon, synopsis: event.target.value } })} placeholder="概括故事起因、关键转折、已经确认的真相与当前局面" /></label><label>已封存结论<textarea rows={6} value={text(draft.canon.closedArcs)} onChange={(event) => setDraft({ ...draft, canon: { ...draft.canon, closedArcs: lines(event.target.value) } })} placeholder={"每行一条不可回滚的结论，例如：杨越、杨颖已经伏法，相关案件正式结案"} /></label><label>当前篇章<textarea rows={3} value={draft.canon.currentArc} onChange={(event) => setDraft({ ...draft, canon: { ...draft.canon, currentArc: event.target.value } })} placeholder="故事现在处于哪个篇章，正在处理的核心矛盾是什么" /></label><label>仍未解决的主线<textarea rows={5} value={text(draft.canon.openArcs)} onChange={(event) => setDraft({ ...draft, canon: { ...draft.canon, openArcs: lines(event.target.value) } })} placeholder="每行一条仍然有效、确实没有解决的主线" /></label></section>
      <section className="cockpit-panel"><header><span>01</span><div><strong>当前场景</strong><small>钉住这一幕的时间、地点与在场人物</small></div></header><div className="cockpit-two-fields"><label>当前时间<input value={draft.currentTime} onChange={(event) => setDraft({ ...draft, currentTime: event.target.value })} placeholder="例如：回国第三天 · 深夜" /></label><label>当前地点<input value={draft.currentLocation} onChange={(event) => setDraft({ ...draft, currentLocation: event.target.value })} placeholder="例如：裴氏集团顶层" /></label></div><div className="cockpit-character-grid">{projectCharacters.map((character) => <button className={draft.presentCharacterIds.includes(character.id) ? 'selected' : ''} key={character.id} onClick={() => setDraft({ ...draft, presentCharacterIds: draft.presentCharacterIds.includes(character.id) ? draft.presentCharacterIds.filter((id) => id !== character.id) : [...draft.presentCharacterIds, character.id] })}><span>{character.avatar ? <img src={character.avatar} alt="" /> : character.name.slice(-1)}</span><small>{character.name}</small><i>{draft.presentCharacterIds.includes(character.id) ? '在场' : '离场'}</i></button>)}</div>{!projectCharacters.length && <p className="cockpit-empty-note">先回项目资料绑定角色，再维护在场人物。</p>}</section>

      <section className="cockpit-panel"><header><span>02</span><div><strong>阶段与任务</strong><small>关系不跳级，线索不失焦</small></div></header><label>当前关系阶段<input value={draft.relationshipStage} onChange={(event) => setDraft({ ...draft, relationshipStage: event.target.value })} placeholder="例如：阶段一 · 冷淡与自欺" /></label><label>当前任务<textarea rows={3} value={draft.currentTask} onChange={(event) => setDraft({ ...draft, currentTask: event.target.value })} placeholder="当前最需要查清、取得或验证的核心证据节点" /></label><label>下一步可推进方向<textarea rows={5} value={text(draft.nextDirections)} onChange={(event) => setDraft({ ...draft, nextDirections: lines(event.target.value) })} placeholder={'每行一条证据推进链：线索目标｜行动者与动作｜预计新增信息｜如何衔接下一节点'} /></label></section>

      <section className="cockpit-panel"><header><span>03</span><div><strong>事件账本</strong><small>完成的永久消耗，没完成的继续挂钩</small></div></header><label>已完成事件<textarea rows={6} value={text(draft.completedEvents)} onChange={(event) => setDraft({ ...draft, completedEvents: lines(event.target.value) })} placeholder="每行一个已经发生并完成的事件" /></label><label>未完成钩子<textarea rows={6} value={text(draft.openHooks)} onChange={(event) => setDraft({ ...draft, openHooks: lines(event.target.value) })} placeholder="每行一个仍待触发、调查或解决的钩子" /></label></section>

      <section className="cockpit-panel planned-event-panel"><header><span>04</span><div><strong>指定事件</strong><small>你亲自埋下的未来事件，由导演等待时机触发</small></div></header><p className="planned-event-note">这里不是“已经发生”，也不是 AI 猜的下一步。导演会先核对触发条件；条件没到就继续正常剧情，不会硬塞。独立角色的台词和决定仍由各自角色卡来演。</p>{draft.plannedEvents.map((item) => <article className={`planned-event-editor ${item.status}`} key={item.id}><div className="planned-event-heading"><select value={item.status} onChange={(event) => updatePlannedEvent(item.id, { status: event.target.value as StoryPlannedEvent['status'] })}><option value="pending">待触发</option><option value="active">进行中</option><option value="completed">已完成</option></select><button onClick={() => setDraft({ ...draft, plannedEvents: draft.plannedEvents.filter((entry) => entry.id !== item.id) })}>删除</button></div><label>事件名称<input value={item.title} onChange={(event) => updatePlannedEvent(item.id, { title: event.target.value })} placeholder="例如：杨颖在董事会前夜销毁一份旧记录" /></label><label>事件会怎样发生<textarea rows={4} value={item.detail} onChange={(event) => updatePlannedEvent(item.id, { detail: event.target.value })} placeholder="写人物会做什么、想造成什么局面，以及必须保留的关键细节" /></label><label>触发条件<textarea rows={3} value={item.triggerCondition} onChange={(event) => updatePlannedEvent(item.id, { triggerCondition: event.target.value })} placeholder="例如：裴成砚开始复查三年前权限日志，且杨颖确认调查已接近自己" /></label><label>演绎进度备注<textarea rows={2} value={item.progressNote} onChange={(event) => updatePlannedEvent(item.id, { progressNote: event.target.value })} placeholder="待触发时可留空；开始后由自动场记或你记录演到哪一步" /></label></article>)}<button className="cockpit-add-button" onClick={() => setDraft({ ...draft, plannedEvents: [...draft.plannedEvents, { id: plannedEventId(), title: '', detail: '', triggerCondition: '', status: 'pending', progressNote: '' }] })}>＋ 添加指定事件</button></section>

      <section className="cockpit-panel evidence-panel"><header><span>05</span><div><strong>证据与秘密</strong><small>公开事实和隐藏真相分开保存</small></div></header>{draft.evidence.map((item) => <article className={`evidence-editor ${item.visibility}`} key={item.id}><div className="evidence-heading"><select value={item.visibility} onChange={(event) => updateEvidence(item.id, { visibility: event.target.value as StoryEvidence['visibility'] })}><option value="public">已公开证据</option><option value="hidden">隐藏证据</option></select><button onClick={() => setDraft({ ...draft, evidence: draft.evidence.filter((entry) => entry.id !== item.id) })}>删除</button></div><input value={item.title} onChange={(event) => updateEvidence(item.id, { title: event.target.value })} placeholder="证据名称" /><textarea rows={3} value={item.detail} onChange={(event) => updateEvidence(item.id, { detail: event.target.value })} placeholder="证据内容、来源与可信状态" /><div><small>当前知情者</small><div className="evidence-knowers">{projectCharacters.map((character) => <button className={item.knownByCharacterIds.includes(character.id) ? 'selected' : ''} key={character.id} onClick={() => updateEvidence(item.id, { knownByCharacterIds: item.knownByCharacterIds.includes(character.id) ? item.knownByCharacterIds.filter((id) => id !== character.id) : [...item.knownByCharacterIds, character.id] })}>{character.name}</button>)}</div></div></article>)}<button className="cockpit-add-button" onClick={() => setDraft({ ...draft, evidence: [...draft.evidence, { id: evidenceId(), title: '', detail: '', visibility: 'hidden', knownByCharacterIds: [] }] })}>＋ 添加证据或秘密</button></section>

      <section className="cockpit-panel knowledge-panel"><header><span>06</span><div><strong>角色知情边界</strong><small>同一件事在不同角色脑中可以完全不同</small></div></header>{projectCharacters.map((character) => { const entry = knowledgeFor(character.id); return <article className="knowledge-editor" key={character.id}><div className="knowledge-character"><span>{character.avatar ? <img src={character.avatar} alt="" /> : character.name.slice(-1)}</span><strong>{character.name}</strong></div><label>已经知道<textarea rows={4} value={text(entry.knownFacts)} onChange={(event) => updateKnowledge({ ...entry, knownFacts: lines(event.target.value) })} placeholder="每行一条明确知晓的信息" /></label><label>仍然不知道<textarea rows={4} value={text(entry.unknownFacts)} onChange={(event) => updateKnowledge({ ...entry, unknownFacts: lines(event.target.value) })} placeholder="每行一条被隐藏的信息" /></label><label>错误认知／误解<textarea rows={4} value={text(entry.mistakenBeliefs)} onChange={(event) => updateKnowledge({ ...entry, mistakenBeliefs: lines(event.target.value) })} placeholder="每行一条角色当前相信但并不正确的事" /></label></article> })}{!projectCharacters.length && <p className="cockpit-empty-note">项目还没有绑定角色，暂时无法建立知情边界。</p>}</section>

      <button className="primary-button full cockpit-save" onClick={() => onSave(draft)}>保存驾驶舱</button>
    </section>
  </>
}
