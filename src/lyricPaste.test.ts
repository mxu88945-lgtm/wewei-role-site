import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseLyrics } from './lyrics'
import { isNoLyricsHint, lyricPasteAction, normalizePastedLyrics, staticLyricTexts } from './lyricPaste'

describe('粘贴歌词 (v241)', () => {
  it('整理换行和行尾空白，去掉首尾空行', () => {
    expect(normalizePastedLyrics('\r\n\r\n第一句  \r\n第二句\u00a0\n\n')).toBe('第一句\n第二句')
  })
  it('空白或只有标签行算空', () => {
    expect(normalizePastedLyrics('   \n\n ')).toBe('')
    expect(normalizePastedLyrics('[ti:晴天]\n[ar:周杰伦]')).toBe('')
  })
  it('保存：纯文本 / 带时间轴；空的就清掉', () => {
    expect(lyricPasteAction('第一句\n第二句')).toEqual({ kind: 'save', text: '第一句\n第二句', timed: false })
    const timed = lyricPasteAction('[00:12.30]故事的小黄花\n[00:15.00]从出生那年就飘着')
    expect(timed.kind).toBe('save')
    expect(timed.kind === 'save' && timed.timed).toBe(true)
    expect(lyricPasteAction('  \n ')).toEqual({ kind: 'clear' })
  })
  it('没时间轴的歌词静态列出，有时间轴的不列', () => {
    expect(staticLyricTexts(parseLyrics('第一句\n\n第二句'))).toEqual(['第一句', '第二句'])
    expect(staticLyricTexts(parseLyrics('[00:01.00]一'))).toEqual([])
    expect(staticLyricTexts([])).toEqual([])
  })
  it('找不到歌词的提示才给粘贴按钮', () => {
    expect(isNoLyricsHint('网上没找到这首的歌词')).toBe(true)
    expect(isNoLyricsHint('没找到歌词，可以点「+词」自己加')).toBe(true)
    expect(isNoLyricsHint('正在找歌词…')).toBe(false)
    expect(isNoLyricsHint('')).toBe(false)
  })
  it('粘贴面板跟着键盘：index.html 写入高度，standalone 下 bottom:auto，输入框 16px 防缩放', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
    const css = readFileSync(new URL('./music.css', import.meta.url), 'utf8')
    expect(html).toContain('.wj-lyric-paste-layer')
    expect(css).toContain('html[data-standalone] .wj-lyric-paste-layer { bottom: auto; }')
    expect(css).toMatch(/\.wj-lyric-paste textarea \{[^}]*font-size: 16px/)
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/backdrop-filter/)
  })
})
