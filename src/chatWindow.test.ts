import { describe, expect, it } from 'vitest'
import { CHAT_RENDER_WINDOW, chatWindowAnchorIncluding, earlierChatMessageCount, earlierChatWindowAnchor, resolveChatWindowStart, trimmedChatWindowAnchor } from './chatWindow'

const chat = (length: number) => Array.from({ length }, (_, index) => ({ id: index + 1 }))

describe('chat render window', () => {
  it('短对话全部渲染，长对话默认只渲染最近 60 条', () => {
    expect(resolveChatWindowStart(chat(40), null)).toBe(0)
    expect(resolveChatWindowStart(chat(300), null)).toBe(240)
    expect(CHAT_RENDER_WINDOW).toBe(60)
  })

  it('加载更早每次多 60 条，按钮显示剩余数量且不超过 60', () => {
    const messages = chat(150)
    const start = resolveChatWindowStart(messages, null)
    expect(start).toBe(90)
    expect(earlierChatMessageCount(start)).toBe(60)
    const anchor = earlierChatWindowAnchor(messages, start)
    const next = resolveChatWindowStart(messages, anchor)
    expect(next).toBe(30)
    expect(earlierChatMessageCount(next)).toBe(30)
    expect(resolveChatWindowStart(messages, earlierChatWindowAnchor(messages, next))).toBe(0)
    expect(earlierChatMessageCount(0)).toBe(0)
  })

  it('锚定到消息 id：新回复追加时窗口顶部不移动（阅读历史时不跳）', () => {
    const messages = chat(200)
    const anchor = messages[140].id
    expect(resolveChatWindowStart(messages, anchor)).toBe(140)
    expect(resolveChatWindowStart([...messages, { id: 201 }, { id: 202 }], anchor)).toBe(140)
  })

  it('锚点消息被撤回/删除后回到最近 60 条', () => {
    const messages = chat(100)
    expect(resolveChatWindowStart(messages.slice(0, 50), 80)).toBe(0)
    expect(resolveChatWindowStart(messages, 9999)).toBe(40)
  })

  it('搜索跳转到窗口之外的消息时扩展窗口并留出上文', () => {
    const messages = chat(300)
    const start = resolveChatWindowStart(messages, null)
    const anchor = chatWindowAnchorIncluding(messages, start, 50)
    expect(resolveChatWindowStart(messages, anchor)).toBe(40)
    expect(chatWindowAnchorIncluding(messages, start, 280)).toBe(messages[start].id)
  })

  it('跟随最新消息且渲染行数远超窗口时才收回到最近 60 条', () => {
    const messages = chat(200)
    expect(trimmedChatWindowAnchor(messages, 100, true)).toBeNull()
    expect(trimmedChatWindowAnchor(messages, 100, false)).toBeUndefined()
    expect(trimmedChatWindowAnchor(messages, 120, true)).toBeUndefined()
  })
})
