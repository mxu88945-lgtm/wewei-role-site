import { describe, expect, it } from 'vitest'
import { isFullHtmlDocument, isPendingAssistantText, normalizeMixedMarkup, plainTextParagraphs, userTextParagraphs } from './MessageContent'

describe('character-card mixed markup', () => {
  it('renders Tavo-style plot fences, inline thoughts and paragraph spacing', () => {
    const result = normalizeMixedMarkup('<plot>\n```\n⏰时间:2034年01月09日 09:38\n🗺️地点:H市\n```\n</plot>\n\n*动作*与`心理`')

    expect(result).toContain('<div class="message-code-block">')
    expect(result).toContain('<span class="message-paragraph-break"></span>')
    expect(result).toContain('<em>动作</em>')
    expect(result).toContain('<span class="message-inline-code">心理</span>')
  })

  it('keeps character-card style blocks in the sandbox renderer', () => {
    expect(isFullHtmlDocument('<style>.bubble{border-radius:18px}</style><div class="bubble">妈在？</div>')).toBe(true)
  })

  it('does not turn pretty-printed HTML indentation into visible blank lines', () => {
    const source = `<div class="inline-chat-container">
      <div class="sender-name">秦放</div>
      <div class="ios-bubble">
        <p class="message-text">到家了吗？</p>
      </div>
    </div>`
    const result = normalizeMixedMarkup(source)
    expect(result).not.toContain('<br>')
    expect(result).not.toContain('message-paragraph-break')
    expect(result).toContain('<p class="message-text">到家了吗？</p>')
  })

  it('visually paragraphs a long single-block Chinese narrative without changing its text', () => {
    const source = '他乡，承受着怀孕的辛苦，还要面对那些恶毒的言语和替身的羞辱。她一个人到底是怎么熬过来的？当她知道自己怀孕，满心欢喜却又充满恐惧的时候，我却在为了方玫跟她大发雷霆。我甚至还对她说，这个孩子生下来要给方玫养。顾荒低下头，看着你那只轻轻抚摸着小腹的手。那只手曾经在无数个深夜里为他调音，如今却只能独自护着你们的孩子。'
    const paragraphs = plainTextParagraphs(source)
    expect(paragraphs.length).toBeGreaterThan(1)
    expect(paragraphs.join('')).toBe(source)
  })

  it('leaves short bubble messages as one paragraph', () => {
    expect(plainTextParagraphs('妈在？')).toEqual(['妈在？'])
  })

  it('does not auto-split a long user message and preserves only explicit line breaks', () => {
    const source = '刚踏入江氏就被亲哥迎面截胡，递见了陆景澄的一瞬尴尬，随即把手里的资料往江叙川身上一塞，带着点娇嗔。小嘴撇了撇后看向陆景澄，然后转过头看向江叙川。'
    expect(userTextParagraphs(source)).toEqual([source])
    expect(userTextParagraphs('第一行\n第二行\n\n下一段')).toEqual(['第一行\n第二行', '下一段'])
  })

  it('adds visual paragraph breaks to long narrative inside inline character-card markup', () => {
    const narrative = '你哭累后那句软着声音的话，像是一把生锈的钝刀，在顾荒自以为坚不可摧的心脏上疯狂搅弄。你轻抚小腹的动作，让他那双总是不可一世的眼睛里，再次蓄满了猩红的泪水。她怀着我的孩子，却每天担惊受怕。顾荒低下头，看着你那只轻轻抚摸着小腹的手。'
    const result = normalizeMixedMarkup(`<plot>⏰时间:2034年02月18日</plot>${narrative}`)
    expect(result.match(/<p class="message-story-paragraph">/g)?.length).toBeGreaterThan(1)
  })
  it('does not synthesize a status panel for the pending response placeholder', () => {
    expect(isPendingAssistantText('正在回应…')).toBe(true)
    expect(isPendingAssistantText('正在回应...')).toBe(true)
    expect(isPendingAssistantText('他正在回应你的问题。')).toBe(false)
  })

})

describe('Tavo-style ```html code blocks', () => {
  it('splits each fenced page from the story text around it', async () => {
    const { splitHtmlFences } = await import('./MessageContent')
    const text = '```html\n<!DOCTYPE html><html><body><div>主页</div></body></html>\n```\n\n```html\n<!DOCTYPE html><html><body><div class="player">播放器</div></body></html>\n```\n\n北江市的冬雨。\n\n```html\n<div id="returnHomeText">返回</div>\n```'
    const segments = splitHtmlFences(text)!
    expect(segments.map((segment) => segment.kind)).toEqual(['html', 'html', 'text', 'html'])
    expect(segments[0].value.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(segments[0].value).not.toContain('```')
    expect(segments[2].value).toBe('北江市的冬雨。')
  })
  it('leaves messages without fenced HTML alone', async () => {
    const { splitHtmlFences } = await import('./MessageContent')
    expect(splitHtmlFences('普通的回复\n```\n代码\n```')).toBeNull()
    expect(splitHtmlFences('<div>行内</div>')).toBeNull()
  })
})
