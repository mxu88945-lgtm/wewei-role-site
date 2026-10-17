import { stripUiOnlyStatusBlocks } from './modelContext'
import { sanitizeAssistantOutput } from './outputSanitizer'

// Only used by 人格窗口. Never change the card or the story/phone renderer.
export const PERSONA_DISPLAY_LORE = /(<\/?(?:div|span|status|[a-z][\w-]*_status|scene|scenario|psychology|style|section|details|table)\b|状态栏|美化|输出格式|格式要求|html|css|正则)/i
const FORMAT_HEADING = /(?:美化|状态栏|输出格式|格式要求|回复格式|输出模板|显示规则|psychology|html|css|正则)/i
const HEADING = /^\s*(?:#{1,6}\s+[^\n]+|【[^】]+】|\[[^\]]+\])/
const FORMAT_SENTENCE = /(?:状态栏|美化|输出格式|格式要求|回复格式|输出模板|显示规则|正则替换|(?:输出|使用|保留|包裹|闭合).{0,24}(?:标签|HTML|CSS)|<\/?(?:psychology|scene|status|[a-z][\w-]*_status)\b)/i

/** Remove display instructions embedded in otherwise useful identity / voice fields. */
export function stripPersonaFormatInstructions(value: string) {
  const source = value
    .replace(/```(?:html|xml|css|javascript|js)\b[^\n]*\n[\s\S]*?(?:```|$)/gi, '')
    .replace(/<(output_format|format_rules|beautification|style|script)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<(psychology|scene|scenario|status|[a-z][\w-]*_status)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
  let skipSection = false
  const clean = source.split('\n').flatMap((line) => {
    const heading = HEADING.exec(line)
    if (heading) {
      skipSection = FORMAT_HEADING.test(heading[0])
      return skipSection ? [] : [line]
    }
    if (skipSection) return []
    // Keep the identity sentence when a card appends a format command on the same line.
    return [line.split(/(?<=[。！？；])/u).filter((sentence) => !FORMAT_SENTENCE.test(sentence)).join('')]
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return personaReplyText(clean)
}

/**
 * Plain novel prose, including old stored replies and partial streaming chunks.
 * Scene/status panels are UI metadata; psychology is character prose, so unwrap it
 * instead of deleting what he said. HTML/CSS must never become an iframe here.
 */
export function personaReplyText(value: string) {
  return stripUiOnlyStatusBlocks(sanitizeAssistantOutput(value))
    .replace(/\[\s*(?:记忆|记住|存记忆|memory|搜索|旧文|提醒|提醒任务|定时提醒|任务|reminder)\s*[:：][^\]\n]*(?:\]|$)/gi, '')
    .replace(/\[(?:记(?:忆|住)?|存记忆|memory|搜(?:索)?|旧(?:文)?|提(?:醒(?:任(?:务)?)?)?|定(?:时(?:提(?:醒)?)?)?|任(?:务)?|reminder)?$/gi, '')
    .replace(/<(scene|scenario|details)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<(style|script|head)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/```(?:css|javascript|js)\b[^\n]*\n[\s\S]*?(?:```|$)/gi, '')
    .replace(/```(?:html|xml)?[ \t]*(?:\r?\n)?/gi, '')
    .replace(/<br\s*\/?>|<\/?(?:p|div|section|article|psychology|plot|li|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<!--([\s\S]*?)(?:-->|$)/g, '')
    .replace(/<\/?[a-z!][^>]*>/gi, '')
    // A chunk can end halfway through a tag; don't flash it onto the screen.
    .replace(/<\/?[a-z!][^>\n]*$/gi, '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
