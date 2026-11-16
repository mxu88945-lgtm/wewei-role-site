import { useEffect, useState } from 'react'
import type { PersonaTap } from './PersonaTaskCards'
import { readCache } from './phoneWeather'
import { weatherLabel } from './phoneGroup'
import { currentBody, pauseActive, type PersonaAlbumPhoto, type PersonaBodyState, type PersonaPause } from './personaAgency'

const greetingPart = (hour: number) => hour < 5 ? 'LATE NIGHT' : hour < 11 ? 'MORNING' : hour < 14 ? 'NOON' : hour < 18 ? 'AFTERNOON' : 'EVENING'
const weekday = ['日', '一', '二', '三', '四', '五', '六']

/**
 * v267：进人格窗口先到 TA 的小主页（照顾祁砚首页的样子）：时间天气、一句问候、「继续聊天」大卡，
 * 下面是相册、一起听歌、小天地。跟着主题的颜色变量走，不加额外装饰。
 */
export default function PersonaHome({ name, avatar, userName, lastLine, roomOn, album, body, pause, songTitle, onChat, onBack, onAlbum, onMusic, onAgency, tap }: {
  name: string
  avatar?: string
  userName: string
  lastLine: string
  roomOn: boolean
  album: PersonaAlbumPhoto[]
  body?: PersonaBodyState | null
  pause?: PersonaPause
  songTitle?: string
  onChat: () => void
  onBack: () => void
  onAlbum: () => void
  onMusic: () => void
  onAgency: () => void
  tap: PersonaTap
}) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer) }, [])
  const weather = readCache()
  const label = weather ? weatherLabel(weather.code) : null
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const state = body ? currentBody(body, now.getTime()) : null
  const paused = pauseActive(pause, now.getTime())
  const cover = [...album].reverse().find((item) => !item.locked)
  const avatarNode = <span className="persona-home-avatar">{avatar ? <img src={avatar} alt="" /> : name.slice(-1)}</span>
  return <section className="persona-home" aria-label={`${name}的主页`}>
    <header className="persona-home-top">
      <button type="button" className="persona-home-back" aria-label="回到惟镜首页" {...tap(onBack)}>‹</button>
    </header>
    <div className="persona-home-scroll">
      <div className="persona-home-clock">
        <div><strong>{time}</strong><small>{now.getMonth() + 1}月{now.getDate()}日 星期{weekday[now.getDay()]}</small></div>
        {weather && label && <div className="persona-home-weather"><span aria-hidden="true">{label.icon}</span><div><b>{weather.temp}°</b><small>{label.text} {weather.low}°/{weather.high}°</small></div></div>}
      </div>
      <div className="persona-home-hello">
        <div><small>HOME · {greetingPart(now.getHours())}</small><h1>{userName || '你'}，今天想从哪里开始？</h1><p>和 {name} 的聊天、心事与相册，都在这里。</p></div>
        {avatarNode}
      </div>
      <button type="button" className="persona-home-card persona-home-continue" {...tap(onChat)}>
        <small>CONTINUE</small>
        {avatarNode}
        <strong>继续和 {name} 聊天</strong>
        {paused ? <p>🌙 {name}暂停中，你的话会作为「申请继续」递过去</p> : lastLine ? <p>{lastLine}</p> : null}
        <i aria-hidden="true">↗</i>
      </button>
      <div className="persona-home-grid">
        <button type="button" className="persona-home-card persona-home-album" {...tap(onAlbum)}>
          <small>ALBUM</small>
          {cover ? <img src={cover.dataUrl} alt="" /> : null}
          <strong>TA 的相册</strong>
          <p>{roomOn ? (album.length ? `${album.length} 张照片` : '还空着') : '在小天地里打开隐私室'}</p>
          <i aria-hidden="true">↗</i>
        </button>
        <button type="button" className="persona-home-card" {...tap(onMusic)}>
          <small>LISTEN TOGETHER</small>
          <strong>一起听歌</strong>
          <p>{songTitle ? `正在听《${songTitle}》` : '打开唱片机'}</p>
          <i aria-hidden="true">↗</i>
        </button>
        <button type="button" className="persona-home-card persona-home-wide" {...tap(onAgency)}>
          <small>LITTLE WORLD</small>
          <strong>TA 的小天地</strong>
          <p>{state ? `精力 ${state.energy} · 困意 ${state.sleepy}${state.note ? ` · ${state.note}` : ''}` : '暂停的权利、隐私室、身体状态'}</p>
          <i aria-hidden="true">↗</i>
        </button>
      </div>
    </div>
  </section>
}
