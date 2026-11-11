/**
 * 一起听歌（v186，移植自伯恩）。
 * - 「＋」更多 → 听歌：打开歌单面板，从「文件」导入 mp3（可连同同名 .lrc），没歌词自动去 lrclib 按时长找最接近的版本。
 * - 有歌在放（或放到一半暂停）时右上角出一个小胶囊：当前歌词 + 上一首/播放/下一首；点唱片收起/展开。
 * - 播完自动下一首，按歌单顺序循环。
 * - 正在放的歌、当前几句歌词、歌单同步进 musicStore，发请求时注入【一起听歌】。
 * 不用 backdrop-filter（压在消息区上会卡）。
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchLyricCandidates, isTimed, lyricIndexAt, parseLyrics, shiftLyrics, type LyricLine } from './lyrics'
import { findTrackByTitle, musicDel, musicGet, musicSet, musicTrackId, useMusicStore, type MusicCommand, type MusicTrack } from './musicStore'
import './music.css'

function fmt(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '0:00'
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}
const Prev = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 5.5v13" /><path d="M18 5.8v12.4L8.5 12z" /></svg>
const Next = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 5.5v13" /><path d="M6 5.8v12.4L15.5 12z" /></svg>
const Play = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.8v12.4L18 12z" /></svg>
const Pause = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5v13M15 5.5v13" /></svg>

const offsetKey = (id: string) => `weijing-lyric-offset:${id}`
const getOffset = (id: string) => Number(localStorage.getItem(offsetKey(id)) || 0) || 0

export default function MusicPlayer({ hideFloat = false }: { hideFloat?: boolean } = {}) {
  const { tracks, activeId, mini, sheetOpen, lyrics } = useMusicStore()
  const { setSheetOpen, setMini, addTracks, removeTrack, setActive, setHasLyrics, setNow, setLyrics } = useMusicStore.getState()
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(0)
  const [err, setErr] = useState('')
  const [hint, setHint] = useState('')
  const [offsetView, setOffsetView] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef('')
  const loadedRef = useRef('')
  const fileRef = useRef<HTMLInputElement>(null)
  const importWantRef = useRef<{ title: string; artist: string } | null>(null)
  const lyricFileRef = useRef<HTMLInputElement>(null)
  const lyricForRef = useRef('')
  const triedRef = useRef(new Set<string>())
  const candRef = useRef(new Map<string, { list: string[]; idx: number }>())
  const stateRef = useRef({ tracks, activeId })
  stateRef.current = { tracks, activeId }
  const active = tracks.find((t) => t.id === activeId) ?? tracks[0]

  function ensureAudio(): HTMLAudioElement {
    let a = audioRef.current
    if (a) return a
    a = new Audio()
    const el = a
    let last = 0
    const publish = () => {
      const t = stateRef.current.tracks.find((x) => x.id === loadedRef.current)
      setNow(t ? { name: t.name, playing: !el.paused, pos: el.currentTime, dur: isFinite(el.duration) ? el.duration : 0 } : null)
    }
    el.addEventListener('timeupdate', () => {
      setPos(el.currentTime)
      if (isFinite(el.duration)) setDur(el.duration)
      const n = Date.now()
      if (n - last > 1000) { last = n; publish() }
    })
    el.addEventListener('play', () => { setPlaying(true); publish(); useMusicStore.getState().setAutoplayBlocked('') })
    el.addEventListener('pause', () => { setPlaying(false); publish() })
    el.addEventListener('ended', () => { void step(1, true) })
    el.addEventListener('error', () => { if (el.src) setErr('这首歌读不出来，可能格式不支持') })
    audioRef.current = el
    return el
  }

  function waitDuration(): Promise<number> {
    const a = audioRef.current
    if (!a) return Promise.resolve(0)
    if (isFinite(a.duration) && a.duration > 0) return Promise.resolve(a.duration)
    return new Promise((resolve) => {
      const done = () => { a.removeEventListener('loadedmetadata', done); resolve(isFinite(a.duration) ? a.duration : 0) }
      a.addEventListener('loadedmetadata', done)
      setTimeout(done, 4000)
    })
  }

  async function loadLyrics(id: string) {
    const raw = await musicGet<string>(`lyric:${id}`).catch(() => null)
    setLyrics(raw ? shiftLyrics(parseLyrics(raw), getOffset(id)) : [])
    setOffsetView(getOffset(id))
    setHint('')
    if (!raw) void autoLyrics(id)
  }

  async function autoLyrics(id: string) {
    if (triedRef.current.has(id)) return
    triedRef.current.add(id)
    const t = stateRef.current.tracks.find((x) => x.id === id)
    if (!t) return
    setHint('正在找歌词…')
    try {
      const list = await fetchLyricCandidates(t.name, await waitDuration())
      candRef.current.set(id, { list, idx: 0 })
      const text = list[0] || ''
      if (!text || !parseLyrics(text).length) { if (loadedRef.current === id) setHint('没找到歌词，可以点「+词」自己加'); return }
      await musicSet(`lyric:${id}`, text)
      setHasLyrics(id, true)
      if (loadedRef.current === id) { setLyrics(shiftLyrics(parseLyrics(text), getOffset(id))); setHint('') }
    } catch {
      if (loadedRef.current === id) setHint('歌词没找到（网络不通）')
    }
  }

  async function nextVersion(id: string) {
    const t = stateRef.current.tracks.find((x) => x.id === id)
    if (!t) return
    let c = candRef.current.get(id)
    setHint('正在找别的版本…')
    try {
      if (!c) { c = { list: await fetchLyricCandidates(t.name, await waitDuration()), idx: -1 }; candRef.current.set(id, c) }
      if (!c.list.length) { setHint('网上没找到这首的歌词'); return }
      c.idx = (c.idx + 1) % c.list.length
      await musicSet(`lyric:${id}`, c.list[c.idx])
      setHasLyrics(id, true)
      try { localStorage.removeItem(offsetKey(id)) } catch { /* ignore */ }
      await loadLyrics(id)
      setHint(`第 ${c.idx + 1}/${c.list.length} 版歌词`)
      setTimeout(() => setHint(''), 2500)
    } catch { setHint('网络不通，没找到') }
  }

  function nudge(id: string, delta: number) {
    const next = Math.round((getOffset(id) + delta) * 10) / 10
    try { localStorage.setItem(offsetKey(id), String(next)) } catch { /* ignore */ }
    void loadLyrics(id)
  }

  async function loadTrack(id: string): Promise<HTMLAudioElement | null> {
    const a = ensureAudio()
    if (loadedRef.current === id && a.src) return a
    const blob = await musicGet<Blob>(`music:${id}`).catch(() => null)
    if (!blob) { setErr('这首歌的文件不见了，删掉重新导入一下～'); return null }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = URL.createObjectURL(blob)
    a.src = urlRef.current
    loadedRef.current = id
    setPos(0); setDur(0)
    void loadLyrics(id)
    return a
  }

  async function playTrack(id: string, auto = false) {
    setErr('')
    // v204：自动切歌时 play()（或读文件）3 秒都没落地，也当被拦下，卡片显示「点播放」。
    let settled = false
    const guard = auto ? window.setTimeout(() => { if (!settled) useMusicStore.getState().setAutoplayBlocked(id) }, 3000) : 0
    try {
      const a = await loadTrack(id)
      if (!a) return
      if (stateRef.current.activeId !== id) setActive(id)
      try { await a.play(); useMusicStore.getState().setAutoplayBlocked('') } catch (e) {
        // v202：自动切歌被 iOS 拦下（没有手势）：不报错，剧情卡上显示「点播放」，她点一下就出声。
        if (auto) useMusicStore.getState().setAutoplayBlocked(id)
        else setErr(`播放失败：${(e as Error).message}`)
      }
    } finally {
      settled = true
      if (guard) window.clearTimeout(guard)
    }
  }

  async function toggle() {
    if (!active) { importWantRef.current = null; fileRef.current?.click(); return }
    const a = ensureAudio()
    if (loadedRef.current === active.id && a.src) {
      if (a.paused) void a.play().catch((e) => setErr(`播放失败：${(e as Error).message}`))
      else a.pause()
      return
    }
    await playTrack(active.id)
  }

  async function step(dir: 1 | -1, fromEnded = false) {
    const { tracks: ts, activeId: cur } = stateRef.current
    if (!ts.length) return
    if (fromEnded && ts.length === 1) { const a = ensureAudio(); a.currentTime = 0; void a.play().catch(() => {}); return }
    const i = Math.max(0, ts.findIndex((t) => t.id === (loadedRef.current || cur)))
    await playTrack(ts[(i + dir + ts.length) % ts.length].id)
  }

  async function attachLyrics(id: string, file: File) {
    try {
      const text = await file.text()
      if (!parseLyrics(text).length) { setErr('这个歌词文件是空的'); return }
      await musicSet(`lyric:${id}`, text)
      setHasLyrics(id, true)
      if (loadedRef.current === id) await loadLyrics(id)
    } catch (e) { setErr(`歌词保存失败：${(e as Error).message}`) }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setErr('')
    const all = Array.from(files)
    const base = (n: string) => n.replace(/\.[^.]+$/, '')
    const lrcs = all.filter((f) => /\.(lrc|txt)$/i.test(f.name))
    const metas: MusicTrack[] = []
    try {
      for (const f of all) {
        if (/\.(lrc|txt)$/i.test(f.name) || /^(image|video)\//.test(f.type)) continue
        const id = musicTrackId()
        await musicSet(`music:${id}`, f)
        const lrc = lrcs.find((l) => base(l.name) === base(f.name))
        if (lrc) await musicSet(`lyric:${id}`, await lrc.text())
        metas.push({ id, name: base(f.name), hasLyrics: Boolean(lrc) })
      }
      if (!metas.length && lrcs.length && active) { await attachLyrics(active.id, lrcs[0]); return }
      if (!metas.length) { setErr('没有选到音乐文件'); return }
      addTracks(metas)
      // v202：从剧情卡「点这里导入《X》」来的：导入的歌名对得上就直接放。
      const want = importWantRef.current
      importWantRef.current = null
      const hit = want ? findTrackByTitle(metas, want.title, want.artist) : null
      if (hit) await playTrack(hit.id, true)
    } catch (e) { setErr(`保存失败：${(e as Error).message}`) }
  }

  function del(t: MusicTrack) {
    if (!window.confirm(`删除「${t.name}」？`)) return
    void musicDel(`music:${t.id}`); void musicDel(`lyric:${t.id}`)
    if (loadedRef.current === t.id) {
      const a = ensureAudio(); a.pause(); a.removeAttribute('src'); loadedRef.current = ''
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = '' }
      setPos(0); setDur(0); setNow(null); setLyrics([])
    }
    removeTrack(t.id)
  }

  useEffect(() => () => { audioRef.current?.pause(); if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])

  // v198 剧情美化卡的唱片机：订阅外部指令，在点击的同一调用栈里执行（iOS 才肯出声）。
  const commandRef = useRef<(command: MusicCommand) => void>(() => {})
  commandRef.current = (command) => {
    if (command.kind === 'play') void playTrack(command.id, Boolean(command.auto))
    else if (command.kind === 'toggle') void toggle()
    else void step(command.dir)
  }
  useEffect(() => useMusicStore.subscribe((state, prev) => {
    if (state.command && state.command !== prev.command) commandRef.current(state.command)
    // v202：剧情卡上点「导入《X》」——同一调用栈里点文件框，iOS 才肯弹出选择器。
    if (state.importRequest && state.importRequest !== prev.importRequest) {
      importWantRef.current = { title: state.importRequest.title, artist: state.importRequest.artist }
      fileRef.current?.click()
    }
  }), [])

  const loaded = Boolean(active && loadedRef.current === active.id)
  const timed = isTimed(lyrics)
  const li = loaded ? lyricIndexAt(lyrics, pos) : -1
  const curLine: LyricLine | undefined = timed && li >= 0 ? lyrics[li] : undefined
  const nextLine: LyricLine | undefined = timed ? lyrics[li + 1] : undefined
  // v200：只在换句时写进 store，剧情美化卡的唱片机条据此显示当前这句歌词。
  const publishedLine = timed ? li : -1
  useEffect(() => { useMusicStore.getState().setLyricIndex(publishedLine) }, [publishedLine])
  const inputs = <>
    {/* 不设 accept：iOS 上混入 .lrc 会把 mp3 全部置灰 */}
    <input ref={fileRef} type="file" multiple hidden onChange={(e) => { void onFiles(e.target.files); e.target.value = '' }} />
    <input ref={lyricFileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f && lyricForRef.current) void attachLyrics(lyricForRef.current, f); e.target.value = '' }} />
  </>
  const disc = <span className="wj-music-disc" style={{ animationPlayState: playing ? 'running' : 'paused' }} aria-hidden="true" />

  if (sheetOpen) return createPortal(<div className="wj-music-layer" role="dialog" aria-modal="true" aria-label="一起听歌">
    <button type="button" className="wj-music-backdrop" aria-label="关闭听歌" onClick={() => setSheetOpen(false)} />
    <section className="wj-music-sheet">
      {inputs}
      <div className="wj-music-head"><strong>♪ 一起听歌</strong><button type="button" aria-label="关闭" onClick={() => setSheetOpen(false)}>×</button></div>
      <div className="wj-music-now">
        {disc}
        <div className="wj-music-info">
          <b>{active ? active.name : '还没有歌'}</b>
          <small>{!active ? '导入几首喜欢的歌，他也能陪你听' : hint && loaded ? hint : curLine ? curLine.text : timed && loaded ? nextLine?.text ?? '♪' : loaded && lyrics.length ? '有歌词（纯文本）' : `${fmt(pos)} / ${fmt(dur)}`}</small>
        </div>
      </div>
      {active && <input className="wj-music-seek" type="range" min={0} max={Math.max(1, dur)} step={0.1} value={Math.min(pos, dur || 0)} aria-label="进度" onChange={(e) => { const a = ensureAudio(); if (a.src) a.currentTime = Number(e.target.value) }} />}
      <div className="wj-music-controls">
        <button type="button" aria-label="上一首" disabled={tracks.length < 2} onClick={() => void step(-1)}><Prev /></button>
        <button type="button" className="main" aria-label={playing ? '暂停' : '播放'} onClick={() => void toggle()}>{playing ? <Pause /> : <Play />}</button>
        <button type="button" aria-label="下一首" disabled={tracks.length < 2} onClick={() => void step(1)}><Next /></button>
      </div>
      {active && loaded && <div className="wj-music-lyric-tools">
        {timed && <><button type="button" onClick={() => nudge(active.id, -0.5)}>提前 0.5s</button><span>{offsetView > 0 ? '+' : ''}{offsetView.toFixed(1)}s</span><button type="button" onClick={() => nudge(active.id, 0.5)}>延后 0.5s</button></>}
        <button type="button" className="push" onClick={() => void nextVersion(active.id)}>换一版歌词</button>
      </div>}
      {err && <p className="wj-music-error">{err}</p>}
      <div className="wj-music-list">
        {tracks.map((t) => <div key={t.id} className={t.id === active?.id ? 'current' : ''}>
          <button type="button" className="name" onClick={() => void playTrack(t.id)}>{t.name}</button>
          <button type="button" className="mini" onClick={() => { lyricForRef.current = t.id; lyricFileRef.current?.click() }}>{t.hasLyrics ? '换词' : '+词'}</button>
          <button type="button" className="mini danger" aria-label="删除" onClick={() => del(t)}>×</button>
        </div>)}
        {!tracks.length && <p className="wj-music-empty">歌只存在这台手机里 ♡ 原唱的歌词最准。</p>}
      </div>
      <button type="button" className="wj-music-add" onClick={() => { importWantRef.current = null; fileRef.current?.click() }}>＋ 导入音乐（可连同同名 .lrc 一起选）</button>
    </section>
  </div>, document.body)

  // v200：剧情美化卡开着时聊天页不显示小浮窗（卡上有自己的唱片机）。只是不渲染按钮，
  // 组件和 audio 元素（ensureAudio 里 new Audio()，不在 DOM 里）都还在，歌不会停。
  if (hideFloat || !active || !loaded || (!playing && pos <= 0)) return inputs
  return createPortal(<div className={`wj-music-float${mini ? ' collapsed' : ''}`} role="group" aria-label="音乐小浮窗">
    {inputs}
    <button type="button" className="disc-btn" aria-label={mini ? '展开' : '收起'} onClick={() => setMini(!mini)}>{disc}</button>
    {!mini && <>
      <button type="button" className="text" onClick={() => setSheetOpen(true)}>{curLine?.text || active.name}</button>
      <button type="button" aria-label="上一首" disabled={tracks.length < 2} onClick={() => void step(-1)}><Prev /></button>
      <button type="button" aria-label={playing ? '暂停' : '播放'} onClick={() => void toggle()}>{playing ? <Pause /> : <Play />}</button>
      <button type="button" aria-label="下一首" disabled={tracks.length < 2} onClick={() => void step(1)}><Next /></button>
    </>}
  </div>, document.body)
}
