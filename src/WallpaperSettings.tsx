import type { ChatWallpaper } from './chatWallpaper'
import { wallpaperImage } from './chatWallpaper'
import './wallpaper.css'

export function WallpaperLayers({ wallpaper, avatar, themeColor, className = '' }: { wallpaper: ChatWallpaper; avatar?: string; themeColor: string; className?: string }) {
  const image = wallpaperImage(wallpaper, avatar)
  return <div className={`wallpaper-layers ${className}`} aria-hidden="true" style={{ backgroundColor: wallpaper.enabled ? wallpaper.color : themeColor }}>
    {image && <div className="wallpaper-image" style={{ backgroundImage: `url(${JSON.stringify(image)})`, opacity: wallpaper.imageOpacity }} />}
    {image && <div className="wallpaper-color" style={{ backgroundColor: wallpaper.color, opacity: wallpaper.colorOpacity }} />}
  </div>
}

export default function WallpaperSettings({ wallpaper, avatar, themeColor, scopeLabel, group, ready, upload, onChange, onUpload, onReset }: { wallpaper: ChatWallpaper; avatar?: string; themeColor: string; scopeLabel: string; group: boolean; ready: boolean; upload?: { busy: boolean; message: string }; onChange: (patch: Partial<ChatWallpaper>) => void; onUpload: (file: File) => void; onReset: () => void }) {
  const image = wallpaperImage(wallpaper, avatar)
  return <section className="appearance-card wallpaper-settings" aria-label="独立聊天壁纸">
    <div className="wallpaper-heading"><div><strong>独立聊天壁纸</strong><small>{group ? '仅这个群聊' : '仅这个角色的单人聊天'} · {scopeLabel}</small></div><button type="button" className={'switch ' + (wallpaper.enabled ? 'on' : '')} role="switch" aria-label="启用当前聊天壁纸" aria-checked={wallpaper.enabled} disabled={!ready} onClick={() => onChange({ enabled: !wallpaper.enabled })}><span /></button></div>
    <p className="wallpaper-note">{group ? '不会影响成员的单人聊天，也不会影响其他群聊。' : '同一角色的其他单人窗口共用这份壁纸；切换角色不会串图。'}关闭后保留设置，可随时重新开启。</p>
    <fieldset disabled={!ready} className="wallpaper-controls">
      <label>背景来源<select value={wallpaper.source} onChange={(event) => onChange({ source: event.target.value as ChatWallpaper['source'] })}><option value="none">仅使用底色</option><option value="avatar">{group ? '使用群聊首位成员头像' : '使用角色头像'}</option><option value="image">使用自选图片</option></select></label>
      {wallpaper.source === 'avatar' && !avatar && <p role="status">当前没有头像，可以先设置角色头像或选择图片。</p>}
      <div className="appearance-actions"><label className="primary-button wallpaper-upload">{upload?.busy ? '正在处理，可重新选图' : '选择 / 更换图片'}<input aria-label="上传当前角色或群聊的壁纸" type="file" accept="image/*" onChange={(event) => { const input = event.currentTarget; const file = input.files?.[0]; input.value = ''; if (file) onUpload(file) }} /></label><button type="button" className="secondary-button" disabled={!wallpaper.image} onClick={() => onChange({ source: 'none', image: '' })}>移除自选图片</button></div>
      <label className="wallpaper-range">背景图片透明度 <output>{Math.round(wallpaper.imageOpacity * 100)}%</output><input aria-label="背景图片透明度" type="range" min={0} max={100} step={1} value={Math.round(wallpaper.imageOpacity * 100)} onChange={(event) => onChange({ imageOpacity: Number(event.target.value) / 100 })} /></label>
      <label className="wallpaper-color-picker">底色 <input aria-label="壁纸底色" type="color" value={wallpaper.color} onChange={(event) => onChange({ color: event.target.value })} /><span>{wallpaper.color.toUpperCase()}</span></label>
      <label className="wallpaper-range">底色遮罩透明度 <output>{Math.round(wallpaper.colorOpacity * 100)}%</output><input aria-label="底色遮罩透明度" type="range" min={0} max={100} step={1} value={Math.round(wallpaper.colorOpacity * 100)} onChange={(event) => onChange({ colorOpacity: Number(event.target.value) / 100 })} /></label>
      <p className="wallpaper-note">图片 100% 为原图；底色遮罩 0% 不遮图，调高后文字更清楚。</p>
      {upload?.message && <p role="status">{upload.message}</p>}
      <div className="wallpaper-preview" aria-label="当前聊天壁纸预览"><WallpaperLayers wallpaper={wallpaper} avatar={avatar} themeColor={themeColor} /><div className="wallpaper-preview-content"><small>{scopeLabel} · 实时预览</small><p>{!wallpaper.enabled ? '壁纸已关闭，聊天显示主题底色。' : image ? '这是聊天里的壁纸效果。' : '当前使用纯底色。'}</p><span>你的回应会显示在这里。</span></div></div>
      <div className="appearance-actions"><button type="button" className="secondary-button" onClick={onReset}>恢复当前壁纸默认</button></div>
    </fieldset>
  </section>
}
