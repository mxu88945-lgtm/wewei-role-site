import { useState, type FocusEvent } from 'react'
import type { PersonaTap } from './PersonaTaskCards'
import { newPersonId, parseAliases, PERSON_NOTES_LIMIT, removePerson, upsertPerson, type Person } from './peopleProfiles'
import { peopleStore, usePeople } from './lifeRecordsStore'

type Draft = { id: string; name: string; aliases: string; relation: string; notes: string }
const toDraft = (person?: Person): Draft => person
  ? { id: person.id, name: person.name, aliases: person.aliases.join('、'), relation: person.relation, notes: person.notes }
  : { id: newPersonId(), name: '', aliases: '', relation: '', notes: '' }

export default function PersonaPeoplePanel({ name, tap, onFocus }: { name: string; tap: PersonaTap; onFocus?: (event: FocusEvent<HTMLElement>) => void }) {
  const state = usePeople()
  const [draft, setDraft] = useState<Draft | null>(null)
  const isNew = draft ? !state.people.some((person) => person.id === draft.id) : false
  const save = () => {
    if (!draft?.name.trim()) return
    peopleStore.set((s) => upsertPerson(s, { id: draft.id, name: draft.name, aliases: parseAliases(draft.aliases), relation: draft.relation, notes: draft.notes }))
    setDraft(null)
  }
  if (draft) return <section className="persona-life-panel">
    <label className="persona-memory-field"><strong>名字</strong><input value={draft.name} maxLength={40} placeholder="例如：林小满" onFocus={onFocus} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
    <label className="persona-memory-field"><strong>别名</strong><small>小名、昵称，用逗号或顿号隔开。两个字以上才会被认出来。</small><input value={draft.aliases} maxLength={120} placeholder="小满、满满" onFocus={onFocus} onChange={(event) => setDraft({ ...draft, aliases: event.target.value })} /></label>
    <label className="persona-memory-field"><strong>和你的关系</strong><input value={draft.relation} maxLength={60} placeholder="大学室友" onFocus={onFocus} onChange={(event) => setDraft({ ...draft, relation: event.target.value })} /></label>
    <label className="persona-memory-field"><strong>备注</strong><textarea rows={4} value={draft.notes} maxLength={PERSON_NOTES_LIMIT} placeholder="TA 是个什么样的人、最近发生了什么" onFocus={onFocus} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
    <div className="persona-life-form-actions">
      <button className="soft-button" {...tap(() => setDraft(null))}>取消</button>
      <button className="primary-button" disabled={!draft.name.trim()} {...tap(save)}>保存</button>
    </div>
    {!isNew && <button className="danger-link" {...tap(() => { if (window.confirm(`删除「${draft.name}」的档案？`)) { peopleStore.set((s) => removePerson(s, draft.id)); setDraft(null) } })}>删除这个人</button>}
  </section>
  return <section className="persona-life-panel">
    <div className="persona-life-list" aria-label="人物列表">
      {state.people.map((person) => <button key={person.id} className="persona-life-row" {...tap(() => setDraft(toDraft(person)))}>
        <span><strong>{person.name}{person.relation ? <em> · {person.relation}</em> : null}</strong><small>{person.aliases.length ? `也叫 ${person.aliases.join('、')}` : person.notes.trim() || '还没写备注'}</small></span>
        <span className="persona-settings-chevron" aria-hidden="true">›</span>
      </button>)}
      {!state.people.length && <p className="persona-empty">还没有人。把你身边的人写进来，聊到 TA 时 {name} 会记得是谁。</p>}
    </div>
    <button className="primary-button" {...tap(() => setDraft(toDraft()))}>添加一个人</button>
    <div className="persona-toggle-row"><div><strong>提到时让 {name} 想起</strong><small>你们聊到某人的名字或别名时，把 TA 的档案悄悄带给 {name}。所有人格共用。</small></div><button className={`switch ${state.enabled ? 'on' : ''}`} aria-label="提到时想起人物档案" aria-pressed={state.enabled} {...tap(() => peopleStore.set((s) => ({ ...s, enabled: !s.enabled })))}><span /></button></div>
    <p className="persona-prompt-save">只存在这台设备上，随备份一起导出。</p>
  </section>
}
