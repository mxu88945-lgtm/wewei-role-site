import type { ReactNode } from 'react'

/**
 * v218 布丁来信：每条消息 = 上方名字胶囊（真实头像、名字、签名、布丁狗）+ 下方小信封（POMPOM LETTER 抬头和落款；v219 去掉了信纸里的骨头小狗）。
 * 主剧情、小手机、人格窗口共用。图片放在 public/，按 /wewei-role-site/ 取，离线由 sw.js 缓存。
 */
const APP_ROOT = '/wewei-role-site/' // 与 vite.config base、sw.js APP_ROOT 一致
const asset = (name: string) => `${APP_ROOT}${name}`

export function PuddingCapsule({ name, avatar, user, onAvatarTap }: { name: string; avatar?: string; user: boolean; onAvatarTap?: () => void }) {
  return <div className={`pudding-capsule ${user ? 'from-me' : 'for-you'}`}>
    <div className="pudding-capsule-avatar" onPointerUp={onAvatarTap}>{avatar ? <img src={avatar} alt="" /> : <span>{name.slice(-1)}</span>}</div>
    <strong className="pudding-capsule-name">{name}</strong>
    <div className="pudding-capsule-copy"><span>{user ? '把迟到的回信，悄悄放进你的甜里。' : '把今天的心情，烤成一块软乎乎的布丁。'}</span><i aria-hidden="true" /></div>
    <img className="pudding-capsule-dog" src={asset('pudding-dog.svg')} alt="" aria-hidden="true" decoding="async" />
  </div>
}

export function PuddingLetter({ user, children, actions }: { user: boolean; children: ReactNode; actions?: ReactNode }) {
  return <div className={`pudding-letter ${user ? 'from-me' : 'for-you'}`}>
    <div className="pudding-letter-head" aria-hidden="true"><span>♡ POMPOM LETTER · {user ? 'FROM ME' : 'FOR YOU'}</span></div>
    <div className="archive-body">{children}</div>
    <div className="pudding-letter-foot" aria-hidden="true">POMPOMPURIN · SWEET LITTLE MESSAGE ♡</div>
    {actions}
  </div>
}
