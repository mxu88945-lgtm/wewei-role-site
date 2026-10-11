import { describe, expect, it } from 'vitest'
import { AUTO_COMPRESSION_FAILURE_COOLDOWN_MS, AUTO_COMPRESSION_KEEP_RECENT, canApplyContextCompression, planAutoContextCompression, planContextCompression, shouldStartAutoCompression, uncompressedMessages } from './contextCompression'

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

describe('automatic background context compression', () => {
  const chat = (length: number) => Array.from({ length }, (_, index) => ({ id: index + 1, text: `m${index}` }))

  it('未达到 240 条可压缩消息时不整理', () => {
    expect(planAutoContextCompression(chat(239), { memoryLength: 47 })).toBeNull()
  })

  it('达到 240 条时整理较早原文，保留最近 96 条逐字', () => {
    const messages = chat(240)
    const plan = planAutoContextCompression(messages, { memoryLength: 47 })!
    expect(plan.keepRecent).toBe(AUTO_COMPRESSION_KEEP_RECENT)
    expect(plan.previousUntil).toBe(0)
    expect(plan.targetUntil).toBe(144)
    expect(plan.pendingMessages).toEqual(messages.slice(0, 144))
  })

  it('已有有效摘要时只计算边界之后的消息', () => {
    const messages = chat(350)
    expect(planAutoContextCompression(messages, { compressedUntil: 144, hasValidSummary: true, memoryLength: 47 })).toBeNull()
    const plan = planAutoContextCompression(chat(384), { compressedUntil: 144, hasValidSummary: true, memoryLength: 47 })!
    expect(plan.previousUntil).toBe(144)
    expect(plan.targetUntil).toBe(288)
  })

  it('摘要因改写失效时从头重新计算', () => {
    const plan = planAutoContextCompression(chat(260), { compressedUntil: 144, hasValidSummary: false, memoryLength: 47 })!
    expect(plan.previousUntil).toBe(0)
    expect(plan.targetUntil).toBe(164)
  })

  it('不可压缩的消息（发送失败占位）不计数，也不送去整理', () => {
    const messages = chat(250).map((message, index) => index % 10 === 0 ? { ...message, text: '' } : message)
    const isCompressible = (message: { text: string }) => Boolean(message.text)
    expect(planAutoContextCompression(messages, { memoryLength: 47, isCompressible })).toBeNull()
    const plan = planAutoContextCompression(chat(300).map((message, index) => index % 10 === 0 ? { ...message, text: '' } : message), { memoryLength: 47, isCompressible })!
    expect(plan.pendingMessages.every(isCompressible)).toBe(true)
  })

  it('记忆长度大于 96 时不折叠仍会逐字发送的消息', () => {
    const plan = planAutoContextCompression(chat(300), { memoryLength: 150 })!
    expect(plan.keepRecent).toBe(150)
    expect(plan.targetUntil).toBe(150)
  })

  it('正在压缩、API 未配置或失败冷却中时不启动', () => {
    const plan = planAutoContextCompression(chat(240), {})
    const now = 10_000_000
    expect(shouldStartAutoCompression({ plan, running: false, apiReady: true, now })).toBe(true)
    expect(shouldStartAutoCompression({ plan: null, running: false, apiReady: true, now })).toBe(false)
    expect(shouldStartAutoCompression({ plan, running: true, apiReady: true, now })).toBe(false)
    expect(shouldStartAutoCompression({ plan, running: false, apiReady: false, now })).toBe(false)
    expect(shouldStartAutoCompression({ plan, running: false, apiReady: true, now, lastFailureAt: now - 60_000 })).toBe(false)
    expect(shouldStartAutoCompression({ plan, running: false, apiReady: true, now, lastFailureAt: now - AUTO_COMPRESSION_FAILURE_COOLDOWN_MS - 1 })).toBe(true)
  })

  it('压缩期间历史被改写、边界被其它压缩推进或原文被截短时不写入摘要', () => {
    const started = { revision: 2, previousUntil: 0, targetUntil: 144 }
    const base = { messages: chat(240), historyRevision: 2 }
    expect(canApplyContextCompression(base, started)).toBe(true)
    expect(canApplyContextCompression({ ...base, historyRevision: 3 }, started)).toBe(false)
    expect(canApplyContextCompression({ ...base, contextSummary: 's', contextSummaryRevision: 2, compressedUntil: 100 }, started)).toBe(false)
    expect(canApplyContextCompression({ ...base, contextSummary: 's', contextSummaryRevision: 1, compressedUntil: 100 }, started)).toBe(true)
    expect(canApplyContextCompression({ ...base, messages: chat(100) }, started)).toBe(false)
    expect(canApplyContextCompression(undefined, started)).toBe(false)
  })
})
