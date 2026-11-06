import { describe, expect, it } from 'vitest'
import { addBackstageNote, buildBackstagePrompt, extractBackstageNote, replyToBackstageNote, stripBackstageForStreaming, toggleBackstageWriter } from './backstageNotes'

describe('幕后手记', () => {
  it('extracts the note after the status bar and keeps the body clean', () => {
    const out = extractBackstageNote('正文一段。\n<status>地点：家</status>\n[幕后:她今天又护着那个人，我真的会谢。]')
    expect(out.note).toBe('她今天又护着那个人，我真的会谢。')
    expect(out.text).toBe('正文一段。\n<status>地点：家</status>')
  })
  it('hides an unfinished note while streaming and after truncation', () => {
    expect(stripBackstageForStreaming('正文。\n[幕后:我')).toBe('正文。')
    expect(extractBackstageNote('正文。\n【幕后：写到一半').text).toBe('正文。')
  })
  it('keeps one notebook per writer and only accepts checked writers', () => {
    let book = toggleBackstageWriter(undefined, 'a')
    book = toggleBackstageWriter(book, 'b')
    book = addBackstageNote(book, 'a', 'A 的手记', 1)!
    book = addBackstageNote(book, 'c', '没勾选', 2)!
    expect(book.notes.map((note) => note.characterId)).toEqual(['a'])
    book = replyToBackstageNote(book, book.notes[0].id, '你吃醋啦？', 3)
    const forA = buildBackstagePrompt({ notebook: book, speakerId: 'a', speakerName: 'A', userName: '周惟惟', heroineName: '裴以沫' })
    const forB = buildBackstagePrompt({ notebook: book, speakerId: 'b', speakerName: 'B', userName: '周惟惟' })
    expect(forA).toContain('你吃醋啦？')
    expect(forA).toContain('戏外小手机群')
    expect(forA).toContain('裴以沫')
    expect(forB).not.toContain('A 的手记')
    expect(forB).not.toContain('你吃醋啦？')
    expect(buildBackstagePrompt({ notebook: book, speakerId: 'c', speakerName: 'C', userName: '周惟惟' })).toBe('')
    book = addBackstageNote(book, 'a', '哼，才没有。', 4)!
    expect(book.notes[0].answered).toBe(true)
  })
})

import { sanitizeAssistantOutput } from './outputSanitizer'
describe('幕后手记 survives output sanitizing', () => {
  it('sanitizer does not swallow the tag before extraction', () => {
    const raw = '他没说话，只是把外套披在她肩上。\n\n「冷不冷？」\n\n[幕后:她刚才对谢聿衡笑得那么甜，我演得很辛苦好吗。]'
    expect(extractBackstageNote(sanitizeAssistantOutput(raw)).note).toContain('谢聿衡')
  })
})
