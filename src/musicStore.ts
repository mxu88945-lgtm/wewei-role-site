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
  setActive: (id: string) => void
  setHasLyrics: (id: string, on: boolean) => void
  now: NowPlaying | null
  setNow: (n: NowPlaying | null) => void
  lyrics: LyricLine[]
  setLyrics: (l: LyricLine[]) => void
}

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
    removeTrack: (id) => {
      const tracks = get().tracks.filter((t) => t.id !== id)
      persist({ tracks, activeId: get().activeId === id ? tracks[0]?.id ?? '' : get().activeId })
    },
    setActive: (id) => persist({ activeId: id }),
    setHasLyrics: (id, on) => persist({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, hasLyrics: on } : t)) }),
    now: null,
    setNow: (n) => set({ now: n }),
    lyrics: [],
    setLyrics: (l) => set({ lyrics: l }),
  }
})

export function musicTrackId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `mu-${Date.now()}-${Math.random().toString(36).slice(2)}`
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
