import { useMemo, useState } from 'react'
import MessageContent from './MessageContent'
import type { Character } from './characterCard'

function plainPreview(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/```(?:html)?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function ImportPreview({ character, onCancel, onConfirm }: { character: Character; onCancel: () => void; onConfirm: (options: { includeBook: boolean; includeRegex: boolean }) => void }) {
  const [includeBook, setIncludeBook] = useState(Boolean(character.characterBook?.entries.length))
  const [includeRegex, setIncludeRegex] = useState(Boolean(character.regexScripts.length))
  const notes = character.creatorNotes || character.description

  return <section className="import-preview-page">
    <header className="page-header"><button className="icon-button" onClick={onCancel}>‹</button><h1>导入角色</h1><div /></header>
    <div className="import-character-head">
      {character.avatar ? <img src={character.avatar} alt="" /> : <span>{character.name.slice(-1)}</span>}
      <h2>{character.name}</h2>
      <div className="chips">{character.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}</div>
      <p>{character.creator ? `作者：${character.creator}` : '角色卡作者未标注'} · V{character.cardSpecVersion || '?'}</p>
    </div>
    <article className="import-notes-card"><strong>角色信息</strong><p>{plainPreview(notes).slice(0, 420) || '这张卡没有填写备注。'}</p></article>
    <button className={`import-option ${includeBook ? 'selected' : ''}`} onClick={() => setIncludeBook(!includeBook)}><span>◎</span><div><strong>{character.characterBook?.name || `${character.name}的世界书`}</strong><small>{character.characterBook?.entries.length || 0} 条世界书数据</small></div><i>{includeBook ? '✓' : ''}</i></button>
    <button className={`import-option ${includeRegex ? 'selected' : ''}`} onClick={() => setIncludeRegex(!includeRegex)}><span>(.*)</span><div><strong>{character.name}的正则</strong><small>{character.regexScripts.length} 条美化与替换规则</small></div><i>{includeRegex ? '✓' : ''}</i></button>
    <div className="import-count-note">将导入 {character.alternateGreetings.length + 1} 个开场白，可在开始共演时选择。</div>
    <button className="primary-button full import-confirm" onClick={() => onConfirm({ includeBook, includeRegex })}>导入角色</button>
  </section>
}

export function GreetingPicker({ character, userName, onCancel, onConfirm }: { character: Character; userName: string; onCancel: () => void; onConfirm: (greeting: string) => void }) {
  const greetings = useMemo(() => [character.greeting, ...character.alternateGreetings].filter(Boolean), [character])
  const [selected, setSelected] = useState(0)
  const [expanded, setExpanded] = useState<number | null>(null)

  return <section className="greeting-picker-page">
    <header className="picker-header"><button onClick={onCancel}>取消</button><h1>选择开场白</h1><button onClick={() => onConfirm(greetings[selected] || character.greeting)}>确定</button></header>
    <div className="picker-character"><span />{character.avatar ? <img src={character.avatar} alt="" /> : <b>{character.name.slice(-1)}</b>}<strong>{character.name}</strong><span /></div>
    <div className="greeting-list">
      {greetings.map((greeting, index) => {
        const preview = plainPreview(greeting)
        return <article key={index} className={`greeting-option ${selected === index ? 'selected' : ''}`} onClick={() => setSelected(index)}>
          <div className="greeting-option-head">{character.avatar ? <img src={character.avatar} alt="" /> : <b>{character.name.slice(-1)}</b>}<div><small>{character.name} · 开场 {index + 1}</small><p>{preview.slice(0, 110) || 'HTML 美化开场'}</p></div><button onClick={(event) => { event.stopPropagation(); setExpanded(expanded === index ? null : index) }}>{expanded === index ? '⌃' : '⌄'}</button></div>
          {expanded === index && <div className="greeting-render-preview"><MessageContent text={greeting} role="assistant" character={character} userName={userName} /></div>}
        </article>
      })}
    </div>
  </section>
}


export type GroupGreetingChoice = { characterId: string; greeting: string }

export function GroupGreetingPicker({ characters, userName, onCancel, onConfirm }: { characters: Character[]; userName: string; onCancel: () => void; onConfirm: (choice: GroupGreetingChoice) => void }) {
  const choices = useMemo(() => characters.flatMap((character) => [character.greeting, ...character.alternateGreetings]
    .filter(Boolean)
    .map((greeting, index) => ({ character, greeting, index }))), [characters])
  const [selected, setSelected] = useState(0)
  const [expanded, setExpanded] = useState<number | null>(null)
  const choice = choices[selected] || choices[0]

  return <section className="greeting-picker-page">
    <header className="picker-header"><button onClick={onCancel}>取消</button><h1>选择群聊开场</h1><button disabled={!choice} onClick={() => choice && onConfirm({ characterId: choice.character.id, greeting: choice.greeting })}>确定</button></header>
    <div className="group-picker-members" title={characters.map((character) => character.name).join('、')}>{characters.map((character) => character.name).join('、')}</div>
    <div className="import-count-note">选择一位成员的一条开场作为整个剧场的第一幕，其余成员不会重复发送开场白。</div>
    <div className="greeting-list">
      {choices.map(({ character, greeting, index }, choiceIndex) => {
        const preview = plainPreview(greeting)
        return <article key={`${character.id}-${index}`} className={`greeting-option ${selected === choiceIndex ? 'selected' : ''}`} onClick={() => setSelected(choiceIndex)}>
          <div className="greeting-option-head">{character.avatar ? <img src={character.avatar} alt="" /> : <b>{character.name.slice(-1)}</b>}<div><small>{character.name} · 开场 {index + 1}</small><p>{preview.slice(0, 110) || 'HTML 美化开场'}</p></div><button onClick={(event) => { event.stopPropagation(); setExpanded(expanded === choiceIndex ? null : choiceIndex) }}>{expanded === choiceIndex ? '⌃' : '⌄'}</button></div>
          {expanded === choiceIndex && <div className="greeting-render-preview"><MessageContent text={greeting} role="assistant" character={character} userName={userName} /></div>}
        </article>
      })}
      {!choices.length && <div className="import-notice error">所选成员都没有开场白，请先到角色卡里添加。</div>}
    </div>
  </section>
}
