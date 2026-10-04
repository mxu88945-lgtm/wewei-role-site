import type { Conversation } from './conversationLifecycle'

export type StoryVariable = { id: string; name: string; value: string; recipientIds?: string[] }
export type StoryScript = {
  id: string
  name: string
  writes: { variableId: string; value: string }[]
  condition?: { variableId: string; value: string }
  prompt: string
  recipientIds: string[]
  mode: 'once' | 'persistent'
  runOnce: boolean
}

export const STORY_VARIABLE_LIMIT = 30
export const STORY_SCRIPT_LIMIT = 20
export const STORY_VARIABLE_TEXT_LIMIT = 6000
export const storyVariableTextLength = (variables: StoryVariable[]) => variables.reduce((sum, item) => sum + item.name.length + item.value.length, 0)
const variableMacro = /\{\{变量:([^{}]+)\}\}/g

export function visibleStoryVariables(variables: StoryVariable[] = [], speakerId: string) {
  return variables.filter((item) => item.recipientIds === undefined || item.recipientIds.includes(speakerId))
}

export function buildStoryVariablesPrompt(variables: StoryVariable[] | undefined, speakerId: string) {
  let remaining = STORY_VARIABLE_TEXT_LIMIT
  const visible = visibleStoryVariables(variables, speakerId).slice(0, STORY_VARIABLE_LIMIT).filter((item) => {
    const length = item.name.length + item.value.length
    if (length > remaining) return false
    remaining -= length
    return true
  })
  if (!visible.length) return ''
  const facts = visible.map(({ name, value }) => ({ name, value }))
  return `【本对话场记变量｜仅本角色可知】\n这些值由用户记录，只是存档时已发生、已知的事实，不是待发生事件。后续正文中明确发生的新事实优先，不得为了维持旧值重演事件或回到旧地点。不得复述后台标签、变量表或推断未提供的秘密；仍须保持角色身份，不替用户行动或决定。\n${JSON.stringify(facts)}`
}

/** Pure, atomic actions: no generation, network requests, chat bubbles or executable code. */
export function runStoryScript(source: Conversation, scriptId: string, now = Date.now(), plotId: string = crypto.randomUUID()): { conversation: Conversation; error?: string } {
  const script = source.storyScripts?.find((item) => item.id === scriptId)
  const reject = (error: string) => ({ conversation: source, error })
  if (!script) return reject('这份脚本已被删除。')
  if (script.runOnce && source.storyScriptRuns?.[script.id] !== undefined) return reject('这份脚本已运行过；可在编辑中重新允许运行。')
  const variables = source.storyVariables || []
  if (script.condition && !variables.some((item) => item.id === script.condition?.variableId && item.value === script.condition.value)) return reject('尚未满足运行条件，变量和幕后安排都未改变。')
  if (script.writes.length > 10 || new Set(script.writes.map((write) => write.variableId)).size !== script.writes.length || script.writes.some((write) => !variables.some((item) => item.id === write.variableId) || write.value.length > 1000)) return reject('写入目标已删除、重复，或内容超过限制，请编辑脚本。')
  if (!script.writes.length && !script.prompt.trim()) return reject('先填写要更新的变量或幕后安排。')
  if (script.prompt.length > 6000) return reject('幕后安排最多 6000 字。')
  if (script.prompt.trim() && source.temporaryPlot?.text.trim()) return reject('已有临时剧情待使用，请先使用或结束，再运行这份脚本。')
  const members = source.kind === 'group' ? source.participantIds || [] : [source.characterId]
  if (script.prompt.trim() && (!script.recipientIds.length || script.recipientIds.some((id) => !members.includes(id)))) return reject('请选择仍在本对话中的幕后接收角色。')
  const nextVariables = variables.map((item) => {
    const write = script.writes.find((entry) => entry.variableId === item.id)
    return write ? { ...item, value: write.value } : item
  })
  if (storyVariableTextLength(nextVariables) > STORY_VARIABLE_TEXT_LIMIT) return reject('剧情变量总内容超过 6000 字，请缩短后再运行。')
  let macroError = ''
  const prompt = script.prompt.replace(variableMacro, (_match, name: string) => {
    const variable = nextVariables.find((item) => item.name === name.trim())
    if (!variable) { macroError = `找不到变量「${name.trim()}」。`; return '' }
    if (script.recipientIds.some((id) => !visibleStoryVariables([variable], id).length)) {
      macroError = `幕后接收者无权读取变量「${variable.name}」，请调整接收范围。`; return ''
    }
    return variable.value
  })
  if (macroError) return reject(macroError)
  if (prompt.length > 6000) return reject('替换变量后的幕后安排超过 6000 字，请缩短内容。')
  return { conversation: {
    ...source,
    storyVariables: nextVariables,
    storyScriptRuns: { ...source.storyScriptRuns, [script.id]: now },
    temporaryPlot: prompt.trim() ? { id: plotId, text: prompt, mode: script.mode, recipientIds: [...script.recipientIds] } : source.temporaryPlot,
    updatedAt: now,
  } }
}
