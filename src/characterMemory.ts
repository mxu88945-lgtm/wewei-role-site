import {
  CHARACTER_MEMORY_CATEGORY_OPTIONS,
  CHARACTER_MEMORY_STATUS_OPTIONS,
  createCharacterMemoryEntry,
  type Character,
  type CharacterMemoryCategory,
  type CharacterMemoryEntry,
  type CharacterMemoryStatus,
} from './characterCard'
import { stripUiOnlyStatusBlocks } from './modelContext'

const categoryLabels = Object.fromEntries(CHARACTER_MEMORY_CATEGORY_OPTIONS.map((item) => [item.value, item.label])) as Record<string, string>
const statusLabels = Object.fromEntries(CHARACTER_MEMORY_STATUS_OPTIONS.map((item) => [item.value, item.label])) as Record<string, string>

const categoryAliases: Record<string, CharacterMemoryCategory> = {
  event: 'event',
  '重大事件': 'event',
  task: 'task',
  '任务进度': 'task',
  truth: 'truth',
  '已查明真相': 'truth',
  relationship: 'relationship',
  '关系定论': 'relationship',
  fact: 'fact',
  '重要事实': 'fact',
}

const statusAliases: Record<string, CharacterMemoryStatus> = {
  confirmed: 'confirmed',
  '已确认': 'confirmed',
  completed: 'completed',
  '已完成': 'completed',
  ongoing: 'ongoing',
  '进行中': 'ongoing',
  superseded: 'superseded',
  '已撤销/被更新': 'superseded',
  '已撤销': 'superseded',
  '被更新': 'superseded',
}

/**
 * This is intentionally a separate extraction pass from the editable rolling
 * summary. The normal summary may retain clues and open threads; this pass is
 * only allowed to emit facts that are safe to pin permanently to one card.
 */
export const characterMemoryExtractionPrompt = `【角色卡核心记忆自动提炼器｜只输出 JSON，不要续写剧情】
你要从“本次新增对话”里找出值得永久写入当前角色卡的核心记忆。角色卡记忆会长期注入模型，只有高置信度、已经落地的事实才可以进入。

只允许记录：
- 已经明确发生的重大事件；
- 已经明确完成的任务、调查或行动；
- 已经查明、被证据确认或被对话明确纠正的真相；
- 已经明确成立且必须持续保持的关系定论或重要事实。

严格禁止记录：
- 线索、猜测、怀疑、传闻、角色内心推断；
- 计划、承诺但尚未完成的事，或任何“进行中”事项；
- 只在旧长期记忆、开场白或状态栏里出现、但本次新增对话没有确认的内容；
- 模型自己补写的动机、幕后真相、日期、地点、用户未做出的决定；
- 普通寒暄、临时情绪、场景氛围和不会影响后续连续性的细节。

只记录当前角色已经亲自经历、知道或在本次对话中明确确认的事实。不要把角色不知道的幕后信息塞进角色私有认知。
如果没有符合条件的内容，返回 {"memories":[]}。

输出必须是一个 JSON 对象，不要 Markdown 代码围栏、解释或其他文字：
{"memories":[{"title":"简短标题","content":"用一两句话写已经发生的事实及其结果","category":"event|task|truth|relationship|fact","status":"confirmed|completed"}]}

每一条都必须是独立事实；不要把多个未确认线索拼成真相。已有角色私有记忆只用于查重和识别状态更新，不要重复输出完全相同的事实。`

export const characterMemorySummaryProtocol = `【角色卡核心记忆同次提炼协议】
在完成普通长期记忆总结后，再在正文末尾追加一个机器读取区块。普通总结仍按前面的长期记忆格式输出；不要把下面这个区块的 JSON 内容混进普通总结正文。

只有当前角色已经明确经历、知道或在本次新增对话中确认的核心事实，才可以写入。只允许：已发生的重大事件、已完成的任务或调查、已查明的真相、已成立且必须保持的关系定论或重要事实。
禁止写入猜测、怀疑、传闻、线索、计划、未完成事项、进行中事项、角色不知道的幕后信息，以及模型自行补写的动机、日期、结局。
每条状态只能是 confirmed 或 completed；没有符合条件的内容就返回空数组。
已有角色私有记忆只用于查重和识别旧状态更新，不要重复输出完全相同的事实。

区块必须严格放在普通总结最后，且只包含一个 JSON 对象，不要 Markdown 围栏、解释或其他文字：
<character_core_memories>
{"memories":[{"title":"简短标题","content":"已经发生的事实及其结果","category":"event|task|truth|relationship|fact","status":"confirmed|completed"}]}
</character_core_memories>

客户端会自动移除整个区块，不会把它显示在普通长期记忆里。`

export function splitCharacterMemorySummary(raw: string) {
  const payloads: string[] = []
  const summary = raw.replace(/<character_core_memories\b[^>]*>([\s\S]*?)<\/character_core_memories>/gi, (_match, payload: string) => {
    payloads.push(payload.trim())
    return ''
  }).trim()
  return { summary, coreMemoryPayload: payloads.join('\n') }
}

type CharacterMemoryExtractionOptions = {
  sourceMemoryId?: string
  now?: number
}

const stringValue = (value: unknown) => typeof value === 'string' ? value.trim() : ''

function balancedJsonFragments(raw: string) {
  const fragments: string[] = []
  for (let start = 0; start < raw.length; start += 1) {
    if (raw[start] !== '{' && raw[start] !== '[') continue
    let depth = 0
    let quoted = false
    let escaped = false
    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index]
      if (quoted) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') quoted = false
        continue
      }
      if (char === '"') {
        quoted = true
        continue
      }
      if (char === '{' || char === '[') depth += 1
      if (char === '}' || char === ']') depth -= 1
      if (depth === 0) {
        fragments.push(raw.slice(start, index + 1))
        break
      }
    }
  }
  return fragments
}

function extractionItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  const object = value as Record<string, unknown>
  for (const key of ['memories', 'entries', 'items', 'data']) {
    if (Array.isArray(object[key])) return object[key]
  }
  return typeof object.title === 'string' || typeof object.content === 'string' || typeof object.summary === 'string' ? [object] : []
}

function parseExtractionPayload(raw: string) {
  const codeFence = String.fromCharCode(96).repeat(3)
  const cleaned = raw
    .replace(new RegExp('^\\s*' + codeFence + '(?:json)?\\s*', 'i'), '')
    .replace(new RegExp('\\s*' + codeFence + '\\s*$', 'i'), '')
    .trim()
  const candidates = [cleaned, ...balancedJsonFragments(cleaned)]
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      const items = extractionItems(parsed)
      if (items.length || (parsed && typeof parsed === 'object' && 'memories' in parsed)) return items
    } catch {
      // Some providers prepend a sentence despite the JSON-only rule; the
      // balanced fragments below still recover a valid object.
    }
  }
  return []
}

const normalizedMemoryText = (value: string) => value
  .toLocaleLowerCase()
  .replace(/[\s，。！？；：、“”‘’"'（）()【】［］《》<>…,.!?;:/\\|·]/g, '')

function memoryTerms(value: string) {
  return new Set(value.match(/[\u4e00-\u9fff]{2,4}|[a-z0-9]{3,}/gi) || [])
}

function nearDuplicate(left: CharacterMemoryEntry, right: CharacterMemoryEntry) {
  const leftTitle = normalizedMemoryText(left.title)
  const rightTitle = normalizedMemoryText(right.title)
  if (leftTitle.length >= 4 && leftTitle === rightTitle) return true

  const leftContent = normalizedMemoryText(left.content)
  const rightContent = normalizedMemoryText(right.content)
  if (leftContent && leftContent === rightContent) return true
  if (left.category !== right.category) return false

  const leftTerms = memoryTerms(left.content)
  const rightTerms = memoryTerms(right.content)
  if (leftTerms.size < 3 || rightTerms.size < 3) return false
  let shared = 0
  leftTerms.forEach((term) => { if (rightTerms.has(term)) shared += 1 })
  return shared / Math.max(leftTerms.size, rightTerms.size) >= .72
}

/** Parse and strictly filter the model's JSON before anything touches a card. */
export function parseCharacterMemoryCandidates(raw: string, options: CharacterMemoryExtractionOptions = {}) {
  const now = options.now || Date.now()
  const seen = new Set<string>()
  const entries: CharacterMemoryEntry[] = []

  for (const item of parseExtractionPayload(raw)) {
    if (!item || typeof item !== 'object') continue
    const object = item as Record<string, unknown>
    const title = stringValue(object.title || object.name || object.subject)
    const content = stripUiOnlyStatusBlocks(stringValue(object.content || object.summary || object.fact)).trim()
    const rawCategory = stringValue(object.category || object.type)
    const rawStatus = stringValue(object.status || object.state)
    const category = categoryAliases[rawCategory] || 'fact'
    const status = statusAliases[rawStatus]

    // Auto-promotion is deliberately narrower than the manual editor: an
    // omitted or unknown status is rejected instead of silently becoming fact.
    if (!title || !content || !status || !(['confirmed', 'completed'] as CharacterMemoryStatus[]).includes(status)) continue
    if (/(可能|也许|或许|疑似|推测|猜测|怀疑|传闻|据说|未证实|尚未|待查|未知|不确定|进行中|未完成|调查中)/.test(content)) continue
    const key = category + ':' + normalizedMemoryText(title) + ':' + normalizedMemoryText(content)
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(createCharacterMemoryEntry({
      title: title.slice(0, 120),
      content: content.slice(0, 1800),
      category,
      status,
      enabled: true,
      createdAt: now,
      updatedAt: now,
      sourceMemoryId: options.sourceMemoryId,
      autoGenerated: true,
    }))
  }
  return entries
}

/** Merge automatic facts without duplicating a truth every time a summary runs. */
export function mergeCharacterMemoryEntries(existing: CharacterMemoryEntry[], incoming: CharacterMemoryEntry[]) {
  const merged = existing.slice()
  for (const candidate of incoming) {
    const matchIndex = merged.findIndex((entry) => nearDuplicate(entry, candidate))
    if (matchIndex < 0) {
      merged.push(candidate)
      continue
    }

    const previous = merged[matchIndex]
    const sameContent = normalizedMemoryText(previous.content) === normalizedMemoryText(candidate.content)
    if (previous.status === 'superseded' || (!sameContent && previous.autoGenerated !== true && previous.status !== 'ongoing')) continue
    // A later confirmed/completed extraction may close an older manually
    // entered ongoing item. Keep a user's disabled choice intact.
    merged[matchIndex] = {
      ...previous,
      title: candidate.title,
      content: candidate.content,
      category: candidate.category,
      status: candidate.status,
      enabled: previous.enabled,
      updatedAt: candidate.updatedAt,
      sourceMemoryId: candidate.sourceMemoryId || previous.sourceMemoryId,
      autoGenerated: true,
    }
  }
  return merged
}

export function activeCharacterMemory(character: Character) {
  return (character.characterMemory || [])
    .filter((entry) => entry.enabled !== false && entry.content.trim())
    .slice()
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
}

export function characterMemoryPrompt(character: Character, maxChars = 12000) {
  const entries = activeCharacterMemory(character)
  if (!entries.length) return ''

  const lines: string[] = []
  let used = 0
  for (const entry of entries) {
    const content = stripUiOnlyStatusBlocks(entry.content).trim()
    if (!content) continue
    const line = `- 【${categoryLabels[entry.category] || '重要事实'}｜${statusLabels[entry.status] || '已确认'}】${entry.title}\n  ${content}`
    if (used + line.length > maxChars && lines.length) continue
    lines.push(line)
    used += line.length
  }
  if (!lines.length) return ''

  return `【角色私有长期记忆｜固定连续性档案】
以下事实只属于“${character.name}”这张角色卡，优先级高于会滚动的近期摘要，也高于角色卡开场白或旧状态栏里已经过时的阶段描述；但低于当前用户消息、最近对话原文和明确的新事实。
${lines.join('\n')}

使用规则：
1. “已确认”和“已完成”表示事情已经发生并且已经得到结论；不得把它们重新写成未知、待查、第一次发现或尚未完成。
2. “进行中”才是当前未完成事项；只能沿用已知进度，不能擅自宣布完成。
3. “已撤销/被更新”只作为历史后果保留，不得让旧状态重新生效。
4. 如果当前可见对话明确纠正了某条记忆，以更新后的事实为准；不要为了维护旧档案而否认新事实。
5. 如果开场白、旧状态卡、近期摘要仍写着“待查”“尚未完成”或类似旧阶段，而本档案已经标记为“已确认/已完成”，不得让旧文字把已解决的事件重新开启。
6. 这是本角色的私有认知，不得把其中未被其他角色亲自获知的内容泄露给其他角色或 NPC，也不要机械复述整份档案。`
}

export function characterMemoryContinuityGuard(character: Character) {
  if (!activeCharacterMemory(character).length) return ''
  return `【角色私有记忆最终校准】本轮续写前重新核对这张角色卡的私有长期记忆：其中标为“已确认/已完成”的事实已经是当前连续性的一部分。不要因为旧开场白、旧状态栏、历史分支或滚动摘要仍保留“待查”措辞，就把已经查明的真相、已经完成的任务或已经发生的重大事件退回未完成状态；除非最近对话明确给出更新或撤销。`
}

export function characterMemoryEntryFromConversation(entry: { id?: string; title?: string; content: string; createdAt?: number }): CharacterMemoryEntry {
  const now = Date.now()
  return createCharacterMemoryEntry({
    title: entry.title?.trim() || '从对话记忆固定的事实',
    content: stripUiOnlyStatusBlocks(entry.content).trim(),
    category: 'fact',
    status: 'confirmed',
    enabled: true,
    createdAt: entry.createdAt || now,
    updatedAt: now,
    sourceMemoryId: entry.id,
  })
}
