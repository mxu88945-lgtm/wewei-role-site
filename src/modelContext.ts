import { stripFilmBlocks } from './filmBlock'
import { stripTurnContext } from './promptTail'

type ModelContextMessage = {
  role: 'user' | 'assistant'
  text: string
}

const STATUS_TAG = '(?:status|[a-z][\\w-]*_status)'
const pairedAngleStatus = new RegExp(`<(${STATUS_TAG})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi')
const pairedBracketStatus = new RegExp(`\\[(${STATUS_TAG})\\b[^\\]]*\\][\\s\\S]*?\\[\\/\\1\\s*\\]`, 'gi')
const danglingAngleStatus = new RegExp(`<${STATUS_TAG}\\b[^>]*>[\\s\\S]*$`, 'gi')
const danglingBracketStatus = new RegExp(`\\[${STATUS_TAG}\\b[^\\]]*\\][\\s\\S]*$`, 'gi')

/**
 * Status blocks are UI-only backstage notes. They stay in stored messages so
 * the user can see the rendered panel, but must never enter a model request.
 * Supports current tags such as status, gts_status, director_status and older
 * card-specific forms such as lu_status / pei_status.
 */
export function stripUiOnlyStatusBlocks(value: string) {
  // v198 剧情美化卡 <film> 块也是纯界面用的：不进模型历史、摘要、记忆。
  return stripFilmBlocks(value)
    .replace(pairedAngleStatus, '')
    .replace(pairedBracketStatus, '')
    .replace(danglingAngleStatus, '')
    .replace(danglingBracketStatus, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function isFailedTransportAssistantMessage(message: ModelContextMessage) {
  if (message.role !== 'assistant') return false
  return /^\s*[（(]?\s*消息没送到\s*[：:]?[\s\S]*(?:requires\s+more\s+credits|fewer\s+max_tokens|HTTP\s+4\d\d)/i.test(message.text)
}

export function modelVisibleMessageText(message: ModelContextMessage) {
  if (isFailedTransportAssistantMessage(message)) return ''
  return message.role === 'assistant' ? stripUiOnlyStatusBlocks(stripTurnContext(message.text)) : stripTurnContext(message.text)
}
