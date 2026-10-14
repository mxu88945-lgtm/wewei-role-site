import { useState } from 'react'
import { TAVILY_KEY_STORAGE } from './phoneWeb'

export default function PhoneWebSettings() {
  const [key, setKey] = useState(() => localStorage.getItem(TAVILY_KEY_STORAGE) || '')
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const save = (value: string) => {
    const next = value.trim()
    if (next) localStorage.setItem(TAVILY_KEY_STORAGE, next); else localStorage.removeItem(TAVILY_KEY_STORAGE)
    setKey(next); setDraft(''); setOpen(false)
  }
  return <section className="phone-web-settings">
    <button type="button" className="phone-web-row" onClick={() => setOpen(!open)}><span>🌐 联网搜索</span><small>{key ? '已连接 · 问新闻天气剧集时他们会先查' : '未连接 · 点这里填 Tavily key'}</small><i>{open ? '⌃' : '›'}</i></button>
    {open && <div className="phone-web-form">
      <p>在 tavily.com 用 Google 登录，复制 API Key（tvly- 开头）粘贴到这里。key 只存在这台手机的惟境里。</p>
      <input type="password" autoComplete="off" placeholder={key ? '已保存，粘贴新的可替换' : 'tvly-...'} value={draft} onChange={(event) => setDraft(event.target.value)} />
      <div className="phone-web-actions">{key && <button type="button" onClick={() => save('')}>断开</button>}<button type="button" className="primary" disabled={!draft.trim()} onClick={() => save(draft)}>保存</button></div>
    </div>}
  </section>
}
