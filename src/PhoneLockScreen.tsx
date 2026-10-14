import { useEffect, useRef, useState } from 'react'
import type { PhoneLockState } from './phoneGroup'

type Props = { lock: PhoneLockState; avatar?: string; userName: string; onExpire: () => void; onBreak: () => void; onLeave: () => void }

/** 角色给小手机下的锁：只盖住小手机页和小手机群聊，惟境其他地方照常用。 */
export default function PhoneLockScreen({ lock, avatar, userName, onExpire, onBreak, onLeave }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const [confirming, setConfirming] = useState(false)
  const expired = useRef(false)
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const left = Math.max(0, lock.until - now)
  useEffect(() => {
    if (left === 0 && !expired.current) { expired.current = true; onExpire() }
  }, [left, onExpire])
  const minutes = Math.floor(left / 60000)
  const seconds = Math.floor((left % 60000) / 1000)
  const progress = Math.min(1, Math.max(0, (now - lock.startedAt) / Math.max(1, lock.until - lock.startedAt)))
  return <div className="phone-lock-layer" role="dialog" aria-modal="true" aria-label="小手机已锁屏">
    <div className="phone-lock-card">
      <div className="phone-lock-avatar">{avatar ? <img src={avatar} alt="" /> : <span>{lock.byName.slice(-1)}</span>}<i>🔒</i></div>
      <small>{lock.byName} 锁了你的小手机</small>
      <strong className="phone-lock-timer">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</strong>
      <div className="phone-lock-bar"><span style={{ width: `${progress * 100}%` }} /></div>
      {lock.reason && <p className="phone-lock-reason">“{lock.reason}”</p>}
      <p className="phone-lock-hint">{userName}，到点自动解开。惟境其他地方还能用。</p>
      <div className="phone-lock-actions">
        <button type="button" onClick={onLeave}>先去别处</button>
        {confirming
          ? <button type="button" className="danger" onClick={onBreak}>真的解锁（会被告状）</button>
          : <button type="button" onClick={() => setConfirming(true)}>偷偷解锁</button>}
      </div>
    </div>
  </div>
}
