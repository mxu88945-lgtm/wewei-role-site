import { describe, expect, it, vi } from 'vitest'
import { extractFilmCard, filmCardInstruction, filmGramoText, filmPlayNudge, parseFilmBody, playlistForPrompt, stripFilmBlocks } from './filmBlock'
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
  it('v202: normalizes extensions, artists, brackets, versions and traditional characters', () => {
    for (const name of ['千年之恋', 'F.I.R. - 千年之恋.mp3', '千年之戀 (Live)', '千年之恋-F.I.R.飞儿乐团', 'F.I.R.飛兒樂團 – 千年之戀【伴奏】.flac']) {
      const list = [{ id: 'x', name: '晴天' }, { id: 'y', name: 'F.I.R. - 我们的爱' }, { id: 'hit', name }]
      expect(findTrackByTitle(list, '千年之恋')?.id, name).toBe('hit')
      expect(findTrackByTitle(list, '千年之恋', 'F.I.R.')?.id, name).toBe('hit')
      expect(findTrackByTitle(list, '《千年之恋》F.I.R.')?.id, name).toBe('hit')
      expect(findTrackByTitle(list, '千年之恋-F.I.R.飞儿乐团')?.id, name).toBe('hit')
      expect(findTrackByTitle(list, '千年之戀 (Live)')?.id, name).toBe('hit')
    }
    // 只有同一个歌手的别的歌：不算匹配。
    expect(findTrackByTitle([{ id: 'y', name: 'F.I.R. - 我们的爱' }], '千年之恋-F.I.R.飞儿乐团')).toBeNull()
    expect(findTrackByTitle([{ id: 'y', name: 'F.I.R. - 我们的爱' }], '千年之恋', 'F.I.R.')).toBeNull()
    // 也看歌名 / 歌手字段。
    expect(findTrackByTitle([{ id: 'z', name: 'track01', title: '千年之戀', artist: 'F.I.R.' }], '千年之恋')?.id).toBe('z')
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

describe('autoPlayFilmSong (v202)', () => {
  it('switches to the requested song once per message, skips if already playing or missing', async () => {
    const { useMusicStore } = await import('./musicStore')
    const { autoPlayFilmSong, resetFilmAutoplayForTests } = await import('./filmAutoplay')
    resetFilmAutoplayForTests()
    useMusicStore.setState({ tracks: [{ id: 'a', name: '晴天' }, { id: 'b', name: 'F.I.R. - 千年之戀' }], now: { name: '晴天', playing: true, pos: 1, dur: 200 }, command: null })
    const text = '正文。\n<film>\n歌：千年之恋 - F.I.R.\n幕：天台\n</film>'
    expect(autoPlayFilmSong('m1', text)).toBe('requested')
    expect(useMusicStore.getState().command).toMatchObject({ kind: 'play', id: 'b', auto: true })
    expect(autoPlayFilmSong('m1', text)).toBe('done-before')
    useMusicStore.setState({ now: { name: 'F.I.R. - 千年之戀', playing: true, pos: 1, dur: 200 } })
    expect(autoPlayFilmSong('m2', text)).toBe('already-playing')
    expect(autoPlayFilmSong('m3', '正文。\n<film>\n歌：稻香 - 周杰伦\n</film>')).toBe('no-match')
    expect(autoPlayFilmSong('m4', '正文。\n<film>\n幕：没写歌\n</film>')).toBe('no-card')
    useMusicStore.setState({ tracks: [], now: null, command: null })
  })

  it('v204: plays from a final reply whose <film> was never closed, and marks blocked if nothing plays in 3s', async () => {
    vi.useFakeTimers()
    try {
      const { useMusicStore } = await import('./musicStore')
      const { autoPlayFilmSong, resetFilmAutoplayForTests } = await import('./filmAutoplay')
      resetFilmAutoplayForTests()
      useMusicStore.setState({ tracks: [{ id: 'g', name: '古巨基-谁愿放手.mp3' }, { id: 's', name: 'S.H.E-恋人未满.mp3' }], now: { name: '古巨基-谁愿放手.mp3', playing: true, pos: 1, dur: 200 }, command: null, autoplayBlockedId: '' })
      const text = '正文。\n<film>\n歌：恋人未满 - S.H.E\n幕：雨夜｜路灯下\n心声：别走'
      expect(autoPlayFilmSong(7, text)).toBe('requested')
      expect(useMusicStore.getState().command).toMatchObject({ kind: 'play', id: 's', auto: true })
      expect(autoPlayFilmSong(7, text + '\n')).toBe('done-before')
      vi.advanceTimersByTime(3100)
      expect(useMusicStore.getState().autoplayBlockedId).toBe('s')

      // 3 秒内放上了 → 不标记。
      useMusicStore.setState({ autoplayBlockedId: '', command: null, now: { name: '古巨基-谁愿放手.mp3', playing: true, pos: 1, dur: 200 } })
      expect(autoPlayFilmSong(8, text)).toBe('requested')
      useMusicStore.setState({ now: { name: 'S.H.E-恋人未满.mp3', playing: true, pos: 0, dur: 200 } })
      vi.advanceTimersByTime(3100)
      expect(useMusicStore.getState().autoplayBlockedId).toBe('')

      // 这期间她自己点了别的 → 不标记。
      useMusicStore.setState({ autoplayBlockedId: '', command: null, now: { name: '古巨基-谁愿放手.mp3', playing: true, pos: 1, dur: 200 } })
      expect(autoPlayFilmSong(9, text)).toBe('requested')
      useMusicStore.getState().requestPlay('g')
      vi.advanceTimersByTime(3100)
      expect(useMusicStore.getState().autoplayBlockedId).toBe('')
      useMusicStore.setState({ tracks: [], now: null, command: null, autoplayBlockedId: '' })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('filmCardInstruction playlist (v204)', () => {
  it('lists her playlist names without extensions and prefers them', () => {
    const text = filmCardInstruction('谢聿衡', '惟惟', false, ['S.H.E-恋人未满.mp3', '古巨基-谁愿放手.m4a', 'S.H.E-恋人未满.mp3'])
    expect(text).toContain('《S.H.E-恋人未满》')
    expect(text).toContain('《古巨基-谁愿放手》')
    expect(text).not.toContain('.mp3')
    expect(text.match(/恋人未满/g)).toHaveLength(1)
    expect(text).toContain('优先从这份歌单里挑')
    expect(text).toContain('照歌单里的写法原样写')
  })

  it('keeps the old wording with an empty playlist', () => {
    expect(filmCardInstruction('他', '惟惟', false, [])).toContain('「歌」可选：有适合这一幕氛围的真实歌曲就写')
    expect(filmCardInstruction('他', '惟惟')).not.toContain('歌单')
  })

  it('caps at 40 names and about 800 characters', () => {
    const many = Array.from({ length: 80 }, (_, i) => `歌手${i}-第${i}首歌.mp3`)
    const list = playlistForPrompt(many)
    expect(list.length).toBeLessThanOrEqual(40)
    expect(list.reduce((sum, name) => sum + name.length + 3, 0)).toBeLessThanOrEqual(800)
    const long = Array.from({ length: 40 }, (_, i) => `${'很长的歌名'.repeat(8)}${i}`)
    const capped = playlistForPrompt(long)
    expect(capped.reduce((sum, name) => sum + name.length + 3, 0)).toBeLessThanOrEqual(800)
    expect(capped.length).toBeLessThan(40)
    const text = filmCardInstruction('他', '惟惟', false, many)
    expect(text).toContain('《歌手0-第0首歌》')
    expect(text).not.toContain('歌手45')
  })
})

describe('filmPlayNudge (v204)', () => {
  const base = { matchedId: 's', playingHere: false, blockedId: '', isLatest: true, settled: false, ripe: true }
  it('nudges on the newest card when the matched song is not playing and never played', () => {
    expect(filmPlayNudge(base)).toBe(true)
  })
  it('does not nudge older cards, unmatched songs, playing songs, or before ripe', () => {
    expect(filmPlayNudge({ ...base, isLatest: false })).toBe(false)
    expect(filmPlayNudge({ ...base, matchedId: null })).toBe(false)
    expect(filmPlayNudge({ ...base, playingHere: true })).toBe(false)
    expect(filmPlayNudge({ ...base, ripe: false })).toBe(false)
  })
  it('stops nagging once tapped or played', () => {
    expect(filmPlayNudge({ ...base, settled: true })).toBe(false)
  })
  it('still nudges any card whose autoplay was blocked', () => {
    expect(filmPlayNudge({ ...base, isLatest: false, settled: true, blockedId: 's' })).toBe(true)
    expect(filmPlayNudge({ ...base, isLatest: false, blockedId: 's', playingHere: true })).toBe(false)
  })
})
