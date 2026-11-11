/**
 * v208 人格窗口：「现在她正在听」短注（唱片机在放或暂停在某首时）。纯函数，发送时读 musicStore 现值。
 * 主聊天另有更长的【一起听歌】（lyrics.ts buildMusicNote，只在播放时注入、带歌单），这里不改它。
 */
import { guessSongMeta, isTimed, type LyricLine, type NowPlaying } from './lyrics'

export const NOW_PLAYING_NOTE_MAX = 200

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
  }
  lines.push('可自然提到，别每条都提，别编歌词。')
  return clip(lines.join('\n'), NOW_PLAYING_NOTE_MAX)
}
