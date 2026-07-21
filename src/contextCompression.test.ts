import { describe, expect, it } from 'vitest'
import { planContextCompression, uncompressedMessages } from './contextCompression'

describe('context compression planning', () => {
  const messages = Array.from({ length: 40 }, (_, index) => index)

  it('首次压缩保留近期消息并压缩更早原文', () => {
    const plan = planContextCompression(messages, 20)
    expect(plan.keepRecent).toBe(10)
    expect(plan.targetUntil).toBe(30)
    expect(plan.pendingMessages).toEqual(messages.slice(0, 30))
  })

  it('再次压缩只处理上次之后新增的旧消息', () => {
    const plan = planContextCompression(messages, 20, 24, true)
    expect(plan.previousUntil).toBe(24)
    expect(plan.targetUntil).toBe(30)
    expect(plan.pendingMessages).toEqual(messages.slice(24, 30))
  })

  it('摘要有效时从模型上下文剔除已压缩原文，摘要失效时保留原文', () => {
    expect(uncompressedMessages(messages, 24, true)).toEqual(messages.slice(24))
    expect(uncompressedMessages(messages, 24, false)).toEqual(messages)
  })

  it('调大记忆长度后不会倒退压缩边界或重复处理旧消息', () => {
    const plan = planContextCompression(messages, 60, 24, true)
    expect(plan.targetUntil).toBe(24)
    expect(plan.pendingMessages).toEqual([])
  })
})
