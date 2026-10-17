import { describe, expect, it } from 'vitest'
import { attachmentPromptIndices, attachmentPromptText, isReadableAttachment, prepareChatAttachment } from './chatAttachments'
import { buildChatPrompt } from './promptBuilder'
import type { Character } from './characterCard'

const character = {
  id: 'qin', name: '秦放', tagline: '', description: '', personality: '', scenario: '', greeting: '', alternateGreetings: [], mesExample: '',
  creatorNotes: '', systemPrompt: '', postHistoryInstructions: '', beautificationProtocol: '', tags: [], creator: '', characterVersion: '', regexScripts: [],
} as unknown as Character

describe('小手机文字附件', () => {
  it('accepts common text documents and rejects opaque binary files', () => {
    expect(isReadableAttachment({ name: '聊天.txt', type: '' })).toBe(true)
    expect(isReadableAttachment({ name: '资料.json', type: 'application/json' })).toBe(true)
    expect(isReadableAttachment({ name: '合同.pdf', type: 'application/pdf' })).toBe(false)
  })

  it('extracts text and describes it to the model', async () => {
    const attachment = await prepareChatAttachment(new File(['hello'], 'note.txt', { type: 'text/plain' }))
    expect(attachment.text).toBe('hello')
    expect(attachmentPromptText([attachment])).toContain('【附件：note.txt')
    expect(attachmentPromptText([attachment])).toContain('hello')
  })

  it('only sends the newest attachment turn in full', () => {
    const attachment = { id: 'a', name: 'a.txt', mimeType: 'text/plain', size: 1, text: 'a' }
    const messages = [{ role: 'user', attachments: [attachment] }, { role: 'assistant' }, { role: 'user', attachments: [attachment] }]
    expect([...attachmentPromptIndices(messages)]).toEqual([2])
    expect(attachmentPromptText([attachment], false)).toBe('[用户此前发送了附件：a.txt]')
  })

  it('places extracted attachment text in the actual chat request', () => {
    const attachment = { id: 'a', name: '剧情.txt', mimeType: 'text/plain', size: 8, text: '秦放需要读到这一句' }
    const result = buildChatPrompt({ mode: 'phone', character, user: { name: '惟惟', description: '' }, messages: [{ role: 'user', text: '你看看', attachments: [attachment] }], preset: '', globalWorldbook: '', memory: { entries: [], injectPosition: 'after-main-prompt', injectPrompt: '' }, memoryLength: 20 })
    const user = [...result].reverse().find((message) => message.role === 'user')
    expect(String(user?.content)).toContain('附件：剧情.txt')
    expect(String(user?.content)).toContain('秦放需要读到这一句')
  })
})
