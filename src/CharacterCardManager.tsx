import { useState } from 'react'
import type { Character, RegexScript, WorldBookEntry } from './characterCard'

export type CharacterCardSection = 'overview' | 'greetings' | 'worldbook' | 'regex'

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
  const entries = character.characterBook?.entries || []

  const patch = (value: Partial<Character>) => onChange({ ...character, ...value })
  const setEntries = (nextEntries: WorldBookEntry[]) => patch({ characterBook: { ...(character.characterBook || { name: `${character.name}世界书` }), entries: nextEntries } })
  const setRegexScripts = (regexScripts: RegexScript[]) => patch({ regexScripts })

  const updateEntry = (id: number, value: Partial<WorldBookEntry>) => setEntries(entries.map((entry) => entry.id === id ? { ...entry, ...value } : entry))
  const updateEntryExtensions = (id: number, value: Record<string, unknown>) => setEntries(entries.map((entry) => entry.id === id ? { ...entry, extensions: { ...entry.extensions, ...value } } : entry))
  const updateRegex = (id: string, value: Partial<RegexScript>) => setRegexScripts(character.regexScripts.map((script) => script.id === id ? { ...script, ...value } : script))

  return <section className="card-manager">
    <header className="page-header"><button className="icon-button" onClick={onBack}>‹</button><h1>角色卡数据</h1><div className="header-action"><span className="saved-label">自动保存</span></div></header>

    <div className="card-format-banner">
      {character.avatar ? <img src={character.avatar} alt="" /> : <span>{character.name.slice(-1)}</span>}
      <div><strong>{character.name}</strong><small>{character.cardSpec || '手动创建'} · {character.cardSpecVersion || '本地格式'}</small><small>{character.sourceFileName || '未关联原始文件'}</small></div>
      <label className="avatar-edit-button">更换头像<input type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (file) patch({ avatar: await avatarThumbnail(file) }); event.currentTarget.value = '' }} /></label>
    </div>

    <nav className="card-tabs">
      {([['overview', '主体'], ['greetings', `开场 ${character.alternateGreetings.length + 1}`], ['worldbook', `世界书 ${entries.length}`], ['regex', `正则 ${character.regexScripts.length}`]] as const).map(([value, label]) => <button key={value} className={section === value ? 'active' : ''} onClick={() => setSection(value)}>{label}</button>)}
    </nav>

    {section === 'overview' && <div className="metadata-stack">
      <article className="metadata-editor basic-metadata-editor">
        <div className="editor-heading"><strong>基础资料</strong><small>修改后自动保存，不影响已有聊天和记忆</small></div>
        <div className="editor-body basic-metadata-fields">
          <label>角色名称<input value={character.name} onChange={(event) => patch({ name: event.target.value })} placeholder="填写角色名称" /></label>
          <label>一句话简介<input value={character.tagline} onChange={(event) => patch({ tagline: event.target.value })} placeholder="填写角色身份或一句话简介" /></label>
        </div>
      </article>
      <MetadataArea label="角色描述" value={character.description} onChange={(description) => patch({ description })} />
      <MetadataArea label="性格" value={character.personality} onChange={(personality) => patch({ personality })} />
      <MetadataArea label="场景" value={character.scenario} onChange={(scenario) => patch({ scenario })} />
      <MetadataArea label="系统提示词" value={character.systemPrompt} onChange={(systemPrompt) => patch({ systemPrompt })} />
      <MetadataArea label="历史后置指令" value={character.postHistoryInstructions} onChange={(postHistoryInstructions) => patch({ postHistoryInstructions })} />
      <MetadataArea label="示例对话" value={character.mesExample} onChange={(mesExample) => patch({ mesExample })} />
      <MetadataArea label="作者备注" value={character.creatorNotes} onChange={(creatorNotes) => patch({ creatorNotes })} />
    </div>}

    {section === 'greetings' && <div className="metadata-stack">
      <MetadataArea label="主开场白" value={character.greeting} onChange={(greeting) => patch({ greeting })} />
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

function MetadataArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  return <article className={`metadata-editor metadata-area ${expanded ? 'expanded' : ''}`}><button className="metadata-area-heading" onClick={() => setExpanded(!expanded)}><div><strong>{label}</strong><small>{value.trim() ? `${value.trim().slice(0, 72)}${value.trim().length > 72 ? '…' : ''}` : '暂无内容'}</small></div><span>{expanded ? '收起⌃' : '展开⌄'}</span></button>{expanded && <textarea rows={10} value={value} onChange={(event) => onChange(event.target.value)} />}</article>
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <button className={`mini-toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)}><span /><small>{label}</small></button>
}

function EmptyMetadata({ text }: { text: string }) {
  return <div className="empty-metadata"><span>✦</span><strong>{text}</strong></div>
}
