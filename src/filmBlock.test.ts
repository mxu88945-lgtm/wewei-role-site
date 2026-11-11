import { describe, expect, it } from 'vitest'
import { extractFilmCard, filmCardInstruction, filmGramoText, parseFilmBody, stripFilmBlocks } from './filmBlock'
import { findTrackByTitle } from './musicStore'
import { modelVisibleMessageText, stripUiOnlyStatusBlocks } from './modelContext'
import { hasVisibleStoryBody } from './outputSanitizer'

const FULL = `他把伞往你那边偏了偏。

“走吧。”

<film>
歌：晴天 - 周杰伦
幕：雨夜长街｜路灯下两把伞挨得很近
题：Some rain falls only for two.｜这场雨只下给两个人
人：沈确｜管家｜中立｜低｜跟了他十年，什么都看在眼里
人：林晚｜前未婚妻｜敌对｜高｜今晚也在这条街上
心声：别走得太快，我想多看你一会儿。
</film>`

describe('parseFilmBody', () => {
  it('parses every field', () => {
    const card = parseFilmBody(FULL.split('<film>')[1].split('</film>')[0])!
    expect(card.song).toEqual({ title: '晴天', artist: '周杰伦' })
    expect(card.sceneTitle).toBe('雨夜长街')
    expect(card.sceneDesc).toBe('路灯下两把伞挨得很近')
    expect(card.en).toBe('Some rain falls only for two.')
    expect(card.zh).toBe('这场雨只下给两个人')
    expect(card.npcs).toHaveLength(2)
    expect(card.npcs[1]).toEqual({ name: '林晚', role: '前未婚妻', stance: '敌对', danger: '高', desc: '今晚也在这条街上' })
    expect(card.heart).toBe('别走得太快，我想多看你一会儿。')
  })

  it('tolerates missing lines, half-width separators and extra npcs', () => {
    const card = parseFilmBody(`幕: 书房
人: A|司机
人：B｜x｜y｜MEDIUM｜z
人：C
人：D
人：E
乱写的一行
心声：「我在等你」`)!
    expect(card.song).toBeUndefined()
    expect(card.sceneTitle).toBe('书房')
    expect(card.sceneDesc).toBe('')
    expect(card.en).toBe('')
    expect(card.npcs.map((n) => n.name)).toEqual(['A', 'B', 'C', 'D'])
    expect(card.npcs[0]).toMatchObject({ role: '司机', stance: '', danger: '' })
    expect(card.npcs[1].danger).toBe('中')
    expect(card.heart).toBe('我在等你')
  })

  it('accepts a Chinese-only caption and returns null for an empty block', () => {
    expect(parseFilmBody('题：只有中文')!.zh).toBe('只有中文')
    expect(parseFilmBody('\n  \n随便写写\n')).toBeNull()
  })
})

describe('extractFilmCard', () => {
  it('removes the block from the body and returns the card', () => {
    const result = extractFilmCard(FULL)
    expect(result.body).toBe('他把伞往你那边偏了偏。\n\n“走吧。”')
    expect(result.card?.sceneTitle).toBe('雨夜长街')
    expect(result.card?.closed).toBe(true)
    expect(result.pending).toBe(false)
  })

  it('returns text untouched when there is no block', () => {
    expect(extractFilmCard('普通的一句话')).toEqual({ body: '普通的一句话', card: null, pending: false })
  })

  it('hides an unclosed block while streaming', () => {
    const partial = '正文写完了。\n<film>\n歌：晴天 - 周杰伦\n幕：雨'
    const result = extractFilmCard(partial, { streaming: true })
    expect(result.body).toBe('正文写完了。')
    expect(result.card).toBeNull()
    expect(result.pending).toBe(true)
    expect(result.body).not.toContain('<')
  })

  it('hides a half-typed opening tag while streaming', () => {
    for (const tail of ['<', '<f', '<fi', '<fil', '<film']) {
      expect(extractFilmCard(`正文。\n${tail}`, { streaming: true }).body).toBe('正文。\n')
    }
  })

  it('renders an unclosed block leniently once streaming has finished', () => {
    const result = extractFilmCard('正文。\n<film>\n幕：天台｜风很大\n心声：别回头', { streaming: false })
    expect(result.body).toBe('正文。')
    expect(result.card?.sceneTitle).toBe('天台')
    expect(result.card?.heart).toBe('别回头')
    expect(result.card?.closed).toBe(false)
  })

  it('pulls a block written mid-body out and uses the last one, dropping stray closers and empty fences', () => {
    const text = '前半。\n<film>幕：甲</film>\n后半。\n```\n<FILM>\n幕：乙\n</film>\n```\n</film>'
    const result = extractFilmCard(text)
    expect(result.body).toBe('前半。\n\n后半。')
    expect(result.card?.sceneTitle).toBe('乙')
  })

  it('is safe to call repeatedly (no shared regex state)', () => {
    for (let i = 0; i < 3; i += 1) expect(extractFilmCard(FULL).card?.npcs).toHaveLength(2)
  })
})

describe('stripFilmBlocks', () => {
  it('drops closed and dangling blocks for prompts and memory', () => {
    expect(stripFilmBlocks(FULL)).toBe('他把伞往你那边偏了偏。\n\n“走吧。”')
    expect(stripFilmBlocks('正文\n<film>\n幕：未完')).toBe('正文')
    expect(stripFilmBlocks('没有块')).toBe('没有块')
  })

  it('is applied to model-visible history and UI-only stripping', () => {
    expect(modelVisibleMessageText({ role: 'assistant', text: FULL })).not.toContain('film')
    expect(stripUiOnlyStatusBlocks(`${FULL}\n<status>x</status>`)).toBe('他把伞往你那边偏了偏。\n\n“走吧。”')
  })

  it('does not count a film-only reply as a story body', () => {
    expect(hasVisibleStoryBody('<film>\n幕：空\n</film>')).toBe(false)
    expect(hasVisibleStoryBody(FULL)).toBe(true)
  })
})

describe('filmCardInstruction', () => {
  it('names the speaker and the format', () => {
    const text = filmCardInstruction('顾祁砚', '惟惟', true)
    expect(text).toContain('<film>')
    expect(text).toContain('</film>')
    expect(text).toContain('顾祁砚没说出口')
    expect(text).toContain('状态栏')
  })
})

describe('findTrackByTitle', () => {
  const tracks = [
    { id: '1', name: '周杰伦 - 晴天' },
    { id: '2', name: 'Fly Me To The Moon' },
    { id: '3', name: '07 夜曲' },
  ]
  it('matches fuzzily by title', () => {
    expect(findTrackByTitle(tracks, '晴天')?.id).toBe('1')
    expect(findTrackByTitle(tracks, 'fly me to the moon')?.id).toBe('2')
    expect(findTrackByTitle(tracks, '《夜曲》', '周杰伦')?.id).toBe('3')
  })
  it('returns null when nothing is close', () => {
    expect(findTrackByTitle(tracks, '稻香')).toBeNull()
    expect(findTrackByTitle([], '晴天')).toBeNull()
  })
})

describe('filmGramoText (v200)', () => {
  const song = { title: 'Exile', artist: 'Taylor Swift' }
  it('shows the track actually playing with its lyric when the card song is not in the playlist', () => {
    expect(filmGramoText({ song, matchedName: null, nowName: '晴天', nowPlaying: true, lyricLine: '故事的小黄花', speakerName: '顾祁砚' }))
      .toEqual({ title: '晴天', sub: '故事的小黄花', requested: '顾祁砚点的：Exile', playingHere: true })
  })
  it('shows the card song with the current lyric when it is matched and playing', () => {
    expect(filmGramoText({ song, matchedName: 'Exile', nowName: 'Exile', nowPlaying: true, lyricLine: 'I can see you standing', speakerName: '他' }))
      .toEqual({ title: 'Exile', sub: 'I can see you standing', requested: '', playingHere: true })
  })
  it('falls back to the artist without lyrics, and shows the card song when nothing plays', () => {
    expect(filmGramoText({ song, matchedName: 'Exile', nowName: 'Exile', nowPlaying: true, lyricLine: '', speakerName: '他' }).sub).toBe('Taylor Swift')
    expect(filmGramoText({ song, matchedName: null, nowName: '晴天', nowPlaying: false, lyricLine: 'x', speakerName: '他' }))
      .toEqual({ title: 'Exile', sub: 'Taylor Swift', requested: '', playingHere: false })
  })
  it('shows what plays when the card has no song', () => {
    expect(filmGramoText({ song: null, nowName: '晴天', nowPlaying: true, lyricLine: '', speakerName: '他' }))
      .toEqual({ title: '晴天', sub: '你的歌单', requested: '', playingHere: true })
    expect(filmGramoText({ song: null, speakerName: '他' }).title).toBe('一起听歌')
  })
})
