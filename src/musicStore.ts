/**
 * 一起听歌（v186，移植自伯恩）：歌单元数据存 localStorage，音频/歌词本体存 IndexedDB（只在本机）。
 * now / lyrics 不持久化，给发请求时注入【一起听歌】用。
 */
import { create } from 'zustand'
import type { LyricLine, NowPlaying } from './lyrics'

export interface MusicTrack { id: string; name: string; hasLyrics?: boolean }

const KEY = 'weijing-music-v1'
interface Persisted { tracks: MusicTrack[]; activeId: string; mini: boolean }
function read(): Persisted {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Persisted>
    return { tracks: Array.isArray(raw.tracks) ? raw.tracks : [], activeId: raw.activeId || '', mini: Boolean(raw.mini) }
  } catch { return { tracks: [], activeId: '', mini: false } }
}

interface MusicState extends Persisted {
  sheetOpen: boolean
  setSheetOpen: (open: boolean) => void
  setMini: (on: boolean) => void
  addTracks: (list: MusicTrack[]) => void
  removeTrack: (id: string) => void
  /** v217 歌单「管理」批量删：一次写盘；当前曲目被删就落到剩下的第一首 */
  removeTracks: (ids: string[]) => void
  /** v217：管理里只选一首时可以改名 */
  renameTrack: (id: string, name: string) => void
  setActive: (id: string) => void
  setHasLyrics: (id: string, on: boolean) => void
  now: NowPlaying | null
  setNow: (n: NowPlaying | null) => void
  lyrics: LyricLine[]
  setLyrics: (l: LyricLine[]) => void
  /** v200：当前唱到第几句（带时间轴的歌词；没有为 -1）。只在换句时更新，给剧情美化卡显示歌词用。 */
  lyricIndex: number
  setLyricIndex: (i: number) => void
  /** v198 剧情美化卡的唱片机：外部发播放指令，由 MusicPlayer 执行（音频元素只在那里）。 */
  command: MusicCommand | null
  /** auto：不是她亲手点的（新剧情卡自动切歌 / 导入后自动放），iOS 可能拒绝出声。 */
  requestPlay: (id: string, auto?: boolean) => void
  requestToggle: () => void
  requestStep: (dir: 1 | -1) => void
  /** v202：自动播放被浏览器拦下的那首（卡片上显示「点播放」）；没有为空串。 */
  autoplayBlockedId: string
  setAutoplayBlocked: (id: string) => void
  /** v202：剧情卡上「点这里导入《X》」：让 MusicPlayer 打开文件选择，导入后歌名对得上就直接放。 */
  importRequest: { title: string; artist: string; nonce: number } | null
  requestImport: (title: string, artist?: string) => void
}

export type MusicCommand = { kind: 'play'; id: string; auto?: boolean; nonce: number } | { kind: 'toggle'; nonce: number } | { kind: 'step'; dir: 1 | -1; nonce: number }
let commandNonce = 0

export const useMusicStore = create<MusicState>((set, get) => {
  const persist = (patch: Partial<Persisted>) => {
    const next = { ...get(), ...patch }
    try { localStorage.setItem(KEY, JSON.stringify({ tracks: next.tracks, activeId: next.activeId, mini: next.mini })) } catch { /* 空间满也不影响播放 */ }
    set(patch)
  }
  return {
    ...read(),
    sheetOpen: false,
    setSheetOpen: (open) => set({ sheetOpen: open }),
    setMini: (on) => persist({ mini: on }),
    addTracks: (list) => persist({ tracks: [...get().tracks, ...list], activeId: get().activeId || list[0]?.id || '' }),
    removeTrack: (id) => get().removeTracks([id]),
    removeTracks: (ids) => {
      const drop = new Set(ids)
      if (!drop.size) return
      const tracks = get().tracks.filter((t) => !drop.has(t.id))
      const activeId = drop.has(get().activeId) ? tracks[0]?.id ?? '' : get().activeId
      const blocked = drop.has(get().autoplayBlockedId) ? '' : get().autoplayBlockedId
      persist({ tracks, activeId })
      if (blocked !== get().autoplayBlockedId) set({ autoplayBlockedId: blocked })
    },
    renameTrack: (id, name) => { const n = name.trim(); if (n) persist({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, name: n } : t)) }) },
    setActive: (id) => persist({ activeId: id }),
    setHasLyrics: (id, on) => persist({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, hasLyrics: on } : t)) }),
    now: null,
    setNow: (n) => set({ now: n }),
    lyrics: [],
    setLyrics: (l) => set({ lyrics: l, lyricIndex: -1 }),
    lyricIndex: -1,
    setLyricIndex: (i) => { if (get().lyricIndex !== i) set({ lyricIndex: i }) },
    command: null,
    requestPlay: (id, auto = false) => set({ command: { kind: 'play', id, ...(auto ? { auto: true } : {}), nonce: ++commandNonce } }),
    requestToggle: () => set({ command: { kind: 'toggle', nonce: ++commandNonce } }),
    requestStep: (dir) => set({ command: { kind: 'step', dir, nonce: ++commandNonce } }),
    autoplayBlockedId: '',
    setAutoplayBlocked: (id) => { if (get().autoplayBlockedId !== id) set({ autoplayBlockedId: id }) },
    importRequest: null,
    requestImport: (title, artist = '') => set({ importRequest: { title, artist, nonce: ++commandNonce } }),
  }
})

export function musicTrackId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `mu-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// v202：常见繁体 → 简体（歌名里常见的字，够用就行，不引整套字库）。
const T2S: Record<string, string> = Object.fromEntries(Array.from(
  '戀恋兒儿團团愛爱聽听個个們们這这說说時时間间來来過过還还對对開开關关邊边裡里裏里後后會会經经與与為为無无見见樣样給给讓让誰谁發发夢梦憶忆淚泪憂忧傷伤歲岁風风雲云電电飛飞鳥鸟馬马魚鱼龍龙鳳凤華华國国東东門门長长遠远邊边紅红藍蓝綠绿黃黄靜静聲声樂乐歡欢戲戏劇剧話话語语詞词譜谱調调錯错對对壞坏憐怜難难離离鍾钟鐘钟記记憶忆漢汉場场燈灯塵尘輕轻舊旧親亲顏颜誓誓溫温濃浓淺浅緣缘終终結结斷断線线紙纸書书畫画筆笔煙烟織织輪轮轉转燒烧點点愛爱單单雙双萬万億亿實实壓压獨独憑凭歸归種种隨随悵怅懷怀從从幾几廣广陽阳陰阴雖虽戰战嗎吗嘆叹飄飘蕩荡漫漫謝谢塊块殘残擁拥擊击態态雪雪寫写滿满飯饭貓猫'
).reduce<Array<[string, string]>>((out, ch, i, all) => (i % 2 === 0 ? [...out, [ch, all[i + 1]]] : out), []))

const AUDIO_EXT = /\.(?:mp3|m4a|aac|flac|wav|ogg|oga|opus|wma|ape|alac|aiff?|caf|mp4|webm)$/i
const BRACKETS = /\([^()]*\)|（[^（）]*）|\[[^[\]]*\]|【[^【】]*】|《[^《》]*》|「[^「」]*」|『[^『』]*』|〔[^〔〕]*〕/g
const VERSION_SUFFIX = /(?:live|伴奏|纯音乐|remix|remaster(?:ed)?|instrumental|karaoke|inst|cover|demo|ver(?:sion)?|现场|现场版|完整版|女声版|男声版|dj版|dj|铃声版|高音质|无损|hq|sq)+$/

function toSimplified(value: string) {
  return Array.from(value).map((ch) => T2S[ch] || ch).join('')
}

/** 只留字母、数字和汉字，全角转半角，繁转简，小写，去掉 live/伴奏/remix 这类尾巴。 */
function squashTitle(value: string) {
  let out = toSimplified(value.normalize('NFKC').toLowerCase()).replace(/[^\p{L}\p{N}]+/gu, '')
  for (let i = 0; i < 3; i += 1) { const next = out.replace(VERSION_SUFFIX, ''); if (next === out || !next) break; out = next }
  return out
}

/**
 * v202：一个歌名的几种比较用写法：[整串, 第一段, 其余各段]。
 * 去扩展名；《》里写的是歌名本身，先拆掉书名号保留内容；其余括号连内容一起去掉（(Live)、[伴奏]、（翻唱）…）；
 * 按「 - 」「-」「–」「—」拆出歌手段。
 */
export function songTitleKeys(raw: string): { whole: string; parts: string[] } {
  let text = (raw || '').normalize('NFKC').trim().replace(AUDIO_EXT, '')
  text = text.replace(/[《「『]([^《》「」『』]{1,60})[》」』]/g, ' $1 ')
  text = text.replace(BRACKETS, ' ')
  const parts = text.split(/\s+-+\s+|\s*[–—]+\s*|(?<=[\p{Script=Han}\p{L}\p{N}.)])-(?=[\p{Script=Han}\p{L}\p{N}])|\s*[/／|｜_]\s*/u).map(squashTitle).filter(Boolean)
  // 去掉开头的曲目编号段（"07 夜曲" → "07夜曲" 里的数字前缀）。
  const clean = parts.map((part) => part.replace(/^\d{1,3}(?=\D)/, '')).filter(Boolean)
  return { whole: squashTitle(text).replace(/^\d{1,3}(?=\D)/, ''), parts: clean }
}

/** v202：短的一方至少 2 个字，且占长的一方至少 minShare（防止只靠歌手名那一小截就算匹配）。 */
function contains(long: string, short: string, minShare: number) {
  return short.length >= 2 && long.includes(short) && short.length >= Math.ceil(long.length * minShare)
}

/**
 * 按歌名模糊匹配导入的歌（v202 重写）：两边都先规范化（去扩展名、括号、歌手段、标点、全角、版本尾巴，繁转简），
 * 卡里的歌名（整串和第一段=歌名）与歌单里每首的整串和各段比，相同 > 歌单包含歌名 > 歌名包含歌单段；
 * 卡里写了歌手且歌单那首也带这个歌手时加分。匹配不到返回 null。
 */
export function findTrackByTitle<T extends { id: string; name: string; title?: string; artist?: string }>(tracks: T[], title: string, artist = ''): T | null {
  const wantKeys = songTitleKeys(title)
  // 「千年之恋F.I.R.」这类歌名和歌手粘在一起的：按汉字/字母交界再切一刀，取第一截当歌名。
  const head = (wantKeys.parts[0] || '').match(/^(?:\p{Script=Han}+|[^\p{Script=Han}]+)/u)?.[0] || ''
  const wants = Array.from(new Set([wantKeys.parts[0], wantKeys.whole, head.length >= 2 ? head : ''].filter((key): key is string => Boolean(key && key.length >= 1))))
  if (!wants.length || !tracks.length) return null
  const wantArtist = squashTitle(artist)
  let best: { track: T; score: number } | null = null
  for (const track of tracks) {
    const fields = [track.title, track.name, track.artist && track.title ? `${track.title} - ${track.artist}` : ''].filter((value): value is string => Boolean(value))
    const keys = new Set<string>()
    let haystack = ''
    for (const field of fields) {
      const k = songTitleKeys(field)
      if (k.whole) keys.add(k.whole)
      k.parts.forEach((part) => keys.add(part))
      haystack += k.whole
    }
    if (track.artist) haystack += squashTitle(track.artist)
    let score = 0
    for (const want of wants) {
      for (const key of keys) {
        let s = 0
        if (key === want) s = 100
        else if (contains(key, want, want.length >= 3 ? 0 : 0.4)) s = 80
        else if (contains(want, key, 0.6)) s = 60
        if (s) s += Math.min(want.length, key.length)
        if (s > score) score = s
      }
    }
    if (!score) {
      // 兜底：字符重合度很高（错一两个字、少个字）。
      const want = wants[0]
      for (const key of keys) {
        const chars = new Set(Array.from(key))
        const hit = Array.from(want).filter((ch) => chars.has(ch)).length
        const ratio = hit / Math.max(want.length, 1)
        if (want.length >= 3 && ratio >= 0.75 && Math.abs(key.length - want.length) <= 2) score = Math.max(score, Math.round(40 * ratio))
      }
    }
    if (score && wantArtist && wantArtist.length >= 2 && haystack.includes(wantArtist)) score += 10
    if (score && (!best || score > best.score)) best = { track, score }
  }
  return best?.track ?? null
}

/** 发请求时用：没在放就返回空串 */
export function currentMusicNote(build: (now: NowPlaying | null, lines: LyricLine[], playlist: string[]) => string): string {
  const s = useMusicStore.getState()
  return build(s.now, s.lyrics, s.tracks.map((t) => t.name)).trim()
}

// ---- IndexedDB（独立库，不碰惟境主存档）----
const DB = 'weijing-music'
let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv') }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { dbp = null; reject(req.error) }
  })
  return dbp
}
export async function musicGet<T>(key: string): Promise<T | null> {
  const d = await db()
  return new Promise((resolve, reject) => { const r = d.transaction('kv', 'readonly').objectStore('kv').get(key); r.onsuccess = () => resolve((r.result ?? null) as T | null); r.onerror = () => reject(r.error) })
}
export async function musicSet(key: string, val: unknown): Promise<void> {
  const d = await db()
  return new Promise((resolve, reject) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('写入被中止（空间可能不够）')) })
}
export async function musicDel(key: string): Promise<void> {
  const d = await db()
  return new Promise((resolve) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(key); tx.oncomplete = () => resolve(); tx.onerror = () => resolve() })
}
