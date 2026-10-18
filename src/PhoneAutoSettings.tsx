import { useEffect, useState } from 'react'
import { PHONE_AUTO_EVENT, PHONE_AUTO_INTERVALS, readPhoneAuto, writePhoneAuto, type PhoneAutoSettings } from './phoneAuto'

const intervalLabel = (minutes: number) => minutes < 60 ? `${minutes} 分钟` : `${minutes / 60} 小时`

export default function PhoneAutoSettingsCard({ status }: { status: string }) {
  const [settings, setSettings] = useState<PhoneAutoSettings>(readPhoneAuto)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const sync = () => setSettings(readPhoneAuto())
    window.addEventListener(PHONE_AUTO_EVENT, sync)
    return () => window.removeEventListener(PHONE_AUTO_EVENT, sync)
  }, [])
  const change = (patch: Partial<PhoneAutoSettings>) => { const next = { ...settings, ...patch }; setSettings(next); writePhoneAuto(next) }
  const summary = settings.enabled ? `每 ${intervalLabel(settings.intervalMinutes)} · ${[settings.forum && '论坛', settings.moments && '朋友圈', settings.groups && '群聊'].filter(Boolean).join('、') || '没选内容'}${status ? ` · ${status}` : ''}` : '关闭 · 点这里让他们自己动起来'
  return <section className="phone-web-settings">
    <button type="button" className="phone-web-row" onClick={() => setOpen(!open)}><span>⏰ 自动活跃</span><small>{summary}</small></button>
    {open && <div className="phone-web-form phone-auto-form">
      <label className="forum-anon"><input type="checkbox" checked={settings.enabled} onChange={(event) => change({ enabled: event.target.checked, lastRun: event.target.checked ? 0 : settings.lastRun })} />开启</label>
      <div className="forum-boards">{PHONE_AUTO_INTERVALS.map((minutes) => <button key={minutes} type="button" className={settings.intervalMinutes === minutes ? 'active' : ''} onClick={() => change({ intervalMinutes: minutes })}>{intervalLabel(minutes)}</button>)}</div>
      <label className="forum-anon"><input type="checkbox" checked={settings.forum} onChange={(event) => change({ forum: event.target.checked })} />论坛：有人开帖、热帖接着盖楼</label>
      <label className="forum-anon"><input type="checkbox" checked={settings.moments} onChange={(event) => change({ moments: event.target.checked })} />朋友圈：有人发动态、大家点赞评论</label>
      <label className="forum-anon"><input type="checkbox" checked={settings.groups} onChange={(event) => change({ groups: event.target.checked })} />群聊：挑一个群让他们主动冒泡</label>
      <label className="forum-anon"><input type="checkbox" checked={settings.quietNight} onChange={(event) => change({ quietNight: event.target.checked })} />凌晨 1—7 点安静</label>
      <label className="forum-anon"><input type="checkbox" checked={settings.lateNight !== false} onChange={(event) => change({ lateNight: event.target.checked })} />深夜私聊：23 点到 1 点之间，偶尔有人来问一句「睡了吗」（不用开自动活跃也有）</label>
      <label className="forum-anon"><input type="checkbox" checked={settings.dayDm !== false} onChange={(event) => change({ dayDm: event.target.checked })} />白天私聊：9 点到 23 点，偶尔有人主动来找你，一天最多 3 次、至少隔 3 小时（不用开自动活跃也有）</label>
      <p>惟境开着时按点自动发；关掉后再打开，会补上错过的一轮。每个勾选项目通常会用掉一两次 API 调用。</p>
    </div>}
  </section>
}
