/**
 * v208 人格窗口：「现在她正在听」短注（唱片机在放或暂停在某首时）。纯函数，发送时读 musicStore 现值。
 * 主聊天另有更长的【一起听歌】（lyrics.ts buildMusicNote，只在播放时注入、带歌单），这里不改它。
 */
import { guessSongMeta, isTimed, type LyricLine, type NowPlaying } from './lyrics'

export const NOW_PLAYING_NOTE_MAX = 200
/** v242：没时间轴的纯文本歌词（她自己粘的）整段给，最多这么多字，总长另放宽 */
export const PLAIN_LYRICS_NOTE_MAX = 600

/** 整段歌词文本：去掉相邻重复句，用 / 连 */
export function fullLyricsText(lyrics: LyricLine[]): string {
  const out: string[] = []
  for (const l of lyrics) if (out[out.length - 1] !== l.text) out.push(l.text)
  return out.join(' / ')
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/** 没有歌（now 为空或没歌名）返回空串。lyricIndex 为唱片机当前句（-1 = 还没唱到 / 无时间轴）。 */
export function buildNowPlayingNote(now: NowPlaying | null, lyrics: LyricLine[], lyricIndex: number): string {
  if (!now || !now.name?.trim()) return ''
  const { title, artist } = guessSongMeta(now.name.trim())
  const head = `【现在她正在听】《${clip(title, 30)}》${artist ? `—${clip(artist, 16)}` : ''}（${now.playing ? '正在放' : '已暂停'}）`
  const lines: string[] = [head]
  if (isTimed(lyrics)) {
    if (lyricIndex >= 0 && lyricIndex < lyrics.length) {
      lyrics.slice(lyricIndex, lyricIndex + 3).forEach((line, k) => lines.push(`${k === 0 ? '▶' : ' '} ${clip(line.text, 28)}`))
    } else if (lyricIndex < 0 && now.pos < (lyrics[0]?.t ?? 0)) lines.push('前奏中，还没唱到歌词。')
    // v243：带时间轴的歌也附整段歌词（去重相邻重复句），当前句仍用 ▶ 标
    const words = clip(fullLyricsText(lyrics), PLAIN_LYRICS_NOTE_MAX)
    const tail = '可自然提到，别每条都提；要引用就用上面原句，别编歌词。'
    return [clip(lines.join('\n'), NOW_PLAYING_NOTE_MAX), `整首歌词：${words}`, tail].join('\n')
  } else if (lyrics.length) {
    const tail = '可自然提到，别每条都提；要引用就用上面原句，别编歌词。'
    const words = clip(fullLyricsText(lyrics), PLAIN_LYRICS_NOTE_MAX)
    return [clip(head, NOW_PLAYING_NOTE_MAX), `这首歌的歌词：${words}`, tail].join('\n')
  }
  lines.push('可自然提到，别每条都提，别编歌词。')
  return clip(lines.join('\n'), NOW_PLAYING_NOTE_MAX)
}
