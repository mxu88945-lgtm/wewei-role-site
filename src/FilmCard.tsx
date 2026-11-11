/**
 * v198 剧情美化卡：奶白纸底 + 深红/棕点缀（暖茶笺调性），不用 iframe、不用 backdrop-filter。
 * 唱片机条 → 胶片框（角色头像或纸纹占位）+ 表盘 → ARCHIVE 编号与英中两行 → NPC 2x2 档案 → 心声气泡。
 */
import { memo, useEffect, useReducer, useState } from 'react'
import { filmGramoText, filmPlayNudge, type FilmCardData, type FilmDanger } from './filmBlock'
import { FilmFrame } from './FilmGallery'
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

/** v204：哪些卡里点的歌「已经放过 / 她点过播放」，之后不再催「点播放」（跨重新挂载保留）。 */
const settledCards = new Set<string>()
/** 最新卡出现后等自动切歌多久再提示「点播放」（毫秒）。 */
const NUDGE_DELAY_MS = 3500

function FilmCard({ card, avatar, speakerName, seed, characterId, cardKey, isLatest = false }: { card: FilmCardData; avatar?: string; speakerName: string; seed: string; characterId?: string; cardKey?: string; isLatest?: boolean }) {
  const [npcIndex, setNpcIndex] = useState(0)
  // 只订阅基本类型：now 每秒换一个新对象，订阅整个对象会让每张卡每秒重渲染。
  const nowName = useMusicStore((state) => state.now?.name ?? '')
  const nowPlaying = useMusicStore((state) => Boolean(state.now?.playing))
  const lyricLine = useMusicStore((state) => state.lyricIndex >= 0 ? state.lyrics[state.lyricIndex]?.text ?? '' : '')
  const tracks = useMusicStore((state) => state.tracks)
  const blockedId = useMusicStore((state) => state.autoplayBlockedId)
  const matched = card.song ? findTrackByTitle(tracks, card.song.title, card.song.artist) : null
  // v200：放的不是卡里的歌时显示真正在放的歌名和歌词，卡里的歌名退成小灰字。
  const gramo = filmGramoText({ song: card.song, matchedName: matched?.name, nowName, nowPlaying, lyricLine, speakerName })
  const playingHere = gramo.playingHere
  const npc = card.npcs[Math.min(npcIndex, card.npcs.length - 1)]
  const no = archiveNo(seed)
  // v202：卡里点的歌不在歌单 → 那行小灰字可以点，直接打开导入；自动切歌被 iOS 拦下 → 显示「点播放」。
  const missing = Boolean(card.song?.title && !matched)
  // v204：最新一条的卡，点的歌匹配到了却没在放（自动切歌没成功、又没被判成拦下）→ 也显示「点播放」。
  const settleKey = `${cardKey ?? seed}|${card.song?.title ?? ''}`
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const [ripe, setRipe] = useState(false)
  useEffect(() => {
    if (!isLatest) return
    const timer = window.setTimeout(() => setRipe(true), NUDGE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [isLatest, settleKey])
  const settled = settledCards.has(settleKey)
  useEffect(() => {
    if (matched && playingHere && !settledCards.has(settleKey)) { settledCards.add(settleKey); bump() }
  }, [matched, playingHere, settleKey])
  const tapToPlay = filmPlayNudge({ matchedId: matched?.id, playingHere, blockedId, isLatest, settled, ripe })
  const importSong = () => { if (card.song) useMusicStore.getState().requestImport(card.song.title, card.song.artist) }

  const play = () => {
    if (!settledCards.has(settleKey)) { settledCards.add(settleKey); bump() }
    const state = useMusicStore.getState()
    if (!state.tracks.length) { state.setSheetOpen(true); return }
    const match = card.song ? findTrackByTitle(state.tracks, card.song.title, card.song.artist) : null
    if (match) {
      if (state.now?.name === match.name) state.requestToggle()
      else state.requestPlay(match.id)
      return
    }
    // 没匹配到：放你正在听的（或歌单第一首）。
    state.requestToggle()
  }
  const next = () => {
    const state = useMusicStore.getState()
    if (!state.tracks.length) { state.setSheetOpen(true); return }
    state.requestStep(1)
  }

  return <section className="film-card" aria-label="剧情美化卡">
    <div className="film-gramo">
      <span className={`film-gramo-disc${playingHere ? ' spinning' : ''}`} aria-hidden="true" />
      <div className="film-gramo-text">
        <small>GRAMOPHONE · SIDE A</small>
        <strong>{gramo.title}</strong>
        {gramo.sub && <em className={gramo.sub === lyricLine && lyricLine ? 'film-gramo-lyric' : undefined}>{gramo.sub}</em>}
        {missing
          ? <button type="button" className="film-gramo-requested film-gramo-import" onClick={importSong}>{gramo.requested ? `${gramo.requested} · ` : ''}<b>点这里导入《{card.song!.title}》</b></button>
          : tapToPlay ? <small className="film-gramo-requested film-gramo-tap">点播放 ▶ 听《{card.song!.title}》</small>
          : gramo.requested && <small className="film-gramo-requested">{gramo.requested}</small>}
      </div>
      <div className="film-gramo-actions">
        <button type="button" className={tapToPlay ? 'film-gramo-nudge' : undefined} aria-label={playingHere ? '暂停' : '播放'} onClick={play}>{playingHere ? <PauseIcon /> : <PlayIcon />}</button>
        <button type="button" aria-label="下一首" onClick={next}><NextIcon /></button>
      </div>
    </div>

    <div className="film-strip">
      <FilmFrame characterId={characterId} characterName={speakerName} avatar={avatar} sceneTitle={card.sceneTitle} />
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
