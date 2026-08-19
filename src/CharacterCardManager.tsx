import { useEffect, useState } from 'react'
import {
  CHARACTER_MEMORY_CATEGORY_OPTIONS,
  CHARACTER_MEMORY_STATUS_OPTIONS,
  createCharacterMemoryEntry,
  normalizeWorldBookEntry,
  type Character,
  type CharacterMemoryEntry,
  type RegexScript,
  type WorldBookEntry,
} from './characterCard'

export type CharacterCardSection = 'overview' | 'greetings' | 'worldbook' | 'regex' | 'memory'
type LongCharacterField = 'description' | 'personality' | 'scenario' | 'systemPrompt' | 'postHistoryInstructions' | 'beautificationProtocol' | 'mesExample' | 'creatorNotes'
type FullEditorField = LongCharacterField | 'greeting'

const longCharacterFields: Array<{ key: LongCharacterField; label: string }> = [
  { key: 'description', label: '角色描述' },
  { key: 'personality', label: '性格' },
  { key: 'scenario', label: '场景' },
  { key: 'systemPrompt', label: '系统提示词' },
  { key: 'postHistoryInstructions', label: '历史后置指令' },
  { key: 'beautificationProtocol', label: '开场白美化协议' },
  { key: 'mesExample', label: '示例对话' },
  { key: 'creatorNotes', label: '作者备注' },
]

const fullEditorLabels: Record<FullEditorField, string> = Object.fromEntries([
  ...longCharacterFields.map((field) => [field.key, field.label]),
  ['greeting', '主开场白'],
]) as Record<FullEditorField, string>

function nextEntryId(entries: WorldBookEntry[]) {
  return Math.max(-1, ...entries.map((entry) => Number(entry.id) || 0)) + 1
}

function blankWorldEntry(id: number): WorldBookEntry {
  return {
    id,
    keys: [],
    secondary_keys: [],
    comment: '新条目',
    content: '',
    constant: false,
    selective: true,
    insertion_order: 100,
    enabled: true,
    position: 'before_char',
    use_regex: false,
    extensions: { position: 0, depth: 4, probability: 100, useProbability: true },
  }
}

function blankRegex(): RegexScript {
  return {
    id: crypto.randomUUID(),
    scriptName: '新正则',
    findRegex: '',
    replaceString: '',
    trimStrings: [],
    placement: [1, 2],
    disabled: false,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
  }
}

async function avatarThumbnail(file: File, size = 320) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size
  const context = canvas.getContext('2d'); if (!context) return ''
  const scale = Math.max(size / bitmap.width, size / bitmap.height)
  const width = bitmap.width * scale; const height = bitmap.height * scale
  context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', .84)
}

export default function CharacterCardManager({ character, onChange, onBack, initialSection = 'overview' }: { character: Character; onChange: (next: Character) => void; onBack: () => void; initialSection?: CharacterCardSection }) {
  const [section, setSection] = useState<CharacterCardSection>(initialSection)
  const [expandedWorld, setExpandedWorld] = useState<number | null>(null)
  const [expandedRegex, setExpandedRegex] = useState<string | null>(null)
  const [expandedMemory, setExpandedMemory] = useState<string | null>(null)
  const [fullEditorField, setFullEditorField] = useState<FullEditorField | null>(null)
  const [nameEditorOpen, setNameEditorOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState(character.name)
  // Keep this boundary defensive as well: old localStorage records may have
  // been written before the importer started filling optional V3 fields.
  const entries = (Array.isArray(character.characterBook?.entries) ? character.characterBook.entries : [])
    .map((entry, index) => normalizeWorldBookEntry(entry, index))
  const memoryEntries = Array.isArray(character.characterMemory) ? character.characterMemory : []

  useEffect(() => { setNameDraft(character.name) }, [character.id, character.name])

  const patch = (value: Partial<Character>) => onChange({ ...character, ...value })
  const commitName = () => {
    const nextName = nameDraft.trim()
    if (!nextName) { setNameDraft(character.name); return false }
    if (nextName !== character.name) patch({ name: nextName })
    if (nextName !== nameDraft) setNameDraft(nextName)
    return true
  }
  const setEntries = (nextEntries: WorldBookEntry[]) => patch({ characterBook: { ...(character.characterBook || { name: `${character.name}世界书` }), entries: nextEntries } })
  const setRegexScripts = (regexScripts: RegexScript[]) => patch({ regexScripts })
  const setCharacterMemory = (characterMemory: CharacterMemoryEntry[]) => patch({ characterMemory })

  const updateEntry = (id: number, value: Partial<WorldBookEntry>) => setEntries(entries.map((entry) => entry.id === id ? { ...entry, ...value } : entry))
  const updateEntryExtensions = (id: number, value: Record<string, unknown>) => setEntries(entries.map((entry) => entry.id === id ? { ...entry, extensions: { ...entry.extensions, ...value } } : entry))
  const updateRegex = (id: string, value: Partial<RegexScript>) => setRegexScripts(character.regexScripts.map((script) => script.id === id ? { ...script, ...value } : script))
  const updateCharacterMemory = (id: string, value: Partial<CharacterMemoryEntry>) => setCharacterMemory(memoryEntries.map((entry) => entry.id === id ? { ...entry, ...value, updatedAt: Date.now() } : entry))

  if (nameEditorOpen) {
    return <section className="metadata-full-page character-name-full-page" aria-label="修改角色名称">
      <header className="page-header"><button className="icon-button" onClick={() => { setNameDraft(character.name); setNameEditorOpen(false) }}>‹</button><h1>修改角色名称</h1><div className="header-action"><span className="saved-label">手动保存</span></div></header>
      <div className="metadata-full-hint">输入新名称后点“保存名称”，角色卡与角色库会同步更新。</div>
      <label className="character-name-full-field"><span>角色名称</span><input autoFocus type="text" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (commitName()) setNameEditorOpen(false) } }} placeholder="填写角色名称" autoComplete="off" autoCapitalize="words" spellCheck={false} enterKeyHint="done" /></label>
      <button type="button" className="character-name-save-button" onClick={() => { if (commitName()) setNameEditorOpen(false) }}>保存名称</button>
    </section>
  }

  if (fullEditorField) {
    const fieldLabel = fullEditorLabels[fullEditorField]
    return <section className="metadata-full-page" aria-label={`${fieldLabel}整页编辑`}>
      <header className="page-header"><button className="icon-button" onClick={() => setFullEditorField(null)}>‹</button><h1>{fieldLabel}</h1><div className="header-action"><span className="saved-label">自动保存</span></div></header>
      <div className="metadata-full-hint">完整内容 · 可直接查看与修改</div>
      <textarea value={character[fullEditorField] || ''} onChange={(event) => patch({ [fullEditorField]: event.target.value })} placeholder={`填写${fieldLabel}`} />
    </section>
  }

  return <section className="card-manager">
    <header className="page-header"><button className="icon-button" onClick={onBack}>‹</button><h1>角色卡数据</h1><div className="header-action"><span className="saved-label">自动保存</span></div></header>

    <div className="card-format-banner">
      {character.avatar ? <img src={character.avatar} alt="" /> : <span>{character.name.slice(-1)}</span>}
      <div><strong>{character.name}</strong><small>{character.cardSpec || '手动创建'} · {character.cardSpecVersion || '本地格式'}</small><small>{character.sourceFileName || '未关联原始文件'}</small></div>
      <label className="avatar-edit-button">更换头像<input type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (file) patch({ avatar: await avatarThumbnail(file) }); event.currentTarget.value = '' }} /></label>
    </div>

    <nav className="card-tabs">
      {([['overview', '主体'], ['greetings', `开场 ${character.alternateGreetings.length + 1}`], ['worldbook', `世界书 ${entries.length}`], ['regex', `正则 ${character.regexScripts.length}`], ['memory', `私有记忆 ${memoryEntries.filter((entry) => entry.enabled !== false && entry.content.trim()).length}`]] as const).map(([value, label]) => <button key={value} className={section === value ? 'active' : ''} onClick={() => setSection(value)}>{label}</button>)}
    </nav>

    {section === 'overview' && <div className="metadata-stack">
      <article className="metadata-editor basic-metadata-editor">
        <div className="editor-heading"><strong>基础资料</strong><small>修改后自动保存，不影响已有聊天和记忆</small></div>
        <div className="editor-body basic-metadata-fields">
          <button type="button" className="character-name-editor-button" onClick={() => { setNameDraft(character.name); setNameEditorOpen(true) }}><span><small>角色名称</small><strong>{character.name}</strong></span><em>修改 ›</em></button>
          <label>一句话简介<input value={character.tagline} onChange={(event) => patch({ tagline: event.target.value })} placeholder="填写角色身份或一句话简介" /></label>
        </div>
      </article>
      {longCharacterFields.map((field) => <MetadataArea key={field.key} label={field.label} value={character[field.key] || ''} onOpenFull={() => setFullEditorField(field.key)} />)}
    </div>}

    {section === 'memory' && <div className="metadata-stack character-memory-stack">
      <div className="manager-intro character-memory-intro"><div><strong>角色私有长期记忆</strong><small>固定随“{character.name}”注入模型；不会随着近期摘要滚动，也不会被其他角色共享。</small></div><button className="soft-button" onClick={() => { const entry = createCharacterMemoryEntry(); setCharacterMemory([...memoryEntries, entry]); setExpandedMemory(entry.id) }}>＋ 添加</button></div>
      <div className="character-memory-notice"><strong>适合写什么？</strong><span>已经发生的重大事件、已经完成的任务、已经查明的真相、关系定论和必须保持的后果。</span><small>标记为“已确认／已完成”的内容不会再被模型写成“待查”或重新演一遍；当前对话中的明确新事实仍然优先。</small></div>
      {memoryEntries.length === 0 && <EmptyMetadata text="这张角色卡还没有固定记忆" />}
      {memoryEntries.map((entry) => <article className={`metadata-editor character-memory-editor ${entry.enabled === false ? 'disabled' : ''}`} key={entry.id}>
        <button className="metadata-summary" onClick={() => setExpandedMemory(expandedMemory === entry.id ? null : entry.id)}><span className={`status-dot ${entry.enabled !== false ? 'on' : ''}`} /><div><strong>{entry.title || '未命名记忆'}</strong><small>{CHARACTER_MEMORY_CATEGORY_OPTIONS.find((item) => item.value === entry.category)?.label || '重要事实'} · {CHARACTER_MEMORY_STATUS_OPTIONS.find((item) => item.value === entry.status)?.label || '已确认'}</small></div><span>⌄</span></button>
        {expandedMemory === entry.id && <div className="editor-body">
          <label>记忆标题<input value={entry.title} onChange={(event) => updateCharacterMemory(entry.id, { title: event.target.value })} placeholder="例如：三年前事故真相已经查明" /></label>
          <div className="two-column-fields"><label>记忆类型<select value={entry.category} onChange={(event) => updateCharacterMemory(entry.id, { category: event.target.value as CharacterMemoryEntry['category'] })}>{CHARACTER_MEMORY_CATEGORY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>当前状态<select value={entry.status} onChange={(event) => updateCharacterMemory(entry.id, { status: event.target.value as CharacterMemoryEntry['status'] })}>{CHARACTER_MEMORY_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
          <label>记忆摘要<textarea rows={8} value={entry.content} onChange={(event) => updateCharacterMemory(entry.id, { content: event.target.value })} placeholder="只写已经发生或已经确认的事实，并写清结果与当前后果。" /></label>
          <div className="toggle-grid"><Toggle label="固定注入" value={entry.enabled !== false} onChange={(enabled) => updateCharacterMemory(entry.id, { enabled })} /></div>
          <button className="danger-button" onClick={() => setCharacterMemory(memoryEntries.filter((item) => item.id !== entry.id))}>删除这条角色记忆</button>
        </div>}
      </article>)}
    </div>}

    {section === 'greetings' && <div className="metadata-stack">
      <MetadataArea label="主开场白" value={character.greeting} onOpenFull={() => setFullEditorField('greeting')} />
      {character.alternateGreetings.map((greeting, index) => <article className="metadata-editor" key={index}><div className="editor-heading"><strong>备用开场 {index + 1}</strong><button className="danger-link" onClick={() => patch({ alternateGreetings: character.alternateGreetings.filter((_, itemIndex) => itemIndex !== index) })}>删除</button></div><textarea rows={8} value={greeting} onChange={(event) => patch({ alternateGreetings: character.alternateGreetings.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} /></article>)}
      <button className="secondary-button" onClick={() => patch({ alternateGreetings: [...character.alternateGreetings, ''] })}>＋ 添加备用开场</button>
    </div>}

    {section === 'worldbook' && <div className="metadata-stack">
      <div className="manager-intro"><div><strong>{character.characterBook?.name || `${character.name}世界书`}</strong><small>保留关键词、插入位置、深度、概率和递归字段</small></div><button className="soft-button" onClick={() => { const entry = blankWorldEntry(nextEntryId(entries)); setEntries([...entries, entry]); setExpandedWorld(entry.id) }}>＋ 添加</button></div>
      {entries.length === 0 && <EmptyMetadata text="这张卡没有世界书条目" />}
      {entries.map((entry) => <article className="metadata-editor" key={entry.id}>
        <button className="metadata-summary" onClick={() => setExpandedWorld(expandedWorld === entry.id ? null : entry.id)}><span className={`status-dot ${entry.enabled ? 'on' : ''}`} /><div><strong>{entry.comment || `条目 ${entry.id}`}</strong><small>{entry.constant ? '常驻' : entry.keys.length ? entry.keys.join('、') : '无关键词'} · 深度 {entry.extensions.depth ?? 4}</small></div><span>⌄</span></button>
        {expandedWorld === entry.id && <div className="editor-body">
          <label>标题<input value={entry.comment} onChange={(event) => updateEntry(entry.id, { comment: event.target.value })} /></label>
          <label>主关键词<input value={entry.keys.join(', ')} onChange={(event) => updateEntry(entry.id, { keys: event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) })} /></label>
          <label>辅助关键词<input value={entry.secondary_keys.join(', ')} onChange={(event) => updateEntry(entry.id, { secondary_keys: event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) })} /></label>
          <label>正文<textarea rows={10} value={entry.content} onChange={(event) => updateEntry(entry.id, { content: event.target.value })} /></label>
          <div className="two-column-fields"><label>插入位置<select value={Number(entry.extensions.position) === 4 ? 'at_depth' : entry.position} onChange={(event) => { const position = event.target.value; updateEntry(entry.id, { position, extensions: { ...entry.extensions, position: position === 'at_depth' ? 4 : position === 'after_char' ? 1 : position === 'before_example' ? 2 : position === 'after_example' ? 3 : 0 } }) }}><option value="before_char">角色定义之前</option><option value="after_char">角色定义之后</option><option value="before_example">示例对话之前</option><option value="after_example">示例对话之后</option><option value="at_depth">指定深度</option></select></label><label>插入顺序<input type="number" value={entry.insertion_order} onChange={(event) => updateEntry(entry.id, { insertion_order: Number(event.target.value) })} /></label><label>深度<input type="number" min="0" value={entry.extensions.depth ?? 4} onChange={(event) => updateEntryExtensions(entry.id, { depth: Number(event.target.value) })} /></label><label>概率<input type="number" min="0" max="100" value={entry.extensions.probability ?? 100} onChange={(event) => updateEntryExtensions(entry.id, { probability: Number(event.target.value) })} /></label></div>
          <div className="toggle-grid"><Toggle label="启用" value={entry.enabled} onChange={(enabled) => updateEntry(entry.id, { enabled })} /><Toggle label="常驻" value={entry.constant} onChange={(constant) => updateEntry(entry.id, { constant })} /><Toggle label="选择性触发" value={entry.selective} onChange={(selective) => updateEntry(entry.id, { selective })} /><Toggle label="关键词按正则" value={entry.use_regex} onChange={(use_regex) => updateEntry(entry.id, { use_regex })} /></div>
          <button className="danger-button" onClick={() => setEntries(entries.filter((item) => item.id !== entry.id))}>删除这条世界书</button>
        </div>}
      </article>)}
    </div>}

    {section === 'regex' && <div className="metadata-stack">
      <div className="manager-intro"><div><strong>正则脚本</strong><small>显示规则用于消息美化，提示词规则会在发送给模型前执行</small></div><button className="soft-button" onClick={() => { const script = blankRegex(); setRegexScripts([...character.regexScripts, script]); setExpandedRegex(script.id) }}>＋ 添加</button></div>
      {character.regexScripts.length === 0 && <EmptyMetadata text="这张卡没有正则脚本" />}
      {character.regexScripts.map((script) => <article className="metadata-editor" key={script.id}>
        <button className="metadata-summary" onClick={() => setExpandedRegex(expandedRegex === script.id ? null : script.id)}><span className={`status-dot ${!script.disabled ? 'on' : ''}`} /><div><strong>{script.scriptName || '未命名正则'}</strong><small>{script.promptOnly ? '仅提示词' : script.markdownOnly ? '仅 Markdown' : '消息与显示'} · placement {script.placement.join(', ') || '未设'}</small></div><span>⌄</span></button>
        {expandedRegex === script.id && <div className="editor-body">
          <label>名称<input value={script.scriptName} onChange={(event) => updateRegex(script.id, { scriptName: event.target.value })} /></label>
          <label>查找正则<textarea rows={4} value={script.findRegex} onChange={(event) => updateRegex(script.id, { findRegex: event.target.value })} /></label>
          <label>替换内容<textarea rows={8} value={script.replaceString} onChange={(event) => updateRegex(script.id, { replaceString: event.target.value })} /></label>
          <label>Placement<input value={script.placement.join(', ')} onChange={(event) => updateRegex(script.id, { placement: event.target.value.split(/[,，]/).map(Number).filter(Number.isFinite) })} /></label>
          <div className="toggle-grid"><Toggle label="启用" value={!script.disabled} onChange={(enabled) => updateRegex(script.id, { disabled: !enabled })} /><Toggle label="仅 Markdown" value={script.markdownOnly} onChange={(markdownOnly) => updateRegex(script.id, { markdownOnly })} /><Toggle label="仅提示词" value={script.promptOnly} onChange={(promptOnly) => updateRegex(script.id, { promptOnly })} /><Toggle label="编辑时运行" value={script.runOnEdit} onChange={(runOnEdit) => updateRegex(script.id, { runOnEdit })} /></div>
          <button className="danger-button" onClick={() => setRegexScripts(character.regexScripts.filter((item) => item.id !== script.id))}>删除这条正则</button>
        </div>}
      </article>)}
    </div>}
  </section>
}

function MetadataArea({ label, value, onOpenFull }: { label: string; value: string; onOpenFull: () => void }) {
  return <article className="metadata-editor metadata-area"><button className="metadata-area-heading" onClick={onOpenFull}><div><strong>{label}</strong><small>{value.trim() ? `${value.trim().slice(0, 72)}${value.trim().length > 72 ? '…' : ''}` : '暂无内容'}</small></div><span>整页 ›</span></button></article>
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <button className={`mini-toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)}><span /><small>{label}</small></button>
}

function EmptyMetadata({ text }: { text: string }) {
  return <div className="empty-metadata"><span>✦</span><strong>{text}</strong></div>
}
