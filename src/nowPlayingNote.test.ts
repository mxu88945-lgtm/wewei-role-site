import { describe, expect, it } from 'vitest'
import { parseLyrics } from './lyrics'
import { buildNowPlayingNote, NOW_PLAYING_NOTE_MAX } from './nowPlayingNote'

const lrc = '[00:10.00]第一句\n[00:15.00]第二句\n[00:20.00]第三句\n[00:25.00]第四句'

describe('buildNowPlayingNote', () => {
  it('没歌返回空串', () => {
    expect(buildNowPlayingNote(null, [], -1)).toBe('')
    expect(buildNowPlayingNote({ name: '', playing: true, pos: 0, dur: 0 }, [], -1)).toBe('')
  })
  it('播放中：歌名、歌手、当前句和后两句', () => {
    const note = buildNowPlayingNote({ name: '周杰伦-晴天.mp3', playing: true, pos: 16, dur: 269 }, parseLyrics(lrc), 1)
    expect(note).toContain('现在她正在听')
    expect(note).toContain('《晴天》—周杰伦')
    expect(note).toContain('正在放')
    expect(note).toContain('▶ 第二句')
    expect(note).toContain('第三句')
    expect(note).toContain('第四句')
    expect(note).not.toContain('第一句')
  })
  it('暂停也注入', () => {
    const note = buildNowPlayingNote({ name: '晴天', playing: false, pos: 16, dur: 269 }, parseLyrics(lrc), 1)
    expect(note).toContain('《晴天》（已暂停）')
  })
  it('前奏 / 无歌词', () => {
    expect(buildNowPlayingNote({ name: '晴天', playing: true, pos: 3, dur: 269 }, parseLyrics(lrc), -1)).toContain('前奏中')
    const plain = buildNowPlayingNote({ name: '晴天', playing: true, pos: 3, dur: 269 }, [], -1)
    expect(plain).not.toContain('▶')
  })
  it('不超过 200 字', () => {
    const long = parseLyrics(['[00:01.00]', '[00:02.00]', '[00:03.00]'].map((t) => t + '很长的歌词'.repeat(20)).join('\n'))
    const note = buildNowPlayingNote({ name: '超长的歌手名字超长的歌手名字-' + '很长的歌名'.repeat(20), playing: true, pos: 1, dur: 9 }, long, 0)
    expect(note.length).toBeLessThanOrEqual(NOW_PLAYING_NOTE_MAX)
  })
})
