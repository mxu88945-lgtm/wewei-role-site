import type { Conversation, ConversationContextSnapshot, Message, ReplyAlternative } from './conversationLifecycle'
import type { LongMemoryEntry } from './memoryEngine'

const clone = <T,>(value: T): T => structuredClone(value)

export function captureConversationContext(source: Conversation, memories: LongMemoryEntry[], projectContext: Record<string, string> = {}): ConversationContextSnapshot {
  const validSummary = Boolean(source.contextSummary && (source.contextSummaryRevision || 0) === (source.historyRevision || 0))
  return clone({
    memories,
    characterMemories: source.characterMemories || {},
    contextSummary: validSummary ? source.contextSummary : undefined,
    compressedUntil: validSummary ? source.compressedUntil : undefined,
    memorySummarizedCount: source.memorySummarizedCount || 0,
    relationshipStages: source.relationshipStages,
    projectContext,
  })
}

/** Reuse identical states instead of storing the same memory bank on every reply. */
export function storeContextSnapshot(source: Conversation, snapshot: ConversationContextSnapshot, id: string) {
  const serialized = JSON.stringify(snapshot)
  const existing = Object.entries(source.contextSnapshots || {}).find(([, item]) => JSON.stringify(item) === serialized)
  if (existing) return { conversation: source, snapshotId: existing[0] }
  return { conversation: { ...source, contextSnapshots: { ...source.contextSnapshots, [id]: clone(snapshot) } }, snapshotId: id }
}

export function contextAtMessage(source: Conversation, message: Message) {
  return message.contextSnapshotId ? source.contextSnapshots?.[message.contextSnapshotId] : undefined
}

export function projectContextFromSnapshot(context: Record<string, string> | undefined, speakerId: string) {
  const text = context?.[speakerId]?.trim()
  if (!text) return ''
  return `【独立分线的历史场记快照】\n${text}\n\n【快照时态限定｜覆盖上方场记中的现在时规则】\n上方场记只记录存档点当时的情况，其中“最新”“唯一有效的现在”等字样只指存档当时，不代表之后每轮的现在。分线中用户和角色新写出的明确事实、地点、在场人物与已完成事件优先；不得把剧情拉回旧地点，不得重演已完成的事件。只继承本角色可知信息，不推断其他角色的秘密。`
}

export function restoreConversationContext(source: Conversation, messages: Message[], snapshot: ConversationContextSnapshot | undefined, revision = (source.historyRevision || 0) + 1) {
  return {
    ...source,
    messages,
    historyRevision: revision,
    characterMemories: clone(snapshot?.characterMemories || {}),
    contextSummary: snapshot?.contextSummary,
    contextSummaryRevision: snapshot?.contextSummary ? revision : undefined,
    compressedUntil: snapshot?.compressedUntil,
    memorySummarizedCount: Math.min(snapshot?.memorySummarizedCount || 0, messages.length),
    relationshipStages: clone(snapshot?.relationshipStages),
    projectContextSnapshot: clone(snapshot?.projectContext || {}),
    updatedAt: Date.now(),
  } satisfies Conversation
}

export function replyAlternatives(message: Message): ReplyAlternative[] {
  const current = { text: message.text, finishReason: message.finishReason, contextSnapshotId: message.contextSnapshotId }
  return message.alternatives?.length ? message.alternatives.map((item, index) => index === (message.selectedAlternative || 0) ? current : item) : [current]
}

export function appendReplyAlternative(original: Message, generated: Message): Message {
  const alternatives = [...replyAlternatives(original), { text: generated.text, finishReason: generated.finishReason, contextSnapshotId: generated.contextSnapshotId }]
  return { ...generated, id: original.id, alternatives, selectedAlternative: alternatives.length - 1 }
}

export function selectReplyAlternative(message: Message, index: number): Message {
  const alternatives = replyAlternatives(message)
  const chosen = alternatives[index]
  if (!chosen || !Number.isInteger(index)) return message
  return { ...message, ...chosen, alternatives, selectedAlternative: index }
}

/** Never inherit today's memories when branching into an unsnapshotted past. */
export function forkConversationAtMessage(source: Conversation, messageId: number, currentContext: ConversationContextSnapshot, id: string, title: string) {
  const index = source.messages.findIndex((message) => message.id === messageId)
  if (index < 0) throw new Error('找不到分叉位置')
  const isLatest = index === source.messages.length - 1
  const message = source.messages[index]
  const snapshot = isLatest ? currentContext : contextAtMessage(source, message)
  const restored = restoreConversationContext(source, clone(source.messages.slice(0, index + 1)), snapshot, 0)
  const referencedSnapshots = new Set(restored.messages.flatMap((item) => [item.contextSnapshotId, ...(item.alternatives || []).map((alternative) => alternative.contextSnapshotId)]).filter(Boolean))
  const conversation: Conversation = {
    ...restored,
    id, title, createdAt: Date.now(),
    temporaryPlot: undefined,
    fork: { parentId: source.id, messageId, createdAt: Date.now() },
    bookmarks: Object.fromEntries(Object.entries(source.bookmarks || {}).filter(([key]) => restored.messages.some((item) => String(item.id) === key))),
    contextSnapshots: clone(Object.fromEntries(Object.entries(source.contextSnapshots || {}).filter(([key]) => referencedSnapshots.has(key)))),
  }
  return { conversation, memories: clone(snapshot?.memories || []).map((entry) => ({ ...entry, historyRevision: 0 })), hasSnapshot: Boolean(snapshot) }
}
