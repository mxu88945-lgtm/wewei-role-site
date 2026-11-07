/**
 * 歌词：支持 LRC（[mm:ss.xx]歌词）和纯文本（没有时间轴）。
 * 一起听歌：把「正在放哪首、放到哪、当前这几句歌词」告诉模型。
 */

export interface LyricLine {
  /** 秒；纯文本歌词为 -1 */
  t: number
  text: string
}

const TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

export function parseLyrics(raw: string): LyricLine[] {
  const out: LyricLine[] = []
  let timed = false
  for (const line of raw.replace(/\r/g, '').split('\n')) {
    TAG.lastIndex = 0
    const stamps: number[] = []
    let m: RegExpExecArray | null
    let last = 0
    while ((m = TAG.exec(line))) {
      const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0
      stamps.push(Number(m[1]) * 60 + Number(m[2]) + frac)
      last = TAG.lastIndex
    }
    if (stamps.length) {
      timed = true
      const text = line.slice(last).trim()
      if (text) for (const t of stamps) out.push({ t, text })
      continue
    }
    // [ti:xx] [ar:xx] 之类的标签行跳过
    if (/^\[[a-z]+:.*\]$/i.test(line.trim())) continue
    const text = line.trim()
    if (text) out.push({ t: -1, text })
  }
  if (timed) return out.filter((l) => l.t >= 0).sort((a, b) => a.t - b.t)
  return out
}

export function isTimed(lines: LyricLine[]): boolean {
  return lines.length > 0 && lines[0].t >= 0
}

/** 当前播到第几句（没到第一句返回 -1） */
export function lyricIndexAt(lines: LyricLine[], pos: number): number {
  if (!isTimed(lines)) return -1
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t <= pos + 0.2) idx = i
    else break
  }
  return idx
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '0:00'
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
}

export interface NowPlaying {
  name: string
  playing: boolean
  pos: number
  dur: number
}

/** 注入 system 的「一起听歌」段；没在播就不注入 */
export function buildMusicNote(now: NowPlaying | null, lines: LyricLine[], playlist: string[] = []): string {
  if (!now || !now.playing || !now.name) return ''
  const parts = [`她正在放歌：《${now.name}》，放到 ${fmt(now.pos)}${now.dur ? ` / ${fmt(now.dur)}` : ''}。你们像是在一起听。`]
  if (lines.length) {
    if (isTimed(lines)) {
      const i = lyricIndexAt(lines, now.pos)
      if (i < 0) parts.push('前奏中，还没唱到歌词。')
      else {
        const from = Math.max(0, i - 2)
        const to = Math.min(lines.length, i + 3)
        const seg = lines.slice(from, to).map((l, k) => (from + k === i ? `▶ ${l.text}` : `  ${l.text}`))
        parts.push('现在唱到（▶ 是这一句）：\n' + seg.join('\n'))
      }
    } else {
      let text = lines.map((l) => l.text).join(' / ')
      if (text.length > 600) text = text.slice(0, 600) + '…'
      parts.push('这首歌的歌词：' + text)
    }
  }
  if (playlist.length) parts.push(`她的歌单（${playlist.length} 首）：${playlist.slice(0, 20).join('、')}${playlist.length > 20 ? '…' : ''}`)
  parts.push('可以自然地聊这首歌、顺着歌词说点什么，别每条都提，别编造没给你的歌词，不要提“系统”“提示”。剧情需要时（比如他跟着哼、借一句歌词说心事、念给她听），可以让角色在台词里直接说出或唱出上面给到的歌词原句，但只用给到的原句，不要自己续写或改编成假歌词，也不要跳出角色。')
  return '\n\n【一起听歌】\n' + parts.join('\n')
}

/** 从文件名猜歌名/歌手：「阿梨粤-我和春天有个约会(女声版)」→ { title:'我和春天有个约会', artist:'阿梨粤' } */
export function guessSongMeta(name: string): { title: string; artist: string } {
  let s = name.replace(/\.[a-z0-9]{2,4}$/i, '').trim()
  let artist = ''
  const m = s.match(/^(.+?)\s*[-–—]\s*(.+)$/)
  if (m) {
    artist = m[1].trim()
    s = m[2]
  }
  const title = s.replace(/[（(【[].*?[）)】\]]/g, '').replace(/[-–—]+$/, '').trim()
  return { title: title || s.trim(), artist }
}

interface LrclibItem { trackName?: string; artistName?: string; duration?: number; syncedLyrics?: string | null; plainLyrics?: string | null; instrumental?: boolean }

/**
 * 候选歌词排序：同名优先 → 带时间轴优先 → 时长和这首歌最接近的优先（翻唱时长不同，时间轴才对得上）。
 * 同一份歌词去重。
 */
export function rankLyrics(items: LrclibItem[], title: string, dur = 0): string[] {
  const norm = (x: string) => x.replace(/\s+/g, '').toLowerCase()
  const t = norm(title)
  const ok = items.filter((i) => !i.instrumental && norm(i.trackName || '').includes(t) && (i.syncedLyrics || i.plainLyrics))
  const score = (i: LrclibItem) => {
    const same = norm(i.trackName || '') === t ? 0 : 1000
    const synced = i.syncedLyrics ? 0 : 500
    const gap = dur > 0 && i.duration ? Math.abs(i.duration - dur) : 100
    return same + synced + gap
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const i of ok.sort((a, b) => score(a) - score(b))) {
    const text = (i.syncedLyrics || i.plainLyrics || '') as string
    if (seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}

/** 兼容旧调用：取排第一的 */
export function pickLyrics(items: LrclibItem[], title: string, dur = 0): string {
  return rankLyrics(items, title, dur)[0] || ''
}

/** 网上找歌词候选（lrclib.net，免费、可跨域），按 rankLyrics 排好；dur 是这首歌实际时长（秒） */
export async function fetchLyricCandidates(name: string, dur = 0, signal?: AbortSignal): Promise<string[]> {
  const { title, artist } = guessSongMeta(name)
  if (!title) return []
  const get = async (q: string) => {
    const r = await fetch(`https://lrclib.net/api/search?${q}`, { signal })
    if (!r.ok) return [] as LrclibItem[]
    return (await r.json()) as LrclibItem[]
  }
  const enc = encodeURIComponent
  const byArtist = artist ? rankLyrics(await get(`track_name=${enc(title)}&artist_name=${enc(artist)}`), title, dur) : []
  const all = rankLyrics(await get(`track_name=${enc(title)}`), title, dur)
  return [...byArtist, ...all.filter((x) => !byArtist.includes(x))]
}

export async function fetchOnlineLyrics(name: string, signal?: AbortSignal, dur = 0): Promise<string> {
  return (await fetchLyricCandidates(name, dur, signal))[0] || ''
}

/** 整体平移时间轴（秒，正数 = 歌词晚一点出现） */
export function shiftLyrics(lines: LyricLine[], offset: number): LyricLine[] {
  if (!offset || !isTimed(lines)) return lines
  return lines.map((l) => ({ ...l, t: Math.max(0, l.t + offset) }))
}
