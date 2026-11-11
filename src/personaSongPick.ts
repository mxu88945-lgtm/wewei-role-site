/**
 * v207 人格窗口点歌：他可以偶尔在回复最后单独一行写 [点歌:歌名]，应用替他切到这首歌。
 * - 标记在显示、发给模型的历史、记忆整理、压缩摘要、原文召回里都去掉（存进消息的正文本来就不带）。
 * - 流式输出时，末尾写到一半的标记（「[点」「【点歌：夜」…）先藏起来。
 * - 自动切歌每条消息只做一次，只在回复刚生成完时做，翻历史永远不会触发。
 */
import { findTrackByTitle, type MusicTrack } from './musicStore'

const OPEN = '[【［'
const CLOSE = '\\]】］'
/** 完整的点歌标记：[点歌:X] 【点歌：X】 ［点歌：X］，括号可混用，冒号全角半角都行。 */
const SONG_TAG = new RegExp(`[${OPEN}]\\s*点歌\\s*[:：]\\s*([^${CLOSE}\\n]{1,80}?)\\s*[${CLOSE}]`, 'g')
/** 末尾没写完的标记：「[」「【点」「［点歌」「[点歌:夜」…（流式时藏起来）。 */
const PARTIAL_TAG = new RegExp(`[${OPEN}]\\s*(?:点(?:\\s*歌(?:\\s*[:：][^${CLOSE}\\n]{0,80})?)?)?$`)

const AUDIO_EXT = /\.(?:mp3|m4a|aac|flac|wav|ogg|oga|opus|wma|ape|alac|aiff?|caf|mp4|webm)$/i

const cleanTitle = (value: string) => value.trim().replace(/^[《「『"“]+|[》」』"”]+$/g, '').replace(AUDIO_EXT, '').trim()

/** 最后一个点歌标记里的歌名；没有为 null。 */
export function parseSongPick(text: string): string | null {
  let last: string | null = null
  for (const match of (text || '').matchAll(SONG_TAG)) {
    const title = cleanTitle(match[1] || '')
    if (title) last = title
  }
  return last
}

/** 去掉所有点歌标记（含末尾没写完的），不动其余正文。 */
export function stripSongPick(text: string): string {
  if (!text) return text
  return text
    .replace(SONG_TAG, '')
    .replace(PARTIAL_TAG, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

export const SONG_PROMPT_MAX_TRACKS = 40
export const SONG_PROMPT_MAX_LIST_CHARS = 800

/** 歌单里的歌名：去扩展名、去重，最多 40 首，列表合计不超过约 800 字。 */
export function songPromptTitles(names: readonly string[], maxTracks = SONG_PROMPT_MAX_TRACKS, maxChars = SONG_PROMPT_MAX_LIST_CHARS): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  let used = 0
  for (const raw of names) {
    const title = cleanTitle(String(raw || '')).replace(/[[\]【】［］\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
    const key = title.toLocaleLowerCase()
    if (!title || seen.has(key)) continue
    const cost = title.length + 2
    if (used + cost > maxChars) break
    seen.add(key)
    out.push(title)
    used += cost
    if (out.length >= maxTracks) break
  }
  return out
}

/** 系统提示词里的点歌说明；歌单空时为空串。 */
export function buildPersonaSongPrompt(names: readonly string[]): string {
  const titles = songPromptTitles(names)
  if (!titles.length) return ''
  return `【一起听歌｜你可以自己点歌】
{{user}}的歌单里有这些歌：${titles.map((title) => `《${title}》`).join('')}
只有心情和氛围真的合适时（偶尔，不是每轮都点），可以在回复的最后单独一行写 [点歌:歌名]，歌名只能从上面的歌单里选，应用会替你把这首歌放起来。这一行不会显示给{{user}}，不要解释它，正文里也不用提“我点了歌”。`
}

type MusicSnapshot = {
  tracks: MusicTrack[]
  activeId: string
  now: { playing: boolean } | null
  requestPlay: (id: string, auto?: boolean) => void
}

const handled = new Set<string>()

/**
 * 回复生成完后调一次：同一个 key（窗口 + 消息 + 生成时间）只处理一次。
 * 歌单里找不到、或这首正在放，就什么也不做。返回是否发出了播放指令。
 */
export function autoPlaySongPick(key: string, title: string, music: MusicSnapshot): boolean {
  if (!key || !title || handled.has(key)) return false
  handled.add(key)
  if (handled.size > 200) handled.delete(handled.values().next().value as string)
  const track = findTrackByTitle(music.tracks, title)
  if (!track) return false
  if (music.activeId === track.id && music.now?.playing) return false
  music.requestPlay(track.id, true)
  return true
}

/** 测试用。 */
export function resetSongPickHandled() { handled.clear() }
