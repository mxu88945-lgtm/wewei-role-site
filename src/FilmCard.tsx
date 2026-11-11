/**
 * v198 剧情美化卡：奶白纸底 + 深红/棕点缀（暖茶笺调性），不用 iframe、不用 backdrop-filter。
 * 唱片机条 → 胶片框（角色头像或纸纹占位）+ 表盘 → ARCHIVE 编号与英中两行 → NPC 2x2 档案 → 心声气泡。
 */
import { memo, useState } from 'react'
import type { FilmCardData, FilmDanger } from './filmBlock'
import { findTrackByTitle, useMusicStore } from './musicStore'
import './film-card.css'

function archiveNo(seed: string) {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619)
  return String((hash >>> 0) % 10000).padStart(4, '0')
}

const PlayIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.8v12.4L18 12z" /></svg>
const PauseIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5v13M15 5.5v13" /></svg>
const NextIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 5.5v13" /><path d="M6 5.8v12.4L15.5 12z" /></svg>

function Dial() {
  const ticks = Array.from({ length: 12 }, (_, i) => i * 30)
  return <svg className="film-dial" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="20" r="17" />
    {ticks.map((deg) => <line key={deg} x1="20" y1="5.5" x2="20" y2={deg % 90 === 0 ? 9.5 : 8} transform={`rotate(${deg} 20 20)`} />)}
    <line className="film-dial-needle" x1="20" y1="20" x2="20" y2="9" transform="rotate(38 20 20)" />
    <circle className="film-dial-hub" cx="20" cy="20" r="2" />
  </svg>
}

function DangerMeter({ level }: { level: FilmDanger }) {
  const filled = level === '高' ? 3 : level === '中' ? 2 : level === '低' ? 1 : 0
  return <span className={`film-danger film-danger-${filled}`} aria-label={`危险度 ${level || '未知'}`}>
    {[1, 2, 3].map((n) => <i key={n} className={n <= filled ? 'on' : ''} />)}
    <b>{level || '—'}</b>
  </span>
}

function FilmCard({ card, avatar, speakerName, seed }: { card: FilmCardData; avatar?: string; speakerName: string; seed: string }) {
  const [npcIndex, setNpcIndex] = useState(0)
  const [note, setNote] = useState('')
  const now = useMusicStore((state) => state.now)
  const tracks = useMusicStore((state) => state.tracks)
  const matched = card.song ? findTrackByTitle(tracks, card.song.title, card.song.artist) : null
  // 匹配不到时唱片机放的就是你当前的歌，所以那时也算「在放」。
  const playingHere = Boolean(now?.playing && (!matched || now.name === matched.name))
  const npc = card.npcs[Math.min(npcIndex, card.npcs.length - 1)]
  const no = archiveNo(seed)

  const play = () => {
    const state = useMusicStore.getState()
    if (!state.tracks.length) { state.setSheetOpen(true); return }
    const match = card.song ? findTrackByTitle(state.tracks, card.song.title, card.song.artist) : null
    if (match) {
      setNote('')
      if (state.now?.name === match.name) state.requestToggle()
      else state.requestPlay(match.id)
      return
    }
    // 没匹配到：放你正在听的（或歌单第一首）。
    setNote(card.song && !state.now?.playing ? `歌单里没有《${card.song.title}》，先放你歌单里的` : '')
    state.requestToggle()
  }
  const next = () => {
    const state = useMusicStore.getState()
    if (!state.tracks.length) { state.setSheetOpen(true); return }
    setNote('')
    state.requestStep(1)
  }

  const songTitle = card.song?.title || (now?.name ? now.name : '一起听歌')
  const songArtist = card.song ? card.song.artist : now?.name ? '你的歌单' : '点播放导入歌'

  return <section className="film-card" aria-label="剧情美化卡">
    <div className="film-gramo">
      <span className={`film-gramo-disc${playingHere ? ' spinning' : ''}`} aria-hidden="true" />
      <div className="film-gramo-text">
        <small>GRAMOPHONE · SIDE A</small>
        <strong>{songTitle}</strong>
        {songArtist && <em>{songArtist}</em>}
      </div>
      <div className="film-gramo-actions">
        <button type="button" aria-label={playingHere ? '暂停' : '播放'} onClick={play}>{playingHere ? <PauseIcon /> : <PlayIcon />}</button>
        <button type="button" aria-label="下一首" onClick={next}><NextIcon /></button>
      </div>
    </div>
    {note && <div className="film-gramo-note" role="status">{note}</div>}

    <div className="film-strip">
      <div className={`film-frame${avatar ? '' : ' film-frame-empty'}`}>
        {avatar ? <img src={avatar} alt="" loading="lazy" decoding="async" /> : <span>SCENE</span>}
        {card.sceneTitle && <span className="film-frame-title">{card.sceneTitle}</span>}
      </div>
      <Dial />
    </div>

    <div className="film-caption">
      <div className="film-archive"><span>ARCHIVE · No.{no}</span>{card.sceneTitle && <span>{speakerName}</span>}</div>
      {card.sceneDesc && <p className="film-scene-desc">{card.sceneDesc}</p>}
      {card.en && <p className="film-en">{card.en}</p>}
      {card.zh && <p className="film-zh">{card.zh}</p>}
    </div>

    {npc && <div className="film-npc">
      <div className="film-npc-grid" role="tablist" aria-label="人物档案">
        {card.npcs.map((item, index) => <button key={`${item.name}-${index}`} type="button" role="tab" aria-selected={item === npc} className={item === npc ? 'active' : ''} onClick={() => setNpcIndex(index)}>
          <small>NPC {String(index + 1).padStart(2, '0')}</small>
          <span>{item.name}{item.role ? `·${item.role}` : ''}</span>
        </button>)}
      </div>
      <div className="film-npc-detail" role="tabpanel">
        <div className="film-npc-head"><small>FILE {String(Math.min(npcIndex, card.npcs.length - 1) + 1).padStart(2, '0')}</small><strong>{npc.name}</strong>{npc.role && <span>{npc.role}</span>}</div>
        <dl>
          <div><dt>STANCE</dt><dd>{npc.stance || '—'}</dd></div>
          <div><dt>DANGER</dt><dd><DangerMeter level={npc.danger} /></dd></div>
        </dl>
        {npc.desc && <p>{npc.desc}</p>}
      </div>
    </div>}

    {card.heart && <div className="film-heart">
      <small>UNSAID · 心声</small>
      <p>{card.heart}</p>
    </div>}
  </section>
}

export default memo(FilmCard)
