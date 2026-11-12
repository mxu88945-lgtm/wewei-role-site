export type ArchiveTheme = 'academy' | 'vinyl' | 'mobile' | 'letter' | 'mistnote' | 'nightglow' | 'pudding'

export default function ArchiveHeading({ theme, name, avatar, user }: { theme: ArchiveTheme; name: string; avatar?: string; user: boolean }) {
  return <div className="archive-heading">
    {theme === 'pudding' && <div className="pudding-kicker" aria-hidden="true"><span>♡ POMPOM LETTER · {user ? 'FROM ME' : 'FOR YOU'}</span><i>૮ ・ﻌ・ა</i></div>}
    {theme === 'mobile' && <div className="mobile-status" aria-hidden="true"><span>MESSAGE</span><span>⌁ ▰</span></div>}
    {theme === 'letter' && <div className="letter-cover" aria-hidden="true"><span>LETTERS · AFTERGLOW</span><i>✦</i></div>}
    {theme === 'mistnote' && <div className="mistnote-kicker" aria-hidden="true"><span>LETTERS · MIST</span><i>✦</i></div>}
    {theme === 'vinyl' && <div className="archive-kicker" aria-hidden="true"><span>REEL 24 / 33⅓ RPM</span><b>✦ SCENE ✦</b><span>CYAN & AMBER ✦</span></div>}
    <div className="archive-portrait"><div className="archive-disc" aria-hidden="true" /><div className="archive-cover">{avatar ? <img src={avatar} alt="" /> : <span>{name.slice(-1)}</span>}</div></div>
    <div className="archive-heading-copy">{theme === 'vinyl' && <small>SIDE A · CHARACTER ARCHIVE</small>}<strong className="archive-name">{name}</strong>{theme === 'pudding' && <small>{user ? '把迟到的回信，悄悄放进你的甜里。' : '把今天的心情，烤成一块软乎乎的布丁。'}</small>}{theme === 'mobile' && <small>{user ? '我的消息' : '角色来信'}</small>}{theme === 'mistnote' && <><small>{user ? '循光而来' : '雾色来信'}</small><p>{user ? '纸页翻向你，回声停在右岸。' : '长夜很轻，话落成一封未寄出的信。'}</p></>}{theme === 'letter' && <><small>{user ? '@answer_before_dawn' : '@letters_at_midnight'}</small><p>{user ? '循着纸页的微光而来，把回信交给你。' : '把未寄出的黄昏折进信里，等你醒来。'}</p><div className="letter-stats" aria-hidden="true"><span><b>1314</b> Following</span><span><b>5.20k</b> Letters</span></div></>}{theme === 'vinyl' && <><em>Spinning softly, frame by frame.</em><div className="archive-track" aria-hidden="true"><i /><span>33⅓</span></div></>}</div>
    {theme === 'academy' && <span className="archive-grade" aria-hidden="true">{user ? 'A+' : 'B−'}</span>}
    {theme === 'vinyl' && <div className="archive-caption" aria-hidden="true">ANALOG PHONOGRAPH & CINEMA ARCHIVE</div>}
    {theme === 'pudding' && <div className="pudding-caption" aria-hidden="true">POMPOMPURIN · SWEET LITTLE MESSAGE ♡</div>}
  </div>
}
