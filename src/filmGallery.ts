/**
 * v200 剧情美化卡·胶片轮播图：每个角色最多 6 张自己的胶片图。
 * - 图片压到最长边约 1200px 的 JPEG（data URL），存在独立的 IndexedDB 库 weijing-film（按 characterId 一条）。
 * - 只在本机；完整备份时一起导出 / 恢复（weijing.filmGallery）。
 * - 纯函数（列表增删、左右移动、下一张）单独导出，方便测试。
 */
import { create } from 'zustand'

export const MAX_FILM_IMAGES = 6
export const FILM_ROTATE_MS = 4000
export const FILM_BACKUP_KEY = 'weijing.filmGallery'

export interface FilmImage { id: string; src: string }

// ---- 纯函数 ----

/** 追加图片，超出上限的丢掉；返回新列表和被丢掉的张数。 */
export function addFilmImages(list: FilmImage[], incoming: FilmImage[], max = MAX_FILM_IMAGES): { list: FilmImage[]; dropped: number } {
  const room = Math.max(0, max - list.length)
  const accepted = incoming.slice(0, room)
  return { list: [...list, ...accepted], dropped: incoming.length - accepted.length }
}

export function removeFilmImage(list: FilmImage[], id: string): FilmImage[] {
  return list.filter((image) => image.id !== id)
}

/** 左移(-1) / 右移(+1) 一格；到头了就原样返回。 */
export function moveFilmImage(list: FilmImage[], id: string, dir: -1 | 1): FilmImage[] {
  const from = list.findIndex((image) => image.id === id)
  const to = from + dir
  if (from < 0 || to < 0 || to >= list.length) return list
  const next = list.slice()
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

/** 下一张（循环）；没图或只有一张时返回 0。 */
export function nextFilmIndex(current: number, length: number): number {
  if (length <= 1) return 0
  const safe = Number.isFinite(current) && current >= 0 ? current % length : -1
  return (safe + 1) % length
}

/** 列表变短后把下标收回范围内。 */
export function clampFilmIndex(index: number, length: number): number {
  if (length <= 0) return 0
  return Math.min(Math.max(0, Math.floor(index) || 0), length - 1)
}

/** 按最长边缩放后的尺寸（不放大）。 */
export function fitFilmSize(width: number, height: number, maxSide = 1200): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** 备份里读出来的东西做一次清洗：只留 data:image 的条目，每个角色最多 6 张。 */
export function sanitizeFilmGalleries(value: unknown): Record<string, FilmImage[]> {
  const result: Record<string, FilmImage[]> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result
  for (const [characterId, list] of Object.entries(value as Record<string, unknown>)) {
    if (!characterId || !Array.isArray(list)) continue
    const images = list
      .filter((item): item is FilmImage => Boolean(item && typeof item === 'object' && typeof (item as FilmImage).id === 'string' && typeof (item as FilmImage).src === 'string' && (item as FilmImage).src.startsWith('data:image/')))
      .slice(0, MAX_FILM_IMAGES)
      .map((item) => ({ id: item.id, src: item.src }))
    if (images.length) result[characterId] = images
  }
  return result
}

export function filmImageId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `film-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// ---- 压缩 ----

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('这张图读不出来')) }
    img.src = url
  })
}

export async function compressFilmImage(file: Blob, maxSide = 1200, quality = 0.85): Promise<string> {
  const img = await loadImage(file)
  const { width, height } = fitFilmSize(img.naturalWidth || img.width, img.naturalHeight || img.height, maxSide)
  if (!width || !height) throw new Error('这张图读不出来')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('浏览器不支持压缩图片')
  ctx.fillStyle = '#fcf7ee' // 透明 PNG 转 JPEG 时垫纸色，不出黑底
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  const src = canvas.toDataURL('image/jpeg', quality)
  canvas.width = 0; canvas.height = 0
  if (!src.startsWith('data:image/')) throw new Error('图片压缩失败')
  return src
}

// ---- IndexedDB（独立库，不碰惟境主存档）----

const DB = 'weijing-film'
const STORE = 'gallery'
let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('没有 IndexedDB'))
  if (!dbp) dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { dbp = null; reject(req.error) }
  })
  return dbp
}

export async function filmGalleryGet(characterId: string): Promise<FilmImage[]> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(characterId)
    r.onsuccess = () => resolve(Array.isArray(r.result) ? r.result as FilmImage[] : [])
    r.onerror = () => reject(r.error)
  })
}

export async function filmGallerySet(characterId: string, list: FilmImage[]): Promise<void> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    if (list.length) store.put(list, characterId)
    else store.delete(characterId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('写入被中止（空间可能不够）'))
  })
}

/** 备份用：所有角色的胶片图。读不到库时返回空（不让整个备份失败）。 */
export async function exportFilmGalleries(): Promise<Record<string, FilmImage[]>> {
  let d: IDBDatabase
  try { d = await db() } catch { return {} }
  return new Promise((resolve) => {
    const result: Record<string, FilmImage[]> = {}
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) { resolve(sanitizeFilmGalleries(result)); return }
      result[String(cursor.key)] = cursor.value as FilmImage[]
      cursor.continue()
    }
    req.onerror = () => resolve({})
  })
}

/** 恢复备份：备份里有的角色整组覆盖，没有的角色不动。 */
export async function importFilmGalleries(value: unknown): Promise<void> {
  const galleries = sanitizeFilmGalleries(value)
  for (const [characterId, list] of Object.entries(galleries)) await filmGallerySet(characterId, list)
  useFilmGalleryStore.setState((state) => ({ galleries: { ...state.galleries, ...galleries } }))
}

// ---- 内存缓存（同一角色的多张卡共享一份）----

interface FilmGalleryState {
  galleries: Record<string, FilmImage[]>
  manager: { id: string; name: string } | null
  openManager: (characterId: string, name: string) => void
  closeManager: () => void
  save: (characterId: string, list: FilmImage[]) => Promise<void>
}

const loading = new Set<string>()

export const useFilmGalleryStore = create<FilmGalleryState>((set) => ({
  galleries: {},
  manager: null,
  openManager: (characterId, name) => set({ manager: { id: characterId, name } }),
  closeManager: () => set({ manager: null }),
  save: async (characterId, list) => {
    await filmGallerySet(characterId, list)
    set((state) => ({ galleries: { ...state.galleries, [characterId]: list } }))
  },
}))

/** 第一次用到某个角色时从 IndexedDB 读一次。 */
export function ensureFilmGallery(characterId: string) {
  if (!characterId || loading.has(characterId) || characterId in useFilmGalleryStore.getState().galleries) return
  loading.add(characterId)
  filmGalleryGet(characterId)
    .then((list) => { if (!(characterId in useFilmGalleryStore.getState().galleries)) useFilmGalleryStore.setState((state) => ({ galleries: { ...state.galleries, [characterId]: list } })) })
    .catch(() => { /* 读不到就保持头像 */ })
    .finally(() => loading.delete(characterId))
}

const EMPTY: FilmImage[] = []
export function useFilmGallery(characterId?: string): FilmImage[] {
  return useFilmGalleryStore((state) => (characterId && state.galleries[characterId]) || EMPTY)
}

// ---- 共享计时：一个 IntersectionObserver + 一个 setInterval，只给屏幕上的卡走表 ----

type Tick = () => void
const visible = new Map<Element, Tick>()
const watched = new Map<Element, Tick>()
let observer: IntersectionObserver | null = null
let timer: ReturnType<typeof setInterval> | null = null

function syncTimer() {
  if (visible.size && !timer) timer = setInterval(() => { if (typeof document === 'undefined' || !document.hidden) visible.forEach((tick) => tick()) }, FILM_ROTATE_MS)
  else if (!visible.size && timer) { clearInterval(timer); timer = null }
}

/** 注册一个胶片框；它在屏幕上时每 4 秒调一次 tick。返回取消函数。 */
export function watchFilmFrame(el: Element, tick: Tick): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {}
  if (!observer) observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const fn = watched.get(entry.target)
      if (fn && entry.isIntersecting) visible.set(entry.target, fn)
      else visible.delete(entry.target)
    }
    syncTimer()
  })
  watched.set(el, tick)
  observer.observe(el)
  return () => {
    observer?.unobserve(el)
    watched.delete(el)
    visible.delete(el)
    syncTimer()
  }
}
