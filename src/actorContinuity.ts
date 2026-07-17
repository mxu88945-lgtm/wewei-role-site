import { stripLeadingSpeakerLabels } from './outputSanitizer'
import { stripPresentationalHtmlForPrompt } from './regexEngine'

type ActorMessage = {
  role: 'user' | 'assistant'
  text: string
  characterId?: string
}

const stagePattern = /(?:关系进展|推进阶段|当前阶段)\s*[:：]\s*(阶段[一二三四五六七八九十\d]+)/
const anchorPattern = /阶段锚点\s*[:：]\s*(\d+)\s*\/\s*(\d+)/g

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
  const anchors = ownReplies.flatMap((message) => {
    const text = plainActorReply(message.text, characterName)
    const stage = text.match(stagePattern)?.[1]
    if (currentStage && stage && stage !== currentStage) return []
    return [...text.matchAll(anchorPattern)].map((match) => ({ current: Number(match[1]), required: Number(match[2]) }))
  }).filter((item) => Number.isFinite(item.current) && Number.isFinite(item.required) && item.required > 0)
  const highest = anchors.sort((a, b) => b.current / b.required - a.current / a.required || b.current - a.current)[0]
  const protection = highest
    ? `\n\n【累计阶段锚点校验】历史本人回复在${currentStage || '当前阶段'}已明确达到阶段锚点：${highest.current}/${highest.required}。后续状态栏不得无依据降到更低数字或清零；只有实际剧情明确证明旧锚点无效时才能更正，并须说明被推翻的客观事实。`
    : ''
  return `${plain.slice(-Math.max(1, maxChars))}${protection}`
}
