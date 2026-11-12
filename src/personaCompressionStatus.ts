import { AUTO_COMPRESSION_FAILURE_COOLDOWN_MS, AUTO_COMPRESSION_KEEP_RECENT, AUTO_COMPRESSION_TRIGGER, planAutoContextCompression } from './contextCompression'
import { personaCompressedUntil, type PersonaMessage, type PersonaThread } from './personaWindow'

/** 与 maybeCompressPersonaContext 完全相同的可整理过滤：有正文、不是失败回复。 */
export const isPersonaCompressible = (message: Pick<PersonaMessage, 'text' | 'finishReason'>) => Boolean(message.text.trim()) && message.finishReason !== 'error'

export type PersonaCompressionFailure = { at: number; message: string }

export type PersonaCompressionBlocker =
  | { kind: 'disabled'; label: string }
  | { kind: 'api'; label: string }
  | { kind: 'cooldown'; label: string; failedAt: number; retryAt: number; reason: string }
  | { kind: 'running'; label: string }
  | { kind: 'busy'; label: string }
  | { kind: 'nothing'; label: string }

export type PersonaCompressionStatus = {
  /** 归档边界之后的可整理条数（触发计数）。 */
  outstanding: number
  trigger: number
  /** 本窗全部消息条数。 */
  total: number
  keepRecent: number
  archive?: { updatedAt?: number; through: number; fallback: boolean; text: string }
  blockers: PersonaCompressionBlocker[]
  /** X ≥ 240、计划非空、没有任何阻碍时才可「现在整理」。 */
  canCompressNow: boolean
}

export function formatPersonaStatusTime(at: number) {
  const date = new Date(at)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 人格窗口「连续性档案」状态：只读计算，条件与 maybeCompressPersonaContext 一一对应，
 * 这样卡片上写的就是后台真正会做 / 不会做的原因。
 */
export function personaCompressionStatus(input: {
  thread: Pick<PersonaThread, 'messages' | 'contextSummary' | 'compressedThroughId' | 'summaryFallback' | 'summaryUpdatedAt'>
  autoMemory: boolean
  memoryLength: number
  memoryApiReady: boolean
  chatApiReady: boolean
  running: boolean
  /** 正在回复这扇窗口，或这个人格正在提炼记忆（运行时同样会跳过）。 */
  busy?: boolean
  failure?: PersonaCompressionFailure
  now: number
}): PersonaCompressionStatus {
  const { thread } = input
  const compressedUntil = personaCompressedUntil(thread)
  const hasValidSummary = compressedUntil > 0
  const outstanding = thread.messages.slice(hasValidSummary ? compressedUntil : 0).filter(isPersonaCompressible).length
  const keepRecent = Math.max(AUTO_COMPRESSION_KEEP_RECENT, Math.floor(input.memoryLength || 0))
  const plan = planAutoContextCompression(thread.messages, { compressedUntil, hasValidSummary, memoryLength: input.memoryLength, isCompressible: isPersonaCompressible })
  const summary = thread.contextSummary?.trim() || ''
  const archive = summary ? { updatedAt: thread.summaryUpdatedAt, through: compressedUntil, fallback: Boolean(thread.summaryFallback), text: summary } : undefined

  const blockers: PersonaCompressionBlocker[] = []
  if (!input.autoMemory) blockers.push({ kind: 'disabled', label: '「自动维护连续性」已关闭' })
  if (!input.memoryApiReady && !input.chatApiReady) blockers.push({ kind: 'api', label: '记忆 API 和聊天 API 都没配置完整' })
  if (input.failure && input.now - input.failure.at < AUTO_COMPRESSION_FAILURE_COOLDOWN_MS) {
    const retryAt = input.failure.at + AUTO_COMPRESSION_FAILURE_COOLDOWN_MS
    const minutes = Math.max(1, Math.ceil((retryAt - input.now) / 60000))
    const reason = input.failure.message.trim() || '未知错误'
    blockers.push({ kind: 'cooldown', failedAt: input.failure.at, retryAt, reason, label: `上次失败：${formatPersonaStatusTime(input.failure.at)} · ${reason} · ${minutes} 分钟后重试` })
  }
  if (input.running) blockers.push({ kind: 'running', label: '正在整理连续性档案…' })
  else if (input.busy) blockers.push({ kind: 'busy', label: '正在回复或提炼记忆，结束后再整理' })
  if (outstanding >= AUTO_COMPRESSION_TRIGGER && !plan) blockers.push({ kind: 'nothing', label: `要保留最近 ${keepRecent} 条原文，暂时没有可整理的旧消息` })

  return {
    outstanding,
    trigger: AUTO_COMPRESSION_TRIGGER,
    total: thread.messages.length,
    keepRecent,
    archive,
    blockers,
    canCompressNow: Boolean(plan) && blockers.length === 0,
  }
}
