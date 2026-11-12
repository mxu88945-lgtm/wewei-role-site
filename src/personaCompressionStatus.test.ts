import { describe, expect, it } from 'vitest'
import { AUTO_COMPRESSION_FAILURE_COOLDOWN_MS } from './contextCompression'
import { personaCompressionStatus } from './personaCompressionStatus'
import type { PersonaMessage } from './personaWindow'

const msgs = (count: number, start = 1): PersonaMessage[] => Array.from({ length: count }, (_, index) => ({ id: start + index, role: index % 2 ? 'assistant' : 'user', text: `第${start + index}条`, createdAt: start + index }))
const base = { autoMemory: true, memoryLength: 40, memoryApiReady: true, chatApiReady: true, running: false, now: 1_000_000_000 }

describe('人格窗口连续性档案状态', () => {
  it('没整理过：数所有可整理消息，空正文与失败回复不算', () => {
    const messages = [...msgs(10), { id: 11, role: 'assistant' as const, text: '  ', createdAt: 11 }, { id: 12, role: 'assistant' as const, text: '半截', finishReason: 'error', createdAt: 12 }]
    const status = personaCompressionStatus({ ...base, thread: { messages } })
    expect(status.outstanding).toBe(10)
    expect(status.total).toBe(12)
    expect(status.trigger).toBe(240)
    expect(status.archive).toBeUndefined()
    expect(status.canCompressNow).toBe(false)
    expect(status.blockers).toEqual([])
  })

  it('有档案：只数边界之后的，显示整理到第 N 条和保留条数', () => {
    const status = personaCompressionStatus({ ...base, memoryLength: 120, thread: { messages: msgs(300), contextSummary: '档案', compressedThroughId: 144, summaryFallback: true, summaryUpdatedAt: 123 } })
    expect(status.outstanding).toBe(156)
    expect(status.archive).toEqual({ updatedAt: 123, through: 144, fallback: true, text: '档案' })
    expect(status.keepRecent).toBe(120)
  })

  it('满 240 且无阻碍时才可现在整理', () => {
    expect(personaCompressionStatus({ ...base, thread: { messages: msgs(239) } }).canCompressNow).toBe(false)
    expect(personaCompressionStatus({ ...base, thread: { messages: msgs(240) } }).canCompressNow).toBe(true)
  })

  it('关闭开关、两个 API 都不完整、正在整理都会阻止', () => {
    const status = personaCompressionStatus({ ...base, autoMemory: false, memoryApiReady: false, chatApiReady: false, running: true, thread: { messages: msgs(260) } })
    expect(status.blockers.map((item) => item.kind)).toEqual(['disabled', 'api', 'running'])
    expect(status.canCompressNow).toBe(false)
    // 只要有一个 API 完整就不算阻碍（运行时用记忆 API，没有就退回聊天 API）。
    expect(personaCompressionStatus({ ...base, memoryApiReady: false, thread: { messages: msgs(260) } }).canCompressNow).toBe(true)
  })

  it('30 分钟冷却内显示失败时间、原因和剩余分钟，过了冷却就恢复', () => {
    const failure = { at: base.now - 10 * 60 * 1000, message: 'HTTP 500' }
    const status = personaCompressionStatus({ ...base, failure, thread: { messages: msgs(260) } })
    const cooldown = status.blockers.find((item) => item.kind === 'cooldown')
    expect(cooldown?.label).toMatch(/^上次失败：.+ · HTTP 500 · 20 分钟后重试$/)
    expect(status.canCompressNow).toBe(false)
    const later = personaCompressionStatus({ ...base, now: failure.at + AUTO_COMPRESSION_FAILURE_COOLDOWN_MS, failure, thread: { messages: msgs(260) } })
    expect(later.blockers).toEqual([])
    expect(later.canCompressNow).toBe(true)
  })

  it('保留原文条数大于可整理范围时不给按钮并说明原因', () => {
    const status = personaCompressionStatus({ ...base, memoryLength: 400, thread: { messages: msgs(260) } })
    expect(status.blockers.map((item) => item.kind)).toEqual(['nothing'])
    expect(status.canCompressNow).toBe(false)
  })
})
