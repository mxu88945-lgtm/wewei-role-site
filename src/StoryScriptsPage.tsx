import { useState } from 'react'
import type { Conversation } from './conversationLifecycle'
import { STORY_SCRIPT_LIMIT, STORY_VARIABLE_LIMIT, STORY_VARIABLE_TEXT_LIMIT, storyVariableTextLength, type StoryScript, type StoryVariable } from './storyScripts'

type Member = { id: string; name: string }
type Change = (update: (source: Conversation) => Conversation) => void

function RecipientPicker({ members, value, onChange, allowPublic = false }: { members: Member[]; value?: string[]; onChange: (ids: string[] | undefined) => void; allowPublic?: boolean }) {
  return <fieldset className="plot-recipients"><legend>{allowPublic ? '谁能读取这份变量' : '幕后安排交给谁（群聊仍需 @）'}</legend>
    {allowPublic && <label className="story-tools-check"><input type="checkbox" checked={value === undefined} onChange={(event) => onChange(event.target.checked ? undefined : [])} />本对话所有角色（包括之后加入者）</label>}
    {members.map((member) => <label className="story-tools-check" key={member.id}><input type="checkbox" checked={value?.includes(member.id) || false} onChange={(event) => onChange(event.target.checked ? [...value || [], member.id] : (value || []).filter((id) => id !== member.id))} />{member.name}</label>)}
    {value?.length === 0 && <p>{allowPublic ? '仅后台保存，不发给任何模型。' : '尚未选择接收角色，幕后安排不能运行。'}</p>}
  </fieldset>
}

function VariableEditor({ initial, members, variables, onSave, onCancel }: { initial?: StoryVariable; members: Member[]; variables: StoryVariable[]; onSave: (value: StoryVariable) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name || '')
  const [value, setValue] = useState(initial?.value || '')
  const [recipients, setRecipients] = useState(initial?.recipientIds)
  const [error, setError] = useState('')
  return <form className="story-tools-card" onSubmit={(event) => {
    event.preventDefault()
    if (variables.some((item) => item.id !== initial?.id && item.name === name.trim())) { setError('变量名称重复了，请换个名字。'); return }
    if (storyVariableTextLength([...variables.filter((item) => item.id !== initial?.id), { id: '', name: name.trim(), value: value.trim() }]) > STORY_VARIABLE_TEXT_LIMIT) { setError('变量总内容最多 6000 字，请缩短后再保存。'); return }
    onSave({ id: initial?.id || crypto.randomUUID(), name: name.trim(), value: value.trim(), recipientIds: recipients })
  }}>
    <h3>{initial ? '编辑变量' : '添加剧情变量'}</h3>
    <label>名称<input required maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="地点、在场人物、来电是否已发生……" /></label>
    <label>当前事实<textarea required rows={3} maxLength={1000} value={value} onChange={(event) => setValue(event.target.value)} placeholder="填写已经发生或角色已知的事实" /></label>
    <RecipientPicker members={members} value={recipients} onChange={setRecipients} allowPublic />
    {error && <p role="alert">{error}</p>}
    <div className="story-tools-actions"><button type="submit" disabled={!name.trim() || !value.trim()}>保存变量</button><button type="button" onClick={onCancel}>取消</button></div>
  </form>
}

function ScriptEditor({ initial, members, variables, onSave, onCancel }: { initial?: StoryScript; members: Member[]; variables: StoryVariable[]; onSave: (script: StoryScript) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<StoryScript>(() => initial || { id: crypto.randomUUID(), name: '', writes: [], prompt: '', recipientIds: members.length === 1 ? [members[0].id] : [], mode: 'once', runOnce: true })
  const [error, setError] = useState('')
  const patch = (change: Partial<StoryScript>) => setDraft((current) => ({ ...current, ...change }))
  const updateWrite = (index: number, change: Partial<StoryScript['writes'][number]>) => setDraft((current) => ({ ...current, writes: current.writes.map((write, i) => i === index ? { ...write, ...change } : write) }))
  return <form className="story-tools-card" onSubmit={(event) => {
    event.preventDefault()
    if (!draft.writes.length && !draft.prompt.trim()) { setError('至少选择一次变量更新或填写幕后安排。'); return }
    if (new Set(draft.writes.map((write) => write.variableId)).size !== draft.writes.length) { setError('同一变量只需更新一次。'); return }
    if (draft.writes.some((write) => !variables.some((item) => item.id === write.variableId) || !write.value.trim())) { setError('请选择有效变量，并填写更新后的值。'); return }
    if (draft.prompt.trim() && (!draft.recipientIds.length || draft.recipientIds.some((id) => !members.some((member) => member.id === id)))) { setError('请选择当前对话里的幕后接收角色。'); return }
    if (draft.condition && !variables.some((item) => item.id === draft.condition?.variableId)) { setError('运行条件的变量已删除，请重新选择。'); return }
    onSave({ ...draft, name: draft.name.trim(), prompt: draft.prompt.trim(), writes: draft.writes.map((write) => ({ ...write, value: write.value.trim() })) })
  }}>
    <h3>{initial ? '配置脚本按钮' : '创建脚本按钮'}</h3>
    <label>按钮名称<input required maxLength={40} value={draft.name} onChange={(event) => patch({ name: event.target.value })} placeholder="配角来电、保持对峙、更新场景……" /></label>
    <label className="story-tools-check"><input type="checkbox" checked={draft.runOnce} onChange={(event) => patch({ runOnce: event.target.checked })} />只允许运行一次，防止重复触发</label>
    <label>运行条件<select value={draft.condition?.variableId || ''} onChange={(event) => patch({ condition: event.target.value ? { variableId: event.target.value, value: '' } : undefined })}><option value="">无条件，点击即可运行</option>{draft.condition && !variables.some((item) => item.id === draft.condition?.variableId) && <option value={draft.condition.variableId}>原条件变量已删除</option>}{variables.map((item) => <option value={item.id} key={item.id}>{item.name} 等于指定值时</option>)}</select></label>
    {draft.condition && <label>条件值<input maxLength={1000} value={draft.condition.value} onChange={(event) => patch({ condition: { ...draft.condition!, value: event.target.value } })} placeholder="例如：未发生" /></label>}
    <p>变量更新只填写你确认的事实；安排未来事件写在下面的幕后安排中。</p>
    {draft.writes.map((write, index) => <div className="script-write-row" key={index}>
      <label>更新变量<select required value={write.variableId} onChange={(event) => updateWrite(index, { variableId: event.target.value })}><option value="">请选择</option>{write.variableId && !variables.some((item) => item.id === write.variableId) && <option value={write.variableId}>原目标已删除</option>}{variables.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label>更新后的值<input required maxLength={1000} value={write.value} onChange={(event) => updateWrite(index, { value: event.target.value })} /></label>
      <button type="button" onClick={() => patch({ writes: draft.writes.filter((_, i) => i !== index) })} aria-label={`移除第 ${index + 1} 项更新`}>移除</button>
    </div>)}
    <div className="story-tools-actions"><button type="button" disabled={!variables.length || draft.writes.length >= 10} onClick={() => patch({ writes: [...draft.writes, { variableId: '', value: '' }] })}>＋ 添加变量更新</button></div>
    <label>幕后安排（可留空）<textarea rows={5} maxLength={6000} value={draft.prompt} onChange={(event) => patch({ prompt: event.target.value })} placeholder="让角色自然收到配角来电。保持当前地点，留出我的回应位置。" /></label>
    <p>可用 {'{{变量:地点}}'} 引用运行后的变量值；所有幕后接收者都须有权读取该变量。</p>
    {draft.prompt.trim() && <><RecipientPicker members={members} value={draft.recipientIds} onChange={(ids) => patch({ recipientIds: ids || [] })} /><label>幕后安排时长<select value={draft.mode} onChange={(event) => patch({ mode: event.target.value as StoryScript['mode'] })}><option value="once">仅下一次成功回复</option><option value="persistent">持续到手动结束</option></select></label></>}
    {error && <p role="alert">{error}</p>}
    <div className="story-tools-actions"><button type="submit" disabled={!draft.name.trim()}>保存脚本</button><button type="button" onClick={onCancel}>取消</button></div>
  </form>
}

export default function StoryScriptsPage({ conversation, members, disabled, onChange, onRun, onBack, onPlot, onPreview }: { conversation: Conversation; members: Member[]; disabled: boolean; onChange: Change; onRun: (id: string) => string; onBack: () => void; onPlot: () => void; onPreview: () => void }) {
  const variables = conversation.storyVariables || []
  const scripts = conversation.storyScripts || []
  const [editingVariable, setEditingVariable] = useState<string | null>(null)
  const [editingScript, setEditingScript] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const visibility = (item: StoryVariable) => item.recipientIds === undefined ? '本对话所有角色可知' : !item.recipientIds.length ? '仅后台' : item.recipientIds.map((id) => members.find((member) => member.id === id)?.name || '已移除角色').join('、')
  return <section className="story-tools-page">
    <header className="story-tools-header"><button onClick={onBack} aria-label="返回聊天设置">‹</button><h2>剧情脚本与变量</h2><span>本对话独立</span></header>
    <p>先配置，再点击运行。按钮能检查条件、更新变量、挂上私下的剧情安排；不会自动发送消息或额外调用模型。群聊仍由你 @ 角色后接收安排。</p>
    <div className="story-tools-actions"><button onClick={onPlot}>查看 / 结束幕后安排</button><button onClick={onPreview}>查看模型发送内容</button></div>
    {disabled && <p role="status">角色正在回复，完成后可修改或运行脚本。</p>}
    {notice && <p role="status">{notice}</p>}
    {conversation.temporaryPlot?.text.trim() && <p role="status">有幕后安排等待接收：{(conversation.temporaryPlot.recipientIds || members.map((member) => member.id)).map((id) => members.find((member) => member.id === id)?.name || '已移除角色').join('、') || '尚未选择接收者'}。{conversation.kind === 'group' ? '返回聊天后 @ 接收角色；只保存或只运行按钮不会生成剧情。' : '返回聊天后发送或续演。'}</p>}
    <fieldset className="script-workspace" disabled={disabled}>
      <h3>剧情变量（{variables.length} / {STORY_VARIABLE_LIMIT}）</h3>
      <p>保存已知事实，可指定谁能读取。新正文的明确进展优先于旧值；以后剧情变了，可在这里更新。变量不会变成聊天消息。当前共 {storyVariableTextLength(variables)} / {STORY_VARIABLE_TEXT_LIMIT} 字，每次只带入接收角色可读的部分。</p>
      {variables.map((item) => <article className="story-tools-card" key={item.id}><strong>{item.name}</strong><small>{visibility(item)}</small><p className="story-tools-excerpt">{item.value}</p><div className="story-tools-actions"><button onClick={() => setEditingVariable(item.id)}>编辑</button><button onClick={() => { if (window.confirm(`删除变量「${item.name}」？引用它的脚本需要重新配置。`)) onChange((source) => ({ ...source, storyVariables: source.storyVariables?.filter((entry) => entry.id !== item.id) })) }}>删除</button></div></article>)}
      {editingVariable !== null ? <VariableEditor key={editingVariable} initial={variables.find((item) => item.id === editingVariable)} variables={variables} members={members} onCancel={() => setEditingVariable(null)} onSave={(value) => { onChange((source) => ({ ...source, storyVariables: [...(source.storyVariables || []).filter((item) => item.id !== value.id), value] })); setEditingVariable(null); setNotice('变量已保存，下次请求会按角色接收范围带入。') }} /> : <div className="story-tools-actions"><button disabled={variables.length >= STORY_VARIABLE_LIMIT} onClick={() => setEditingVariable('new')}>＋ 添加变量</button></div>}
      <h3>脚本按钮（{scripts.length} / {STORY_SCRIPT_LIMIT}）</h3>
      {!scripts.length && <p>可以先建“配角来电”按钮：填幕后安排，选接收角色，保存后点运行即可。也可以建立只更新变量的按钮。</p>}
      {scripts.map((script) => {
        const ranAt = conversation.storyScriptRuns?.[script.id]
        return <article className="story-tools-card" key={script.id}><strong>{script.name}</strong><small>{script.runOnce ? '仅运行一次' : '允许重复运行'}{ranAt !== undefined ? ` · 上次运行 ${new Date(ranAt).toLocaleString()}` : ''}</small><p>{script.condition ? `条件：${variables.find((item) => item.id === script.condition?.variableId)?.name || '目标已删除'} = ${script.condition.value}` : '无运行条件'}</p>
          {script.writes.map((write) => <p key={write.variableId}>{variables.find((item) => item.id === write.variableId)?.name || '目标已删除'} → {write.value}</p>)}
          {script.prompt && <><p className="story-tools-excerpt">幕后安排：{script.prompt}</p><small>接收：{script.recipientIds.map((id) => members.find((member) => member.id === id)?.name || '已移除角色').join('、') || '未选择'} · {script.mode === 'persistent' ? '持续到结束' : '仅下一次'}</small></>}
          <div className="story-tools-actions"><button disabled={script.runOnce && ranAt !== undefined} onClick={() => setNotice(onRun(script.id))}>运行「{script.name}」</button><button onClick={() => setEditingScript(script.id)}>配置</button>{ranAt !== undefined && <button onClick={() => { onChange((source) => { const runs = { ...source.storyScriptRuns }; delete runs[script.id]; return { ...source, storyScriptRuns: runs } }); setNotice('已重新允许运行；之前的变量修改和幕后安排仍保留。') }}>重新允许运行</button>}<button onClick={() => { if (window.confirm(`删除脚本「${script.name}」？已经更新的变量和幕后安排会保留。`)) onChange((source) => { const runs = { ...source.storyScriptRuns }; delete runs[script.id]; return { ...source, storyScripts: source.storyScripts?.filter((item) => item.id !== script.id), storyScriptRuns: runs } }) }}>删除</button></div>
        </article>
      })}
      {editingScript !== null ? <ScriptEditor key={editingScript} initial={scripts.find((item) => item.id === editingScript)} variables={variables} members={members} onCancel={() => setEditingScript(null)} onSave={(script) => { onChange((source) => ({ ...source, storyScripts: [...(source.storyScripts || []).filter((item) => item.id !== script.id), script] })); setEditingScript(null); setNotice('脚本已保存，点击运行才生效。') }} /> : <div className="story-tools-actions"><button disabled={scripts.length >= STORY_SCRIPT_LIMIT} onClick={() => setEditingScript('new')}>＋ 创建脚本按钮</button></div>}
    </fieldset>
  </section>
}
