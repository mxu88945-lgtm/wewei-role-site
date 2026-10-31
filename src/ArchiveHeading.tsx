export type ArchiveTheme = 'academy' | 'vinyl' | 'mobile'

export default function ArchiveHeading({ theme, name, avatar, user }: { theme: ArchiveTheme; name: string; avatar?: string; user: boolean }) {
  return <div className="archive-heading">
    {theme === 'mobile' && <div className="mobile-status" aria-hidden="true"><span>MESSAGE</span><span>⌁ ▰</span></div>}
    {theme === 'vinyl' && <div className="archive-kicker" aria-hidden="true"><span>REEL 24 / 33⅓ RPM</span><b>✦ SCENE ✦</b><span>CYAN & AMBER ✦</span></div>}
    <div className="archive-portrait"><div className="archive-disc" aria-hidden="true" /><div className="archive-cover">{avatar ? <img src={avatar} alt="" /> : <span>{name.slice(-1)}</span>}</div></div>
    <div className="archive-heading-copy">{theme === 'vinyl' && <small>SIDE A · CHARACTER ARCHIVE</small>}<strong className="archive-name">{name}</strong>{theme === 'mobile' && <small>{user ? '我的消息' : '角色来信'}</small>}{theme === 'vinyl' && <><em>Spinning softly, frame by frame.</em><div className="archive-track" aria-hidden="true"><i /><span>33⅓</span></div></>}</div>
    {theme === 'academy' && <span className="archive-grade" aria-hidden="true">{user ? 'A+' : 'B−'}</span>}
    {theme === 'vinyl' && <div className="archive-caption" aria-hidden="true">ANALOG PHONOGRAPH & CINEMA ARCHIVE</div>}
  </div>
}
