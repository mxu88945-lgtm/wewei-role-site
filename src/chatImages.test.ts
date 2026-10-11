import { describe, expect, it } from 'vitest'
import { fitImageSize, imagePromptIndices, userContentWithImages } from './chatImages'
import { buildChatPrompt } from './promptBuilder'

const image = (id: string) => ({ id, dataUrl: `data:image/jpeg;base64,${id}`, width: 10, height: 10 })

describe('chat images', () => {
  it('downscales the long side only', () => {
    expect(fitImageSize(4032, 3024)).toEqual({ width: 1280, height: 960 })
    expect(fitImageSize(300, 200)).toEqual({ width: 300, height: 200 })
  })
  it('builds vision parts and a placeholder for old turns', () => {
    const parts = userContentWithImages('看这个', [image('a')], true)
    expect(Array.isArray(parts) && parts[1]).toMatchObject({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,a' } })
    expect(userContentWithImages('看这个', [image('a'), image('b')], false)).toBe('[用户发送了 2 张图片]\n看这个')
    expect(userContentWithImages('只有字', undefined, true)).toBe('只有字')
  })
  it('only the newest two image turns carry pixels', () => {
    const messages = [{ role: 'user', images: [image('1')] }, { role: 'assistant' }, { role: 'user', images: [image('2')] }, { role: 'user', images: [image('3')] }]
    expect([...imagePromptIndices(messages)].sort()).toEqual([2, 3])
  })
  it('sends the picture to the model inside the chat prompt', () => {
    const character = { id: 'c', name: '顾荒', tagline: '', description: '', personality: '', scenario: '', greeting: '', alternateGreetings: [], mesExample: '', creatorNotes: '', systemPrompt: '', postHistoryInstructions: '', beautificationProtocol: '', tags: [], creator: '', characterVersion: '', regexScripts: [], characterBook: { name: '', entries: [] } } as unknown as Parameters<typeof buildChatPrompt>[0]['character']
    const result = buildChatPrompt({ character, user: { name: '惟惟', description: '' }, messages: [{ role: 'user', text: '', images: [image('pic')] }], preset: '', globalWorldbook: '', memory: { entries: [], injectPosition: 'after-main-prompt', injectPrompt: '' }, memoryLength: 20 })
    const last = result.find((message) => Array.isArray(message.content))
    expect(last?.role).toBe('user')
    expect(JSON.stringify(last?.content)).toContain('data:image/jpeg;base64,pic')
  })
})
