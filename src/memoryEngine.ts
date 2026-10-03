export type LongMemoryEntry = {
  id?: string
  createdAt?: number
  title?: string
  content: string
  sourceCount?: number
  pinned?: boolean
  consolidated?: boolean
  historyRevision?: number
  restoredFromId?: string
}

export type LongMemoryMap = Record<string, LongMemoryEntry[]>

const revisionOf = (entry: LongMemoryEntry) => entry.historyRevision || 0

export function memoriesForConversation(map: LongMemoryMap, conversationId: string | undefined, legacyCharacterId: string, historyRevision?: number) {
  const entries = (conversationId && map[conversationId]) || map[legacyCharacterId] || []
  return typeof historyRevision === 'number' ? entries.filter((entry) => revisionOf(entry) === historyRevision) : entries
}

export function archivedMemoriesForConversation(map: LongMemoryMap, conversationId: string | undefined, legacyCharacterId: string, historyRevision: number) {
  const entries = memoriesForConversation(map, conversationId, legacyCharacterId)
  return entries.filter((entry) => revisionOf(entry) !== historyRevision)
}

export function restoreMemoryToRevision(entry: LongMemoryEntry, historyRevision: number, id: string = crypto.randomUUID()): LongMemoryEntry {
  return {
    ...entry,
    id,
    title: `${entry.title || '长期记忆'} · 从历史分支恢复`,
    historyRevision,
    restoredFromId: entry.id,
  }
}

/** Replace one branch's memories without deleting archived memories from older branches. */
export function replaceConversationMemories(map: LongMemoryMap, conversationId: string | undefined, legacyCharacterId: string, historyRevision: number, entries: LongMemoryEntry[]) {
  const key = conversationId || legacyCharacterId
  const source = map[key] || []
  return { ...map, [key]: [...source.filter((entry) => revisionOf(entry) !== historyRevision), ...entries] }
}

function searchTerms(value: string) {
  const terms = new Set<string>()
  for (const run of value.toLocaleLowerCase().match(/[\u4e00-\u9fff]+|[a-z0-9_]{3,}/g) || []) {
    if (!/[\u4e00-\u9fff]/.test(run)) { terms.add(run); continue }
    for (let width = 2; width <= 3; width += 1) for (let i = 0; i + width <= run.length; i += 1) terms.add(run.slice(i, i + width))
  }
  return [...terms].slice(-240)
}

/**
 * Core memories are permanent background, while ordinary memories are chosen
 * by relevance with a small recent-event fallback.  Keeping this block bounded
 * matters: an ever-growing memory prompt can drown out the live scene and make
 * the model follow old context more strongly than the current user message.
 */
export function selectRelevantMemories(entries: LongMemoryEntry[], recentText: string, maxChars = 6000, maxOrdinaryEntries = 8) {
  const terms = searchTerms(recentText)
  const pinned = entries.filter((entry) => entry.pinned).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  const ordinary = entries.filter((entry) => !entry.pinned)
  const newestEntries = new Set(ordinary.slice(-3))
  const ranked = ordinary.map((entry) => {
    const content = entry.content.toLocaleLowerCase()
    return { entry, score: terms.reduce((score, term) => score + (content.includes(term) ? Math.min(8, term.length) : 0), 0) + (newestEntries.has(entry) ? 6 : 0) }
  }).sort((a, b) => b.score - a.score || (b.entry.createdAt || 0) - (a.entry.createdAt || 0))

  const selected: LongMemoryEntry[] = [...pinned]
  let remaining = Math.max(0, maxChars - pinned.reduce((sum, entry) => sum + entry.content.trim().length, 0))
  let ordinaryCount = 0
  for (const entry of ranked.map((item) => item.entry)) {
    if (selected.includes(entry) || remaining <= 0) continue
    if (ordinaryCount >= Math.max(1, maxOrdinaryEntries)) continue
    const contentLength = entry.content.trim().length
    if (!contentLength) continue
    if (contentLength > remaining && selected.length) continue
    selected.push(entry)
    ordinaryCount += 1
    remaining -= Math.min(contentLength, remaining)
  }
  return selected.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
}
