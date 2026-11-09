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

import { BACKSTAGE_REPLY_IMAGE_LIMIT, buildBackstageImageMessage, normalizeBackstageNotebook } from './backstageNotes'
describe('幕后手记附图 (v196)', () => {
  const img = (n: number) => `data:image/jpeg;base64,AAA${n}`
  it('normalizes old notebooks without images and cleans bad image data', () => {
    const old = { writerIds: ['a'], notes: [{ id: 'n1', characterId: 'a', text: '旧手记', createdAt: 1, replies: [{ text: '旧回复', at: 2 }] }] }
    const book = normalizeBackstageNotebook(old)!
    expect(book.notes[0].replies).toEqual([{ text: '旧回复', at: 2 }])
    expect(normalizeBackstageNotebook(undefined)).toBeUndefined()
    const messy = normalizeBackstageNotebook({ writerIds: ['a'], notes: [{ id: 'n1', characterId: 'a', text: 'x', createdAt: 1, replies: [{ text: '', at: 3, images: ['https://x', 42, ...Array.from({ length: 9 }, (_, i) => img(i))] }] }, null] })!
    expect(messy.notes).toHaveLength(1)
    expect(messy.notes[0].replies![0].images).toHaveLength(BACKSTAGE_REPLY_IMAGE_LIMIT)
    expect(messy.notes[0].replies![0].images![0]).toBe(img(0))
  })
  it('stores image-only replies and sends only the newest image reply as pixels', () => {
    let book = toggleBackstageWriter(undefined, 'a')
    book = addBackstageNote(book, 'a', '第一篇', 1)!
    book = addBackstageNote(book, 'a', '第二篇', 2)!
    const [first, second] = book.notes
    book = replyToBackstageNote(book, first.id, '', 3, [img(1), img(2)])
    book = replyToBackstageNote(book, second.id, '看这个', 4, [img(3), img(4), img(5)])
    expect(book.notes[0].replies![0]).toEqual({ text: '', at: 3, images: [img(1), img(2)] })
    const prompt = buildBackstagePrompt({ notebook: book, speakerId: 'a', speakerName: 'A', userName: '周惟惟' })
    expect(prompt).toContain('（她发了 2 张图）')
    expect(prompt).toContain('看这个 （她发了 3 张图，图附在后面）')
    const message = buildBackstageImageMessage(book, 'a', '周惟惟')!
    expect(message.role).toBe('user')
    const parts = message.content as { type: string; image_url?: { url: string } }[]
    expect(parts.filter((part) => part.type === 'image_url').map((part) => part.image_url!.url)).toEqual([img(3), img(4), img(5)])
    expect(buildBackstageImageMessage(book, 'b', '周惟惟')).toBeNull()
    // 他写了下一篇（接了话）以后，图不再发送。
    book = addBackstageNote(book, 'a', '收到了', 5)!
    expect(buildBackstageImageMessage(book, 'a', '周惟惟')).toBeNull()
  })
  it('text-only replies send no image message', () => {
    let book = addBackstageNote(toggleBackstageWriter(undefined, 'a'), 'a', '手记', 1)!
    book = replyToBackstageNote(book, book.notes[0].id, '只是文字', 2)
    expect(buildBackstageImageMessage(book, 'a', '周惟惟')).toBeNull()
    expect(replyToBackstageNote(book, book.notes[0].id, '  ', 3, [])).toBe(book)
  })
})
