import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react'
import { normalizeSelfCard, normalizeSelfCardHistory, SELF_CARD_SECTION_MAX, SELF_CARD_SECTIONS, selfCardLength, SELF_CARD_TOTAL_MAX, type SelfCard, type SelfCardKey, type SelfCardVersion } from './personaSelfCard'

type Tap = (action: () => void) => { onPointerUp: (event: PointerEvent) => void; onClick: () => void }

const when = (at: number) => at ? new Date(at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

/** v211「他自己写的卡」：每栏一个输入框（离开输入框时保存），历史可恢复，开关「让他自己补全」。 */
export default function PersonaSelfCardPanel({ name, card, history, enabled, onSave, onRestore, onToggle, onFocus, tap }: {
  name: string
  card: SelfCard | undefined
  history: SelfCardVersion[] | undefined
  enabled: boolean
  onSave: (key: SelfCardKey, content: string) => void
  onRestore: (index: number) => void
  onToggle: () => void
  onFocus: (event: FocusEvent<HTMLElement>) => void
  tap: Tap
}) {
  const clean = normalizeSelfCard(card)
  const [drafts, setDrafts] = useState<SelfCard>(clean)
  const signature = JSON.stringify(clean)
  // 他在别处改了卡（或恢复了历史），输入框跟着换成新内容。
  useEffect(() => { setDrafts(JSON.parse(signature) as SelfCard) }, [signature])
  // 返回 / 关闭时输入框可能来不及失焦：卸载时把没保存的栏目补存一次。
  const pending = useRef<{ drafts: SelfCard; clean: SelfCard; onSave: typeof onSave }>({ drafts, clean, onSave })
  pending.current = { drafts, clean, onSave }
  useEffect(() => () => {
    const { drafts: last, clean: saved, onSave: save } = pending.current
    SELF_CARD_SECTIONS.forEach(({ key }) => { if (last[key] !== undefined && (last[key] || '').trim() !== (saved[key] || '')) save(key, last[key] || '') })
  }, [])
  const versions = normalizeSelfCardHistory(history)
  const total = selfCardLength(clean)
  return <section className="persona-prompt-panel persona-selfcard-panel">
    <div className="persona-settings-row persona-settings-toggle persona-selfcard-toggle">
      <span className="persona-settings-copy"><strong>让他自己补全</strong><small>相处中偶尔改一栏，原卡不动</small></span>
      <button className={`switch ${enabled ? 'on' : ''}`} aria-label="让他自己补全" aria-pressed={enabled} {...tap(onToggle)}><span /></button>
    </div>
    {SELF_CARD_SECTIONS.map(({ key, label }) => <div className="persona-selfcard-field" key={key}>
      <label className="persona-prompt-label" htmlFor={`persona-selfcard-${key}`}>{label}<span>{(drafts[key] || '').length} / {SELF_CARD_SECTION_MAX}</span></label>
      <textarea id={`persona-selfcard-${key}`} className="persona-selfcard-editor" rows={2} maxLength={SELF_CARD_SECTION_MAX} value={drafts[key] || ''} placeholder="还空着" onFocus={onFocus}
        onChange={(event) => { const value = event.target.value; setDrafts((current) => ({ ...current, [key]: value })) }}
        onBlur={() => { if ((drafts[key] || '').trim() !== (clean[key] || '')) onSave(key, drafts[key] || '') }} />
    </div>)}
    <small className="persona-prompt-save" role="status">离开输入框时保存 · {name}的所有窗口共用 · 合计 {total} / {SELF_CARD_TOTAL_MAX}</small>
    {versions.length > 0 && <details className="persona-default-prompt persona-selfcard-history">
      <summary>历史 · {versions.length} 版</summary>
      {versions.map((version, index) => ({ version, index })).reverse().map(({ version, index }) => <div className="persona-selfcard-version" key={`${version.at}-${index}`}>
        <div><strong>{version.reason ? `${version.reason}之前` : '旧版本'}</strong><small>{when(version.at)} · {selfCardLength(version.card)} 字</small></div>
        <button type="button" className="soft-button" {...tap(() => { if (window.confirm('恢复到这一版？现在的内容也会留在历史里。')) onRestore(index) })}>恢复到这一版</button>
      </div>)}
    </details>}
  </section>
}
