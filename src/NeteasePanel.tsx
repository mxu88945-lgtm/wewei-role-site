/**
 * v324 听歌面板里的「网易云」页：连接音乐服务、扫码登录、搜歌、读她网易云的歌单。
 * 点歌名 = 加进歌单并播放；＋ = 只加进歌单；歌单页可「全部加入」。
 */
import { useEffect, useRef, useState } from 'react'
import {
  autofillNeteaseConfig, neteaseHealth, neteaseLogout, neteasePlaylists, neteasePlaylistSongs, neteaseQr, neteaseQrCheck, neteaseReady,
  neteaseSearch, readNeteaseConfig, saveNeteaseConfig, type NeteasePlaylist, type NeteaseSong,
} from './neteaseMusic'

type Props = {
  onPlay: (song: NeteaseSong, rest: NeteaseSong[]) => void
  onAdd: (songs: NeteaseSong[]) => void
}

export default function NeteasePanel({ onPlay, onAdd }: Props) {
  const [config, setConfig] = useState(readNeteaseConfig)
  const [editing, setEditing] = useState(!neteaseReady(readNeteaseConfig()))
  const [status, setStatus] = useState<{ ok: boolean; loggedIn: boolean; nickname: string } | null>(null)
  const [msg, setMsg] = useState('')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<NeteaseSong[]>([])
  const [lists, setLists] = useState<NeteasePlaylist[] | null>(null)
  const [open, setOpen] = useState<{ pl: NeteasePlaylist; songs: NeteaseSong[] } | null>(null)
  const [qr, setQr] = useState<{ key: string; svg: string } | null>(null)
  const pollRef = useRef(0)

  async function check(c = config) {
    setMsg('')
    try {
      const h = await neteaseHealth(c)
      setStatus(h)
      setEditing(false)
      if (h.loggedIn && !lists) void loadLists()
    } catch (e) { setStatus(null); setMsg((e as Error).message || '连不上音乐服务') }
  }
  useEffect(() => { if (neteaseReady(config)) void check() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearInterval(pollRef.current), [])

  function save(c = config) { saveNeteaseConfig(c); const next = readNeteaseConfig(); setConfig(next); void check(next) }
  function autofill() {
    const c = autofillNeteaseConfig()
    if (!c) { setMsg('设置里还没填「工具密钥」，手动填 token 也行'); return }
    setConfig(c); void check(c)
  }

  async function loadLists() {
    try { const d = await neteasePlaylists(); setLists(d.playlists || []); if (d.error) setMsg(d.error) } catch (e) { setMsg((e as Error).message) }
  }
  async function openList(pl: NeteasePlaylist) {
    setBusy(true); setMsg('')
    try { setOpen({ pl, songs: await neteasePlaylistSongs(pl.id) }) } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }
  async function search(e?: React.FormEvent) {
    e?.preventDefault()
    if (!q.trim()) return
    setBusy(true); setMsg('')
    try { const songs = await neteaseSearch(q.trim()); setResults(songs); if (!songs.length) setMsg('没搜到') } catch (err) { setMsg((err as Error).message) } finally { setBusy(false) }
  }
  async function startQr() {
    setMsg('')
    try {
      const d = await neteaseQr()
      setQr({ key: d.key, svg: d.svg })
      window.clearInterval(pollRef.current)
      pollRef.current = window.setInterval(async () => {
        try {
          const r = await neteaseQrCheck(d.key)
          if (r.code === 803) { window.clearInterval(pollRef.current); setQr(null); setMsg(r.message || '登录成功'); void check() }
          else if (r.code === 800) { window.clearInterval(pollRef.current); setQr(null); setMsg('二维码过期了，再点一次') }
        } catch { /* 下一轮再试 */ }
      }, 2500)
    } catch (e) { setMsg((e as Error).message) }
  }
  async function logout() {
    if (!window.confirm('退出网易云？退出后只能放免费歌。')) return
    try { await neteaseLogout(); setLists(null); setOpen(null); void check() } catch (e) { setMsg((e as Error).message) }
  }

  const row = (song: NeteaseSong, list: NeteaseSong[], i: number) => <div key={song.songId + ':' + i}>
    <button type="button" className="name" onClick={() => onPlay(song, list.slice(i + 1))}>{song.name}<small> · {song.artist}</small></button>
    <button type="button" className="mini" aria-label="加入歌单" onClick={() => { onAdd([song]); setMsg(`已加入：${song.name}`) }}>＋</button>
  </div>

  if (editing) return <div className="wj-ne">
    <p className="wj-ne-note">连上你自己的音乐服务就能搜网易云、读你的歌单。地址和 token 只存这台手机。</p>
    <label>服务地址<input value={config.url} onChange={(e) => setConfig({ ...config, url: e.target.value })} autoCapitalize="none" autoCorrect="off" /></label>
    <label>访问 token<input type="password" value={config.token} onChange={(e) => setConfig({ ...config, token: e.target.value })} placeholder="跟「工具密钥」是同一把" autoComplete="off" /></label>
    <div className="wj-ne-actions"><button type="button" className="strong" onClick={() => save()}>连接并保存</button><button type="button" onClick={autofill}>一键填好（用工具密钥）</button></div>
    {msg && <p className="wj-music-error">{msg}</p>}
  </div>

  return <div className="wj-ne">
    <div className="wj-ne-status">
      <span>{!status ? '连接中…' : status.loggedIn ? `网易云：${status.nickname}` : '网易云：未登录（只能放免费歌）'}</span>
      {status && !status.loggedIn && <button type="button" className="strong" onClick={() => void startQr()}>扫码登录</button>}
      {status?.loggedIn && <button type="button" onClick={() => void logout()}>退出</button>}
      <button type="button" onClick={() => setEditing(true)}>设置</button>
    </div>
    {qr && <div className="wj-ne-qr">
      <div className="img" dangerouslySetInnerHTML={{ __html: qr.svg }} />
      <small>截图这张码 → 网易云音乐 App 左上角菜单「扫一扫」→ 右上角「相册」选这张截图 → 确认登录。</small>
    </div>}
    {msg && <p className="wj-music-error">{msg}</p>}
    {open ? <>
      <div className="wj-music-list-head">
        <button type="button" onClick={() => setOpen(null)}>← 歌单</button>
        <span>{open.pl.name} · {open.songs.length} 首</span>
        {open.songs.length > 0 && <button type="button" className="push strong" onClick={() => { onAdd(open.songs); setMsg(`已加入 ${open.songs.length} 首`) }}>全部加入</button>}
      </div>
      <div className="wj-music-list">{open.songs.map((s, i) => row(s, open.songs, i))}</div>
    </> : <>
      <form className="wj-ne-search" onSubmit={(e) => void search(e)}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜歌名或歌手" enterKeyHint="search" />
        <button type="submit" disabled={busy}>{busy ? '…' : '搜索'}</button>
      </form>
      {results.length > 0 && <>
        <div className="wj-music-list-head"><span>搜索结果</span><button type="button" className="push" onClick={() => setResults([])}>收起</button></div>
        <div className="wj-music-list">{results.map((s, i) => row(s, results, i))}</div>
      </>}
      {!results.length && status?.loggedIn && <>
        <div className="wj-music-list-head"><span>我的网易云歌单</span><button type="button" className="push" onClick={() => void loadLists()}>刷新</button></div>
        <div className="wj-music-list">
          {(lists || []).map((pl) => <div key={pl.id}><button type="button" className="name" disabled={busy} onClick={() => void openList(pl)}>{pl.liked ? '♥ ' : ''}{pl.name}<small> · {pl.count} 首{pl.mine ? '' : ' · 收藏'}</small></button></div>)}
          {lists && !lists.length && <p className="wj-music-empty">还没有歌单</p>}
        </div>
      </>}
    </>}
  </div>
}
