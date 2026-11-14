/**
 * v241 一起听歌「粘贴歌词」：网上找不到歌词时，她直接把歌词贴进来（不用做文件）。
 * 纯函数放这里（react-refresh 规则：组件文件只导出组件）。
 */
import { isTimed, parseLyrics, type LyricLine } from './lyrics'

/** 粘贴框的提示文字 */
export const LYRIC_PASTE_PLACEHOLDER = '一句一行；带 [00:12.30] 时间就会跟着滚动'

/**
 * 整理粘贴进来的歌词：统一换行、去掉每行行尾空白、去掉首尾空行。
 * 解析不出任何一句（全是空白或只有 [ti:] 这类标签）就返回空串，表示「删掉歌词」。
 */
export function normalizePastedLyrics(raw: string): string {
  const text = (raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
  return parseLyrics(text).length ? text : ''
}

export type LyricPasteAction = { kind: 'save'; text: string; timed: boolean } | { kind: 'clear' }

/** 点「保存」时该做什么：有内容就存（顺带告诉是不是带时间轴），空的就删掉这首的歌词。 */
export function lyricPasteAction(raw: string): LyricPasteAction {
  const text = normalizePastedLyrics(raw)
  if (!text) return { kind: 'clear' }
  return { kind: 'save', text, timed: isTimed(parseLyrics(text)) }
}

/** 没有时间轴的歌词：在播放器里按顺序静态列出来（有时间轴的返回空数组，走滚动那套）。 */
export function staticLyricTexts(lines: LyricLine[]): string[] {
  if (!lines.length || isTimed(lines)) return []
  return lines.map((l) => l.text)
}

/** 「找不到歌词」类提示：这时在歌词工具条上给一个「粘贴歌词」按钮。 */
export function isNoLyricsHint(hint: string): boolean {
  return /没找到/.test(hint || '')
}
