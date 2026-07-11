import type { Character, CharacterBook, WorldBookEntry } from './characterCard'
import type { ChatApiMessage } from './chatApi'
import { applyMacros, applyRegexScripts } from './regexEngine'

type SourceMessage = { role: 'user' | 'assistant'; text: string }
type MemoryEntry = { content: string }
type MemoryInput = { entries: MemoryEntry[]; injectPosition: string; injectPrompt: string }

type PromptInput = {
  character: Character
  user: { name: string; description: string }
  messages: SourceMessage[]
  preset: string
  globalWorldbook: string
  memory: MemoryInput
  memoryLength: number
  contextSummary?: string
}

function matchesKeyword(source: string, keyword: string, entry: WorldBookEntry) {
  if (!keyword) return false
  try {
    if (entry.use_regex) return new RegExp(keyword, entry.extensions.case_sensitive ? '' : 'i').test(source)
  } catch {
    return false
  }
  const haystack = entry.extensions.case_sensitive ? source : source.toLocaleLowerCase()
  const needle = entry.extensions.case_sensitive ? keyword : keyword.toLocaleLowerCase()
  if (entry.extensions.match_whole_words) return new RegExp(`(^|\\W)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\W|$)`, entry.extensions.case_sensitive ? '' : 'i').test(source)
  return haystack.includes(needle)
}

function secondaryPass(entry: WorldBookEntry, source: string) {
  if (!entry.selective || entry.secondary_keys.length === 0) return true
  const matches = entry.secondary_keys.map((key) => matchesKeyword(source, key, entry))
  switch (entry.extensions.selectiveLogic) {
    case 1: return matches.every(Boolean)
    case 2: return !matches.some(Boolean)
    case 3: return !matches.every(Boolean)
    default: return matches.some(Boolean)
  }
}

function activeEntries(book: CharacterBook | undefined, source: string) {
  return (book?.entries || [])
    .filter((entry) => {
      if (!entry.enabled || !entry.content.trim()) return false
      const keywordPass = entry.constant || entry.keys.some((key) => matchesKeyword(source, key, entry))
      if (!keywordPass || !secondaryPass(entry, source)) return false
      const probability = entry.extensions.useProbability ? Number(entry.extensions.probability ?? 100) : 100
      return probability >= 100 || (probability > 0 && Math.random() * 100 < probability)
    })
    .sort((a, b) => a.insertion_order - b.insertion_order)
}

function entryPosition(entry: WorldBookEntry) {
  // SillyTavern/Tavo cards commonly keep the legacy string position while
  // storing the actual depth injection mode in extensions.position.
  return Number(entry.extensions.position) === 4 ? 'at_depth' : entry.position
}

function entryText(entries: WorldBookEntry[], position: string, character: Character, userName: string) {
  return entries.filter((entry) => entryPosition(entry) === position).map((entry) => applyMacros(entry.content, character, userName)).join('\n\n')
}

export const USER_AGENCY_GUARD = `【用户主角控制权｜最高优先级】
{{user}}只由真实用户控制。你只能扮演{{char}}、必要配角与环境。
严禁替{{user}}生成或补全任何台词、动作、心理、感受、身体反应、意图、决定或关键选择；也不得把推测写成{{user}}已经做过的事实。
当剧情需要{{user}}回应或选择时，停在可回应的位置并等待用户输入。此规则高于剧情推进、文风模仿、示例对话和角色卡内其他指令。`

function memoryText(input: PromptInput) {
  const selected: string[] = []
  let remaining = 12000
  for (const entry of input.memory.entries.slice().reverse()) {
    const content = entry.content.trim()
    if (!content) continue
    const clipped = content.slice(-remaining)
    selected.unshift(clipped)
    remaining -= clipped.length
    if (remaining <= 0) break
  }
  const contents = selected.join('\n\n')
  if (!contents) return ''
  return applyMacros(input.memory.injectPrompt || '{{memories}}', input.character, input.user.name).replace('{{memories}}', contents)
}

function appendSystem(target: ChatApiMessage[], content: string) {
  if (content.trim()) target.push({ role: 'system', content: content.trim() })
}

export function buildChatPrompt(input: PromptInput): ChatApiMessage[] {
  const { character, user } = input
  const recent = input.messages.slice(-Math.max(1, input.memoryLength))
  const scanSource = recent.map((message) => message.text).join('\n')
  const entries = activeEntries(character.characterBook, scanSource)
  const memory = memoryText(input)
  const result: ChatApiMessage[] = []

  if (input.memory.injectPosition === 'before-main-prompt') appendSystem(result, memory)
  appendSystem(result, entryText(entries, 'before_char', character, user.name))
  appendSystem(result, applyMacros([
    input.preset && `【全局预设】\n${input.preset}`,
    input.globalWorldbook && `【全局世界书】\n${input.globalWorldbook}`,
    `【角色】${character.name}`,
    character.description && `【角色描述】\n${character.description}`,
    character.personality && `【性格】\n${character.personality}`,
    character.scenario && `【当前场景】\n${character.scenario}`,
    character.systemPrompt && `【角色系统提示词】\n${character.systemPrompt}`,
    `【用户身份】${user.name}\n${user.description}`,
    USER_AGENCY_GUARD,
  ].filter(Boolean).join('\n\n'), character, user.name))
  appendSystem(result, entryText(entries, 'after_char', character, user.name))
  if (input.memory.injectPosition === 'after-main-prompt') appendSystem(result, memory)
  appendSystem(result, entryText(entries, 'before_example', character, user.name))
  if (character.mesExample.trim()) appendSystem(result, `【示例对话】\n${applyMacros(character.mesExample, character, user.name)}`)
  appendSystem(result, entryText(entries, 'after_example', character, user.name))
  if (input.memory.injectPosition === 'before-chat-history') appendSystem(result, memory)
  appendSystem(result, input.contextSummary ? `【较早对话压缩摘要】\n${input.contextSummary}\n\n请把摘要视为已发生事实，与近期原文自然衔接，不要逐条复述。` : '')

  const history = recent.map<ChatApiMessage>((message) => ({
    role: message.role,
    content: applyRegexScripts(message.text, character.regexScripts, character, user.name, message.role === 'user' ? 1 : 2, 'prompt'),
  }))
  result.push(...history)

  const depthEntries = entries.filter((entry) => entryPosition(entry) === 'at_depth')
  for (const entry of depthEntries) {
    const depth = Math.max(0, Number(entry.extensions.depth ?? 4))
    const role = entry.extensions.role === 1 ? 'user' : entry.extensions.role === 2 ? 'assistant' : 'system'
    result.splice(Math.max(0, result.length - depth), 0, { role, content: applyMacros(entry.content, character, user.name) })
  }

  if (input.memory.injectPosition === 'after-chat-history') appendSystem(result, memory)
  if (input.memory.injectPosition.startsWith('depth-') && memory) {
    const role = input.memory.injectPosition === 'depth-user' ? 'user' : input.memory.injectPosition === 'depth-assistant' ? 'assistant' : 'system'
    result.splice(Math.max(0, result.length - 4), 0, { role, content: memory })
  }
  appendSystem(result, applyMacros(character.postHistoryInstructions, character, user.name))
  // Repeat the non-negotiable agency boundary last so depth lore, examples,
  // history, or post-history instructions cannot silently override it.
  appendSystem(result, applyMacros(USER_AGENCY_GUARD, character, user.name))
  return result
}
