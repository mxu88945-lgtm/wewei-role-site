import { useState } from 'react'
import './opening-template.css'
import {
  OPENING_TEMPLATE_OPTIONS, OPENING_THEME_KEYS, OPENING_THEME_LABELS, OPENING_THEME_PRESETS,
  createOpeningTemplate, normalizeHexColor, openingLines,
  type OpeningTemplate, type OpeningTemplateData, type OpeningTemplateTheme,
} from './openingTemplates'

type ListKey = 'chats' | 'songs' | 'posts' | 'friendGroups' | 'friendTags'

/** 列表字段在编辑时保留原始文本，失焦时再解析，避免打字时被“吃掉”分隔符。 */
function LinesField({ label, hint, value, rows = 3, onCommit }: { label: string; hint: string; value: string; rows?: number; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return <label><span>{label}</span><textarea rows={rows} value={draft ?? value} placeholder={hint} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (draft !== null) onCommit(draft); setDraft(null) }} /><small className="opening-template-hint">{hint}</small></label>
}

function HexField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? value
  const invalid = draft !== null && !normalizeHexColor(draft)
  return <label className={`opening-template-hex${invalid ? ' is-invalid' : ''}`}>
    <span>{label}</span>
    <i style={{ background: normalizeHexColor(shown) || value }} />
    <input value={shown} maxLength={7} spellCheck={false} onChange={(event) => {
      const next = event.target.value.trim()
      setDraft(next)
      const color = normalizeHexColor(next)
      if (color) onChange(color)
    }} onBlur={() => setDraft(null)} />
  </label>
}

export default function OpeningTemplateEditor({ value, onChange, onAiFill, onStopAi, aiBusy = false, aiError = '' }: {
  value?: OpeningTemplate
  onChange: (next: OpeningTemplate | undefined) => void
  onAiFill?: () => void
  onStopAi?: () => void
  aiBusy?: boolean
  aiError?: string
}) {
  const setTheme = (patch: Partial<OpeningTemplateTheme>) => { if (value) onChange({ ...value, theme: { ...value.theme, ...patch } }) }
  const setData = (patch: Partial<OpeningTemplateData>) => { if (value) onChange({ ...value, data: { ...value.data, ...patch } }) }
  const commitList = (key: ListKey, raw: string) => {
    if (key === 'chats') setData({ chats: openingLines.chats.parse(raw) })
    if (key === 'songs') setData({ songs: openingLines.songs.parse(raw) })
    if (key === 'posts') setData({ posts: openingLines.posts.parse(raw) })
    if (key === 'friendGroups') setData({ friendGroups: openingLines.friendGroups.parse(raw) })
    if (key === 'friendTags') setData({ friendTags: openingLines.tags.parse(raw) })
  }
  const activePreset = value ? OPENING_THEME_PRESETS.find((preset) => OPENING_THEME_KEYS.every((key) => preset.theme[key] === value.theme[key]))?.id : ''
  const text = (key: keyof OpeningTemplateData, label: string, rows = 0, placeholder = '') => {
    const current = value ? String(value.data[key] ?? '') : ''
    return <label key={key}><span>{label}</span>{rows
      ? <textarea rows={rows} value={current} placeholder={placeholder} onChange={(event) => setData({ [key]: event.target.value } as Partial<OpeningTemplateData>)} />
      : <input value={current} placeholder={placeholder} onChange={(event) => setData({ [key]: event.target.value } as Partial<OpeningTemplateData>)} />}</label>
  }

  return <div className="opening-template-editor">
    <div className="workshop-section-heading"><div><strong>开场美化模板</strong><small>显示在第一条开场白上方的互动页面；开场白正文不变，颜色随时可换</small></div></div>
    <div className="opening-template-choice" role="radiogroup" aria-label="开场美化模板">
      <button type="button" role="radio" aria-checked={!value} className={!value ? 'active' : ''} onClick={() => onChange(undefined)}>无</button>
      {OPENING_TEMPLATE_OPTIONS.map((option) => <button key={option.id} type="button" role="radio" aria-checked={value?.id === option.id} className={value?.id === option.id ? 'active' : ''} onClick={() => { if (value?.id !== option.id) onChange(value ? { ...value, id: option.id } : createOpeningTemplate(option.id)) }}>{option.label}</button>)}
    </div>
    {value && <>
      <div className="opening-template-presets">
        {OPENING_THEME_PRESETS.map((preset) => <button key={preset.id} type="button" className={activePreset === preset.id ? 'active' : ''} onClick={() => onChange({ ...value, theme: { ...preset.theme } })}>
          <span>{[preset.theme.primary, preset.theme.secondary, preset.theme.accent].map((color) => <i key={color} style={{ background: color }} />)}</span>{preset.label}
        </button>)}
      </div>
      <details className="opening-template-colors"><summary>自定义颜色（十六进制）</summary>
        <div className="opening-template-hex-grid">{OPENING_THEME_KEYS.map((key) => <HexField key={key} label={OPENING_THEME_LABELS[key]} value={value.theme[key]} onChange={(color) => setTheme({ [key]: color })} />)}</div>
      </details>
      {onAiFill && <div className="opening-template-ai">
        {aiBusy
          ? <button type="button" className="workshop-stop" onClick={onStopAi}>停止</button>
          : <button type="button" className="workshop-inline-assistant" onClick={onAiFill}>✦ 让 AI 按人物填内容</button>}
        <small>{aiBusy ? '正在按人设写信、说说和歌单…' : '用角色自己的口吻写，不替你说话；写完还能逐项改。也可以在工坊助手里说“开场模板改成紫灰色”。'}</small>
      </div>}
      {aiError && <div className="workshop-error">{aiError}</div>}
      <details className="opening-template-fields"><summary>编辑模板内容</summary>
        <label><span>QQ空间按钮里的代词</span><select value={value.data.pronoun} onChange={(event) => setData({ pronoun: event.target.value })}><option value="他">他</option><option value="她">她</option><option value="TA">TA</option></select></label>
        {text('letter', '信（写给 {{user}}）', 4, '留空用默认的一封短信')}
        <div className="workshop-two">{text('englishName', '英文名 / 副标题')}{text('age', '年龄')}</div>
        <div className="workshop-two">{text('personality', '性格')}{text('signature', 'QQ 签名')}</div>
        {text('intro', '人物简介', 3)}
        {text('notice', '空间公告', 2)}
        {text('mood', '今日心情', 2)}
        <LinesField label="QQ 消息（最多 2 条）" hint="一行一条：时间｜内容" value={openingLines.chats.format(value.data.chats)} onCommit={(raw) => commitList('chats', raw)} />
        <LinesField label="歌单（5 首）" rows={5} hint="一行一首：歌名｜歌手；第一首会出现在播放器里" value={openingLines.songs.format(value.data.songs)} onCommit={(raw) => commitList('songs', raw)} />
        {text('musicDiary', '音乐日记', 2)}
        <LinesField label="说说（最多 3 条）" rows={4} hint="一行一条：时间｜内容｜点赞数｜好友名：评论" value={openingLines.posts.format(value.data.posts)} onCommit={(raw) => commitList('posts', raw)} />
        {text('albumCaption', '相册配文')}
        <LinesField label="好友分组" hint="一行一组：分组名｜人数，如 我的好友｜4/12" value={openingLines.friendGroups.format(value.data.friendGroups)} onCommit={(raw) => commitList('friendGroups', raw)} />
        <LinesField label="好友印象" rows={1} hint="用逗号隔开，最多 6 个" value={openingLines.tags.format(value.data.friendTags)} onCommit={(raw) => commitList('friendTags', raw)} />
      </details>
    </>}
  </div>
}
