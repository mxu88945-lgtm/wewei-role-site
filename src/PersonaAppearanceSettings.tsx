import type { PointerEvent } from 'react'
import type { PersonaAppearance, PersonaAppearanceValues, PersonaTheme } from './personaAppearance'
import type { ChatWallpaper } from './chatWallpaper'
import WallpaperSettings from './WallpaperSettings'

export type PersonaAppearanceControls = {
  values: PersonaAppearanceValues
  themes: PersonaTheme[]
  wallpaper: ChatWallpaper
  ready: boolean
  upload?: { busy: boolean; message: string }
  error?: string
  onWallpaperChange: (patch: Partial<ChatWallpaper>) => void
  onWallpaperUpload: (file: File) => void
  onWallpaperReset: () => void
}
type Tap = (action: () => void) => { onPointerUp: (event: PointerEvent) => void; onClick: () => void }

export default function PersonaAppearanceSettings({ controls, appearance, name, avatar, onChange, tap }: { controls: PersonaAppearanceControls; appearance?: PersonaAppearance; name: string; avatar?: string; onChange: (next: PersonaAppearance | undefined) => void; tap: Tap }) {
  const { values } = controls
  const update = (patch: Partial<PersonaAppearance>) => onChange({ ...appearance, ...patch })
  return <section className="persona-appearance-settings">
    <p className="persona-prompt-save">自动保存 · 仅 {name} 使用，TA 的所有窗口共用。未单独设置的项目跟随应用默认。</p>
    <section className="theme-choice-card"><strong>主题库</strong><div className="theme-choice-grid">{controls.themes.map((theme) => <button key={theme.id} className={theme.id === values.theme.id ? 'active' : ''} {...tap(() => { const next = { ...appearance, theme }; delete next.baseColor; delete next.textColor; delete next.narrationColor; delete next.quoteColor; onChange(next) })}><i style={{ background: theme.baseColor }} /><span><strong>{theme.name}</strong><small>{theme.id === values.theme.id ? '✓ 当前使用' : '点按使用'}</small></span></button>)}</div></section>
    <div className="appearance-card range-group">{([['fontSize', '聊天正文字号', 13, 22, 1], ['uiScale', '界面字号', 80, 115, 5], ['uiWeight', '界面字重', 400, 700, 100]] as const).map(([key, label, min, max, step]) => <label className="persona-appearance-range" key={key}><span>{label}<output>{values[key]}{key === 'fontSize' ? 'px' : key === 'uiScale' ? '%' : ''}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={values[key]} onChange={(event) => update({ [key]: Number(event.target.value) })} /></label>)}</div>
    <div className="appearance-card">{([['baseColor', '主题底色'], ['textColor', '正文颜色'], ['narrationColor', '旁白颜色'], ['quoteColor', '引用颜色']] as const).map(([key, label]) => <label className="appearance-color-row" key={key}><div><strong>{label}</strong><small>{values[key]}</small></div><input aria-label={label} type="color" value={values[key]} onChange={(event) => update({ [key]: event.target.value })} /></label>)}</div>
    <div className="appearance-preview chat-font-preview" style={{ fontSize: values.fontSize, color: values.textColor }}><small>聊天正文预览</small><p><span style={{ color: values.narrationColor }}>（他抬眼看向你。）</span><br /><span style={{ color: values.quoteColor }}>“想听你再说一句。”</span></p></div>
    {controls.error && <p className="privacy-note" role="alert">{controls.error}</p>}
    <WallpaperSettings wallpaper={controls.wallpaper} avatar={avatar} themeColor={values.baseColor} scopeLabel={`${name} · 人格窗口`} group={false} independentPersona ready={controls.ready} upload={controls.upload} onChange={controls.onWallpaperChange} onUpload={controls.onWallpaperUpload} onReset={controls.onWallpaperReset} />
    <button className="secondary-button" {...tap(() => onChange(undefined))}>主题与文字恢复跟随应用默认</button>
  </section>
}
