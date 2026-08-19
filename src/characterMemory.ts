import {
  CHARACTER_MEMORY_CATEGORY_OPTIONS,
  CHARACTER_MEMORY_STATUS_OPTIONS,
  createCharacterMemoryEntry,
  type Character,
  type CharacterMemoryEntry,
} from './characterCard'
import { stripUiOnlyStatusBlocks } from './modelContext'

const categoryLabels = Object.fromEntries(CHARACTER_MEMORY_CATEGORY_OPTIONS.map((item) => [item.value, item.label])) as Record<string, string>
const statusLabels = Object.fromEntries(CHARACTER_MEMORY_STATUS_OPTIONS.map((item) => [item.value, item.label])) as Record<string, string>

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
