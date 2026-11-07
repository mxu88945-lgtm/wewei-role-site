import { describe, it, expect } from 'vitest'
import { parseLyrics, lyricIndexAt, buildMusicNote, guessSongMeta, pickLyrics, rankLyrics, shiftLyrics } from './lyrics'

const lrc = `[ti:晴天]
[ar:周杰伦]
[00:10.50]故事的小黄花
[00:15.00][01:20.00]从出生那年就飘着
[00:20.3]童年的荡秋千`

describe('lyrics', () => {
  it('解析 LRC，多时间戳展开并排序', () => {
    const l = parseLyrics(lrc)
    expect(l.map((x) => x.t)).toEqual([10.5, 15, 20.3, 80])
    expect(lyricIndexAt(l, 16)).toBe(1)
    expect(lyricIndexAt(l, 3)).toBe(-1)
  })
  it('纯文本歌词', () => {
    const l = parseLyrics('第一句\n\n第二句')
    expect(l).toEqual([{ t: -1, text: '第一句' }, { t: -1, text: '第二句' }])
  })
  it('注入当前句，暂停不注入', () => {
    const l = parseLyrics(lrc)
    const n = buildMusicNote({ name: '晴天', playing: true, pos: 16, dur: 269 }, l)
    expect(n).toContain('《晴天》')
    expect(n).toContain('▶ 从出生那年就飘着')
    expect(buildMusicNote({ name: '晴天', playing: false, pos: 16, dur: 269 }, l)).toBe('')
    expect(buildMusicNote({ name: '晴天', playing: true, pos: 16, dur: 269 }, l, ['晴天', '稻香'])).toContain('她的歌单（2 首）：晴天、稻香')
  })
})

describe('online lyrics helpers', () => {
  it('guesses title and artist from file name', () => {
    expect(guessSongMeta('阿梨粤-偏偏喜欢你(女声版)')).toEqual({ title: '偏偏喜欢你', artist: '阿梨粤' })
    expect(guessSongMeta('阿梨粤–一格格(阿梨粤版).mp3')).toEqual({ title: '一格格', artist: '阿梨粤' })
    expect(guessSongMeta('飘雪')).toEqual({ title: '飘雪', artist: '' })
  })
  it('prefers same-title synced lyrics', () => {
    const items = [
      { trackName: '难得有情人 Live', syncedLyrics: '[00:01.00]b' },
      { trackName: '难得有情人', plainLyrics: 'p' },
      { trackName: '难得有情人', syncedLyrics: '[00:01.00]a' },
    ]
    expect(pickLyrics(items, '难得有情人')).toBe('[00:01.00]a')
    expect(pickLyrics([{ trackName: '别的', syncedLyrics: 'x' }], '难得有情人')).toBe('')
  })
})

describe('lyric ranking by duration', () => {
  it('prefers the version closest to the real duration', () => {
    const items = [
      { trackName: '飘雪', duration: 250, syncedLyrics: '[00:01.00]A' },
      { trackName: '飘雪', duration: 271, syncedLyrics: '[00:01.00]B' },
    ]
    expect(rankLyrics(items, '飘雪', 270)).toEqual(['[00:01.00]B', '[00:01.00]A'])
  })
  it('shifts timed lyrics', () => {
    expect(shiftLyrics([{ t: 1, text: 'a' }], 0.5)[0].t).toBe(1.5)
    expect(shiftLyrics([{ t: -1, text: 'a' }], 0.5)[0].t).toBe(-1)
  })
})
