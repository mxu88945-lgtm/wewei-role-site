import { stripLeadingSpeakerLabels } from './outputSanitizer'
import { stripPresentationalHtmlForPrompt } from './regexEngine'

type ActorMessage = {
  role: 'user' | 'assistant'
  text: string
  characterId?: string
}

const stagePattern = /(?:关系进展|推进阶段|当前阶段)\s*[:：]\s*(阶段[一二三四五六七八九十\d]+)/

function plainActorReply(value: string, characterName: string) {
  return stripLeadingSpeakerLabels(stripPresentationalHtmlForPrompt(value), [characterName])
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .trim()
}

/** Keep each group actor's last completed self-state available after long absences. */
export function findLatestActorContinuityAnchor(messages: ActorMessage[], characterId: string, characterName: string, maxChars = 8000) {
  const ownReplies = messages.filter((message) => (
    message.role === 'assistant' && message.characterId === characterId && message.text.trim()
  ))
  const previousOwnReply = ownReplies[ownReplies.length - 1]
  if (!previousOwnReply) return ''
  const plain = plainActorReply(previousOwnReply.text, characterName)
  const currentStage = plain.match(stagePattern)?.[1]
  const continuity = currentStage
    ? `\n\n【当前关系进程】延续历史中已经进入的${currentStage}，不得无故退回更早阶段。阶段名称只用于保持连续性，不是锁定指令；若后续剧情形成新的、明确且不可逆的认知或选择，可以自然进入下一阶段，无需累计数字锚点或反复解释升级条件。`
    : ''
  return `${plain.slice(-Math.max(1, maxChars))}${continuity}`
}
