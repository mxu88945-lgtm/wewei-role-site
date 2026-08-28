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
  return /<(?:scene|plot)\b[^>]*>([\s\S]*?)<\/(?:scene|plot)\s*>/i.exec(value)?.[1]
    ?.replace(/```/g, '')
    .replace(/\s+/g, ' ')
    .trim() || ''
}

function latestExternalEvent(value: string) {
  const blocks = Array.from(value.matchAll(/<(?:status|[a-z][\w-]*_status)\b[^>]*>([\s\S]*?)<\/(?:status|[a-z][\w-]*_status)\s*>/gi))
  for (const block of blocks.reverse()) {
    const field = extractStatusFields(block[1] || '').find((item) => /^(?:当前)?(?:外部)?事件$|^本轮外部事件$|^剧情进展$/u.test(item.label))
    if (field?.value) return field.value.replace(/\s+/g, ' ').trim()
  }
  return ''
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
 * A group needs one shared present-tense anchor in addition to each actor's
 * private last-reply anchor. UI status panels are intentionally excluded from
 * normal history, so retain only their compact external-event field here.
 */
export function findLatestGroupSceneAnchor(messages: ActorMessage[], maxChars = 900) {
  let scene = ''
  let fact = ''
  let externalEvent = ''

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant' || !message.text.trim()) continue
    if (!scene) scene = sceneLabel(message.text)
    if (!fact) fact = compactAnchorFact(message.text)
    if (!externalEvent) externalEvent = latestExternalEvent(message.text)
    if (scene && fact && externalEvent) break
  }

  const parts = [
    scene && `当前时间地点：${scene}`,
    fact && `最新已完成剧情：${fact}`,
    externalEvent && `上一轮外部事件：${externalEvent}`,
  ].filter(Boolean)
  if (!parts.length) return ''

  return `【群聊当前场景锚点｜高于个人旧回复与旧状态栏】\n${parts.join('\n')}\n以上是已经发生的现在时场景；从这里继续，不得回到更早的道别、行程或旧地点重演。`.slice(0, Math.max(1, maxChars))
}

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
