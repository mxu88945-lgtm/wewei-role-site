import { extractStatusFields, stripLeadingSpeakerLabels } from './outputSanitizer'
import { stripPresentationalHtmlForPrompt } from './regexEngine'
import { stripUiOnlyStatusBlocks } from './modelContext'

type ActorMessage = {
  role: 'user' | 'assistant'
  text: string
  characterId?: string
}

const stagePattern = /(?:关系进展|推进阶段|当前阶段)\s*[:：]\s*(阶段[一二三四五六七八九十\d]+)/

/** Remove obsolete numeric gate bookkeeping before old replies re-enter prompts. */
export function stripStageGateMetadata(value: string) {
  return value
    .replace(/\s*｜?\s*阶段锚点\s*[:：][\s\S]*?(?=\s*｜\s*阶段观察|$)/g, '')
    .replace(/\s*｜?\s*阶段观察\s*[:：][^｜\n]*/g, '')
    .trim()
}

function plainActorReply(value: string, characterName: string) {
  return stripStageGateMetadata(stripLeadingSpeakerLabels(stripPresentationalHtmlForPrompt(stripUiOnlyStatusBlocks(value)), [characterName]))
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .trim()
}

function sceneLabel(value: string) {
  const matches = Array.from(value.matchAll(/<(scene|plot)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi))
  return matches[matches.length - 1]?.[2]
    ?.replace(/```/g, '')
    .replace(/\s+/g, ' ')
    .trim() || ''
}

export type SafeStatusSceneFacts = {
  time: string
  location: string
  event: string
}

/** Keep only non-private scene facts from a UI status block. */
export function safeStatusSceneFacts(value: string): SafeStatusSceneFacts {
  const blocks = Array.from(value.matchAll(/<((?:status|[a-z][\w-]*_status))\b[^>]*>([\s\S]*?)<\/\1\s*>/gi))
  const block = blocks[blocks.length - 1]
  const facts: SafeStatusSceneFacts = { time: '', location: '', event: '' }
  if (!block) return facts

  for (const field of extractStatusFields(block[2] || '')) {
    const label = field.label.replace(/\s+/g, '')
    const content = field.value.replace(/\s+/g, ' ').trim()
    if (!content) continue
    if (!facts.time && /^(?:当前)?(?:时间|日期)$/.test(label)) facts.time = content
    else if (!facts.location && /^(?:当前)?(?:地点|位置|场景)$/.test(label)) facts.location = content
    else if (!facts.event && /^(?:当前)?(?:外部)?事件$|^本轮外部事件$|^剧情进展$|^当前剧情$/.test(label)) facts.event = content
  }
  return facts
}

export function safeStatusSceneFactText(value: string) {
  const facts = safeStatusSceneFacts(value)
  return [
    facts.time && `时间：${facts.time}`,
    facts.location && `地点：${facts.location}`,
    facts.event && `当前事件：${facts.event}`,
  ].filter(Boolean).join('｜')
}

function compactAnchorFact(value: string) {
  return stripPresentationalHtmlForPrompt(stripUiOnlyStatusBlocks(value))
    .replace(/<(?:scene|plot)\b[^>]*>[\s\S]*?<\/(?:scene|plot)\s*>/gi, '')
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-640)
}

/**
 * Use one coherent present-tense anchor for both single and group chats. Every
 * field comes from the same newest valid assistant reply so an older director
 * status cannot be spliced into a newer actor scene.
 */
export function findLatestSceneContinuityAnchor(messages: ActorMessage[], maxChars = 1100) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant' || !message.text.trim()) continue
    const scene = sceneLabel(message.text)
    const fact = compactAnchorFact(message.text)
    const statusFacts = safeStatusSceneFacts(message.text)
    const parts = [
      scene && `最新场景标记：${scene}`,
      statusFacts.time && `最新时间：${statusFacts.time}`,
      statusFacts.location && `最新地点：${statusFacts.location}`,
      fact && `最新已完成剧情：${fact}`,
      statusFacts.event && `最新外部事件：${statusFacts.event}`,
    ].filter(Boolean)
    if (!parts.length) continue

    return `【最新场景锚点｜单聊与群聊共用｜高于开局场景、旧摘要与旧状态栏】\n${parts.join('\n')}\n以上内容只来自最近一条有效助手回复。若最新用户消息明确改变了时间、地点、人物状态或事件，以最新用户消息为准；从最新事实继续，不得回到更早的道别、行程或旧地点重演。`.slice(0, Math.max(1, maxChars))
  }
  return ''
}

/** Backwards-compatible name for older callers and imported cards/tests. */
export const findLatestGroupSceneAnchor = findLatestSceneContinuityAnchor

/** Keep each group actor's last completed self-state available after long absences. */
export function findLatestActorContinuityAnchor(messages: ActorMessage[], characterId: string, characterName: string, maxChars = 8000) {
  const visibleReplies = messages
    .filter((message) => message.role === 'assistant' && message.characterId === characterId && message.text.trim())
    .map((message) => plainActorReply(message.text, characterName))
    .filter(Boolean)
  const plain = visibleReplies[visibleReplies.length - 1] || ''
  if (!plain) return ''
  const currentStage = plain.match(stagePattern)?.[1]
  const continuity = currentStage
    ? `\n\n【当前关系进程】延续历史中已经进入的${currentStage}，不得无故退回更早阶段。阶段名称只用于保持连续性，不是锁定指令；若后续剧情形成新的、明确且不可逆的认知或选择，可以自然进入下一阶段，无需累计数字锚点或反复解释升级条件。`
    : ''
  return `${plain.slice(-Math.max(1, maxChars))}${continuity}`
}
