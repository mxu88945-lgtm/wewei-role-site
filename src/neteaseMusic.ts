/**
 * v324 网易云（移植自顾祁砚 1.0.19–1.0.22）：走她自己的 Cloudflare 音乐服务（music.zhouweiweihome.top）。
 * 地址和 token 只存本机（weijing-local.* 前缀，不进备份）；网易云登录信息只存在音乐服务的 KV 里，网页拿不到。
 * 在线歌在歌单里的 id 是 `ne:<songId>`，音频每次现取播放地址（网易云链接大约 20 分钟就失效）。
 */
import { readToolServiceConfig } from './toolService'

export const DEFAULT_MUSIC_SERVICE_URL = 'https://music.zhouweiweihome.top'
const URL_KEY = 'weijing-local.musicServiceUrl'
const TOKEN_KEY = 'weijing-local.musicServiceToken'

export type NeteaseConfig = { url: string; token: string }
export type NeteaseSong = { songId: string; name: string; artist: string; album?: string; cover?: string }
export type NeteasePlaylist = { id: string; name: string; count: number; cover: string; mine: boolean; liked: boolean }

const safeStorage = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null } }

export function readNeteaseConfig(storage: Pick<Storage, 'getItem'> | null = safeStorage()): NeteaseConfig {
  try {
    if (!storage) return { url: DEFAULT_MUSIC_SERVICE_URL, token: '' }
    return { url: (storage.getItem(URL_KEY)?.trim() || DEFAULT_MUSIC_SERVICE_URL).replace(/\/$/, ''), token: storage.getItem(TOKEN_KEY) || '' }
  } catch { return { url: DEFAULT_MUSIC_SERVICE_URL, token: '' } }
}
export function saveNeteaseConfig(config: NeteaseConfig, storage: Pick<Storage, 'setItem'> | null = safeStorage()) {
  try {
    if (!storage) return
    storage.setItem(URL_KEY, (config.url.trim() || DEFAULT_MUSIC_SERVICE_URL).replace(/\/$/, ''))
    storage.setItem(TOKEN_KEY, config.token.trim())
  } catch { /* optional */ }
}
/** 一键填好：音乐服务的 token 跟「工具密钥」是同一把。 */
export function autofillNeteaseConfig(): NeteaseConfig | null {
  const key = readToolServiceConfig().key.trim()
  if (!key) return null
  const config = { url: DEFAULT_MUSIC_SERVICE_URL, token: key }
  saveNeteaseConfig(config)
  return config
}
export const neteaseReady = (config = readNeteaseConfig()) => Boolean(config.url && config.token)

export const neTrackId = (songId: string) => `ne:${songId}`
export const isNeTrackId = (id: string) => id.startsWith('ne:')
export const neSongIdOf = (id: string) => (isNeTrackId(id) ? id.slice(3) : '')

async function api<T>(path: string, init: RequestInit = {}, config = readNeteaseConfig()): Promise<T> {
  if (!neteaseReady(config)) throw new Error('还没连上音乐服务')
  const res = await fetch(`${config.url}${path}`, { ...init, headers: { 'X-Auth-Token': config.token, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) } })
  const text = await res.text()
  let data: Record<string, unknown> = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { error: text || `HTTP ${res.status}` } }
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `音乐服务返回 ${res.status}`)
  return data as T
}

export const neteaseHealth = (config?: NeteaseConfig) => api<{ ok: boolean; loggedIn: boolean; nickname: string }>('/health', {}, config)
export const neteaseSearch = async (q: string) => (await api<{ songs: NeteaseSong[] }>(`/music/search?q=${encodeURIComponent(q)}`)).songs || []
export async function neteaseSongUrl(songId: string): Promise<string> {
  const d = await api<{ url?: string; error?: string }>(`/music/url?id=${encodeURIComponent(songId)}`)
  if (!d.url) throw new Error(d.error || '这首暂时放不了')
  return d.url
}
export const neteaseLyric = async (songId: string) => (await api<{ lrc?: string }>(`/music/lyric?id=${encodeURIComponent(songId)}`)).lrc || ''
export const neteasePlaylists = (): Promise<{ playlists: NeteasePlaylist[]; error?: string }> => api('/music/netease/playlists')
export const neteasePlaylistSongs = async (id: string) => (await api<{ songs: NeteaseSong[] }>(`/music/netease/playlist?id=${encodeURIComponent(id)}`)).songs || []
export const neteaseQr = () => api<{ ok: boolean; key: string; svg: string; error?: string }>('/login/qr')
export const neteaseQrCheck = (key: string) => api<{ code: number; message: string }>(`/login/qr/check?key=${encodeURIComponent(key)}`)
export const neteaseLogout = () => api<{ ok: boolean }>('/login/logout')

/** 在线歌在歌单里显示的名字：「歌名 - 歌手」，点歌按歌名或歌手都能对上。 */
export const neTrackName = (song: NeteaseSong) => (song.artist ? `${song.name} - ${song.artist}` : song.name)
