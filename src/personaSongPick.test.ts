import { beforeEach, describe, expect, it, vi } from 'vitest'
import { autoPlaySongPick, buildPersonaSongPrompt, parseSongPick, resetSongPickHandled, songPromptTitles, stripSongPick, SONG_PROMPT_MAX_LIST_CHARS, SONG_PROMPT_MAX_TRACKS } from './personaSongPick'
import { personaReplyText } from './personaWindowPresentation'
import { normalizePersonaState } from './personaWindow'

describe('点歌标记', () => {
  it('parses the last tag with any bracket and colon', () => {
    expect(parseSongPick('嗯。\n[点歌:夜曲]')).toBe('夜曲')
    expect(parseSongPick('【点歌：晴天】')).toBe('晴天')
    expect(parseSongPick('［点歌：稻香］')).toBe('稻香')
    expect(parseSongPick('[点歌：《七里香》]')).toBe('七里香')
    expect(parseSongPick('[点歌:A]\n后来又想了想\n【点歌:B】')).toBe('B')
    expect(parseSongPick('没有点歌')).toBeNull()
    expect(parseSongPick('[点歌:]')).toBeNull()
  })

  it('strips complete and partial tags without touching the prose', () => {
    expect(stripSongPick('今晚风很轻。\n[点歌:夜曲]')).toBe('今晚风很轻。')
    expect(stripSongPick('一起听。\n【点歌：晴天】\n')).toBe('一起听。')
    expect(stripSongPick('等一下\n[点')).toBe('等一下')
    expect(stripSongPick('等一下\n【点歌：夜')).toBe('等一下')
    expect(stripSongPick('等一下\n［点歌')).toBe('等一下')
    expect(stripSongPick('【重要】别忘了')).toBe('【重要】别忘了')
    expect(stripSongPick('[记忆:x] 保留')).toBe('[记忆:x] 保留')
  })

  it('never reaches display / history / memory text', () => {
    expect(personaReplyText('晚安。\n\n[点歌:夜曲]')).toBe('晚安。')
    expect(personaReplyText('晚安。\n【点歌：夜')).toBe('晚安。')
  })

  it('keeps songPick on assistant messages and the per-persona toggle', () => {
    const state = normalizePersonaState({ personas: [{ characterId: 'c1', songPickEnabled: false, threads: [{ id: 't', messages: [{ id: 1, role: 'assistant', text: 'hi', songPick: '夜曲' }, { id: 2, role: 'user', text: 'x', songPick: 'no' }] }] }] })
    expect(state.personas[0].songPickEnabled).toBe(false)
    expect(state.personas[0].threads[0].messages[0].songPick).toBe('夜曲')
    expect(state.personas[0].threads[0].messages[1].songPick).toBeUndefined()
    expect(normalizePersonaState({ personas: [{ characterId: 'c2' }] }).personas[0].songPickEnabled).toBeUndefined()
  })
})

describe('点歌提示词', () => {
  it('is empty with an empty playlist', () => {
    expect(buildPersonaSongPrompt([])).toBe('')
  })

  it('strips extensions, dedupes and caps the list', () => {
    expect(songPromptTitles(['夜曲.mp3', '夜曲', '晴天.flac', ' 晴天 '])).toEqual(['夜曲', '晴天'])
    const many = Array.from({ length: 120 }, (_, i) => `第${i}首歌.mp3`)
    expect(songPromptTitles(many)).toHaveLength(SONG_PROMPT_MAX_TRACKS)
    const long = Array.from({ length: 60 }, (_, i) => `${'很长的歌名'.repeat(6)}${i}`)
    const titles = songPromptTitles(long)
    expect(titles.reduce((sum, title) => sum + title.length + 2, 0)).toBeLessThanOrEqual(SONG_PROMPT_MAX_LIST_CHARS)
    const prompt = buildPersonaSongPrompt(['夜曲.mp3'])
    expect(prompt).toContain('《夜曲》')
    expect(prompt).toContain('[点歌:歌名]')
    expect(prompt).toContain('偶尔')
    expect(prompt).not.toContain('.mp3')
  })
})

describe('自动切歌', () => {
  beforeEach(() => resetSongPickHandled())
  const tracks = [{ id: 'a', name: '周杰伦 - 夜曲' }, { id: 'b', name: '晴天' }]

  it('plays once per message', () => {
    const requestPlay = vi.fn()
    const music = { tracks, activeId: 'b', now: { playing: true }, requestPlay }
    expect(autoPlaySongPick('t:5:1', '夜曲', music)).toBe(true)
    expect(requestPlay).toHaveBeenCalledWith('a', true)
    expect(autoPlaySongPick('t:5:1', '夜曲', music)).toBe(false)
    expect(requestPlay).toHaveBeenCalledTimes(1)
    expect(autoPlaySongPick('t:7:2', '夜曲', music)).toBe(true)
  })

  it('skips the song already playing and unknown songs', () => {
    const requestPlay = vi.fn()
    expect(autoPlaySongPick('k1', '晴天', { tracks, activeId: 'b', now: { playing: true }, requestPlay })).toBe(false)
    expect(autoPlaySongPick('k2', '不存在的歌名字', { tracks, activeId: 'b', now: { playing: true }, requestPlay })).toBe(false)
    expect(autoPlaySongPick('k3', '晴天', { tracks, activeId: 'b', now: { playing: false }, requestPlay })).toBe(true)
    expect(requestPlay).toHaveBeenCalledTimes(1)
  })
})
