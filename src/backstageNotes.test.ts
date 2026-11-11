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
    // v201：主线不再要求在正文末尾回她的手记回复。
    expect(forA).not.toContain('你吃醋啦？')
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
    expect(prompt).not.toContain('看这个')
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

import { appendBackstageCharacterReply, BACKSTAGE_CHAT_LIMITS, backstageNoteAwaitsCharacter, backstageReplyFrom, buildBackstageChatMessages, buildBackstageDmMemory, cleanBackstageChatReply } from './backstageNotes'
import type { ChatApiContentPart } from './chatApi'
describe('幕后手记独立私聊 (v201)', () => {
  const img = (n: number) => `data:image/jpeg;base64,BBB${n}`
  const textOf = (content: string | ChatApiContentPart[]) => typeof content === 'string' ? content : content.map((part) => part.type === 'text' ? part.text : '').join('')
  const seed = () => {
    let book = addBackstageNote(toggleBackstageWriter(undefined, 'a'), 'a', '她今天又护着谢聿衡。', 1)!
    book = addBackstageNote(book, 'a', '第二篇：我才没吃醋。', 2)!
    return book
  }

  it('old replies without from count as hers; character replies keep from and drop images', () => {
    const book = normalizeBackstageNotebook({ writerIds: ['a'], notes: [{ id: 'n', characterId: 'a', text: 'x', createdAt: 1, replies: [{ text: '旧的', at: 2 }, { text: '他回', at: 3, from: 'character', images: [img(1)] }, { text: '怪', at: 4, from: 'robot' }] }] })!
    const replies = book.notes[0].replies!
    expect(replies[0]).toEqual({ text: '旧的', at: 2 })
    expect(backstageReplyFrom(replies[0])).toBe('user')
    expect(replies[1]).toEqual({ text: '他回', at: 3, from: 'character' })
    expect(backstageReplyFrom(replies[2])).toBe('user')
  })

  it('appends his reply under the same note and marks it answered', () => {
    let book = seed()
    const id = book.notes[1].id
    book = replyToBackstageNote(book, id, '真的没吃醋？', 3)
    expect(backstageNoteAwaitsCharacter(book.notes[1])).toBe(true)
    book = appendBackstageCharacterReply(book, id, '  没有。就一点点。 ', 4)
    expect(book.notes[1].replies![book.notes[1].replies!.length - 1]).toEqual({ text: '没有。就一点点。', at: 4, from: 'character' })
    expect(book.notes[1].answered).toBe(true)
    expect(backstageNoteAwaitsCharacter(book.notes[1])).toBe(false)
    expect(appendBackstageCharacterReply(book, 'missing', 'x', 5)).toBe(book)
    expect(appendBackstageCharacterReply(book, id, '   ', 5)).toBe(book)
    const main = buildBackstagePrompt({ notebook: book, speakerId: 'a', speakerName: 'A', userName: '周惟惟' })
    expect(main).toContain('戏外私聊余温')
    expect(main).toContain('你：没有。就一点点。')
    expect(main).toContain('不许因此改变剧情走向')
    expect(main).not.toContain('必须在最末写一条 [幕后:…] 回她')
  })

  it('builds the reply prompt: persona, memories, story tail, note, thread, other notes', () => {
    let book = seed()
    const id = book.notes[1].id
    book = replyToBackstageNote(book, id, '先发一张', 3, [img(1)])
    book = appendBackstageCharacterReply(book, id, '看到了。', 4)
    book = replyToBackstageNote(book, id, '再看这个', 5, [img(2), img(3)])
    const messages = buildBackstageChatMessages({
      book, noteId: id, speakerName: '顾祁砚', userName: '周惟惟', heroineName: '宁梦曦',
      card: { description: '冷面律师', personality: '嘴硬' },
      contextSummary: '两人在雨夜吵了一架。', memories: ['★她怕打雷'], characterMemories: ['答应过陪她看海'],
      storyTail: ['宁梦曦：你走吧。', '顾祁砚：……我不走。'],
    })
    expect(messages[0].role).toBe('system')
    const system = textOf(messages[0].content)
    for (const piece of ['戏外小手机群', '宁梦曦', '冷面律师', '两人在雨夜吵了一架', '她怕打雷', '答应过陪她看海', '我不走', '第二篇：我才没吃醋', '她今天又护着谢聿衡', '不会、也不许改变剧情正文']) expect(system).toContain(piece)
    const turns = messages.filter((message) => message.role !== 'system')
    expect(turns.map((message) => message.role)).toEqual(['user', 'assistant', 'user'])
    // 只有她最新一句的图发出去，更早的图换成文字。
    expect(textOf(turns[0].content)).toContain('（她发了 1 张图）')
    expect(typeof turns[0].content).toBe('string')
    const last = turns[2].content as ChatApiContentPart[]
    expect(last.filter((part) => part.type === 'image_url').map((part) => part.type === 'image_url' ? part.image_url.url : '')).toEqual([img(2), img(3)])
    expect(messages[messages.length - 2].role).toBe('system')
    // 最后一句是他说的：不需要再请求。
    expect(buildBackstageChatMessages({ book: appendBackstageCharacterReply(book, id, '嗯', 6), noteId: id, speakerName: 'A', userName: 'U' })).toEqual([])
  })

  it('merges consecutive messages from her (e.g. after a failed reply)', () => {
    let book = seed()
    const id = book.notes[0].id
    book = replyToBackstageNote(book, id, '在吗', 3)
    book = replyToBackstageNote(book, id, '理理我', 4)
    const turns = buildBackstageChatMessages({ book, noteId: id, speakerName: 'A', userName: 'U' }).filter((message) => message.role !== 'system')
    expect(turns).toHaveLength(1)
    expect(textOf(turns[0].content)).toBe('在吗\n理理我')
  })

  it('keeps the request within the length caps', () => {
    let book = seed()
    const id = book.notes[1].id
    for (let i = 0; i < 40; i += 1) {
      book = replyToBackstageNote(book, id, `她${i}`.padEnd(2000, '啊'), 10 + i * 2)
      book = appendBackstageCharacterReply(book, id, `他${i}`.padEnd(2000, '嗯'), 11 + i * 2)
    }
    book = replyToBackstageNote(book, id, '最后一句', 200)
    const huge = '长'.repeat(20000)
    const messages = buildBackstageChatMessages({ book, noteId: id, speakerName: 'A', userName: 'U', card: { description: huge, personality: huge, scenario: huge }, contextSummary: huge, memories: Array(50).fill(huge), characterMemories: Array(50).fill(huge), storyTail: Array(50).fill(huge) })
    expect(textOf(messages[0].content).length).toBeLessThanOrEqual(BACKSTAGE_CHAT_LIMITS.system + 1)
    const turns = messages.filter((message) => message.role !== 'system')
    expect(turns.length).toBeLessThanOrEqual(BACKSTAGE_CHAT_LIMITS.threadTurns)
    for (const turn of turns) expect(textOf(turn.content).length).toBeLessThanOrEqual(BACKSTAGE_CHAT_LIMITS.turn + 2)
    expect(textOf(turns[turns.length - 1].content)).toBe('最后一句')
    expect(turns[turns.length - 1].role).toBe('user')
  })

  it('cleans status bars, tags, the [幕后:] shell and his name prefix', () => {
    expect(cleanBackstageChatReply('顾祁砚：[幕后:哼，谁吃醋了。]\n<status>地点：家</status>', '顾祁砚')).toBe('哼，谁吃醋了。')
    expect(cleanBackstageChatReply('<think>想想</think>好吧，就一点点。', '顾祁砚')).toBe('好吧，就一点点。')
  })

  it('builds a capped DM memory block from recent exchanges across stories', () => {
    let a = seed()
    a = replyToBackstageNote(a, a.notes[0].id, '你吃醋啦', 10)
    a = appendBackstageCharacterReply(a, a.notes[0].id, '没有', 11)
    let b = addBackstageNote(toggleBackstageWriter(undefined, 'a'), 'a', '另一本里的手记', 20)!
    b = replyToBackstageNote(b, b.notes[0].id, '晚安'.repeat(10), 30)
    b = appendBackstageCharacterReply(b, b.notes[0].id, '晚安，早点睡。', 31)
    const other = addBackstageNote(toggleBackstageWriter(undefined, 'z'), 'z', '别人的', 40)!
    const block = buildBackstageDmMemory([{ title: '雨夜', backstageNotebook: a }, { title: '海边', backstageNotebook: b }, { title: '别人', backstageNotebook: other }], 'a', '顾祁砚', '周惟惟')
    expect(block).toContain('幕后手记')
    expect(block).toContain('戏外')
    expect(block.indexOf('海边')).toBeLessThan(block.indexOf('雨夜'))
    expect(block).toContain('你：没有')
    expect(block).not.toContain('别人的')
    const capped = buildBackstageDmMemory(Array.from({ length: 30 }, (_, i) => ({ title: `本${i}`, backstageNotebook: appendBackstageCharacterReply(replyToBackstageNote(a, a.notes[0].id, '很长'.repeat(100), 100 + i), a.notes[0].id, '回'.repeat(200), 101 + i) })), 'a', '顾祁砚', '周惟惟', 700)
    const body = capped.split('\n').slice(2).join('\n')
    expect(body.length).toBeLessThanOrEqual(720)
    expect(buildBackstageDmMemory([{ backstageNotebook: seed() }], 'a', 'A', 'U')).toBe('')
  })
})
