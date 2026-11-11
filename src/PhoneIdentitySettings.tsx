import { useState } from 'react'
import type { ScopeIdentity } from './chatScope'
import { isPhoneIdentitySet, type PhoneIdentity } from './phoneIdentity'

type Props = {
  value: PhoneIdentity
  resolved: ScopeIdentity
  onChange: (next: PhoneIdentity) => void
  onAvatarFile: (file: File) => Promise<string>
  defaultOpen?: boolean
}

/** 小手机自己的「我」：名字、头像、一句简介。没填名字时用身份库的基础身份。 */
export default function PhoneIdentitySettings({ value, resolved, onChange, onAvatarFile, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const set = isPhoneIdentitySet(value)
  const summary = set ? `${value.name.trim()} · 只在小手机里用` : `没单独设置 · 现在用「${resolved.name}」`
  const update = (patch: Partial<PhoneIdentity>) => onChange({ ...value, ...patch })
  const avatar = value.avatar || resolved.avatar
  return <section className="phone-web-settings phone-identity-settings">
    <button type="button" className="phone-web-row" onClick={() => setOpen(!open)}><span>🪪 小手机里的我</span><small>{summary}</small><i>{open ? '⌃' : '›'}</i></button>
    {open && <div className="phone-web-form">
      <p>群聊、私聊、论坛、商店和戏外手记里的你。和正在跑的剧情用哪个身份无关；名字留空就用「设置 → 用户身份」里的第一个身份（{resolved.name}）。</p>
      <div className="identity-avatar-editor">
        <div>{avatar ? <img src={avatar} alt="小手机头像" /> : <span>{(value.name.trim() || resolved.name).slice(-1) || '惟'}</span>}</div>
        <label className="soft-button">选择头像<input type="file" onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          if (!file.type.startsWith('image/') && !/\.(png|jpe?g|gif|webp|heic|heif|avif|bmp)$/i.test(file.name)) { window.alert('请选一张图片。'); return }
          try { update({ avatar: await onAvatarFile(file) }) } catch { window.alert('这张图读不出来，换一张试试。') }
        }} /></label>
        {value.avatar && <button type="button" className="text-button" onClick={() => update({ avatar: undefined })}>移除</button>}
      </div>
      <input value={value.name} maxLength={40} placeholder={`名字（留空用「${resolved.name}」）`} onChange={(event) => update({ name: event.target.value })} />
      <textarea className="phone-identity-description" rows={3} maxLength={2000} value={value.description} placeholder="一句话简介，可留空（例如：陪他们对戏的人，养了九只玄凤）" onChange={(event) => update({ description: event.target.value })} />
      {set && <div className="phone-web-actions"><button type="button" onClick={() => { if (window.confirm('清空小手机身份，改回用身份库的基础身份？')) onChange({ name: '', description: '' }) }}>清空</button></div>}
    </div>}
  </section>
}
