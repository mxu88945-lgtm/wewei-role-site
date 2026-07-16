import { normalizeStoredCharacter, type Character, type CharacterBook, type RegexScript, type WorldBookEntry } from './characterCard'

export type CharacterWorkshopBrief = {
  concept: string
  name: string
  relationship: string
  tone: string
  pace: string
  boundaries: string
}

export type CharacterWorkshopDraft = {
  name: string
  tagline: string
  description: string
  personality: string
  scenario: string
  greeting: string
  alternateGreetings: string[]
  mesExample: string
  creatorNotes: string
  systemPrompt: string
  postHistoryInstructions: string
  tags: string[]
  worldbook: Array<{ title: string; keywords: string[]; content: string; constant?: boolean }>
  regexScripts: RegexScript[]
}

export type WorkshopCopilotMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export type WorkshopCopilotPatch = {
  summary: string
  fields?: Partial<Omit<CharacterWorkshopDraft, 'worldbook' | 'regexScripts'>>
  worldbook?: {
    upsert?: CharacterWorkshopDraft['worldbook']
    removeTitles?: string[]
  }
  regexScripts?: {
    upsert?: Array<Partial<RegexScript> & { id?: string; scriptName?: string }>
    removeIds?: string[]
  }
}

export type WorkshopCopilotResponse = {
  reply: string
  patch: WorkshopCopilotPatch | null
}

export const createEmptyCharacterWorkshopDraft = (): CharacterWorkshopDraft => ({
  name: '', tagline: '', description: '', personality: '', scenario: '', greeting: '', alternateGreetings: [],
  mesExample: '', creatorNotes: '', systemPrompt: '', postHistoryInstructions: '', tags: [], worldbook: [], regexScripts: [],
})

const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const texts = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : []

const copilotFieldKeys = [
  'name', 'tagline', 'description', 'personality', 'scenario', 'greeting', 'alternateGreetings',
  'mesExample', 'creatorNotes', 'systemPrompt', 'postHistoryInstructions', 'tags',
] as const

const copilotFieldLabels: Record<(typeof copilotFieldKeys)[number], string> = {
  name: '姓名', tagline: '一句话简介', description: '角色描述', personality: '性格与行为逻辑',
  scenario: '场景与初始关系', greeting: '开场白', alternateGreetings: '备选开场', mesExample: '示例对话',
  creatorNotes: '作者说明', systemPrompt: '系统提示词', postHistoryInstructions: '历史后置指令', tags: '标签',
}

const copilotDraftView = (draft: CharacterWorkshopDraft) => ({
  ...draft,
  regexScripts: draft.regexScripts.map((script) => ({
    id: script.id, scriptName: script.scriptName, findRegex: script.findRegex, replaceString: script.replaceString,
    placement: script.placement, disabled: script.disabled, markdownOnly: script.markdownOnly,
    promptOnly: script.promptOnly, runOnEdit: script.runOnEdit,
  })),
})

export function buildWorkshopCopilotPrompt({ draft, request, messages, memory, pendingPatch }: {
  draft: CharacterWorkshopDraft
  request: string
  messages: WorkshopCopilotMessage[]
  memory?: string
  pendingPatch?: WorkshopCopilotPatch | null
}) {
  const recent = messages.slice(-10).map(({ role, content }) => `${role === 'user' ? '用户' : '助手'}：${content}`).join('\n') || '暂无'
  return `你是“惟境 AI 角色卡工坊助手”，在一个持续对话窗口中协助用户维护整张 Character Card V3 草稿。你既能讨论，也能在用户需要时提出可直接写入工坊的结构化改动。

工作方式：
1. 先理解用户本轮意图。若只是讨论、询问或信息不足，正常回复并令 patch 为 null；不要擅自改卡。
2. 用户要求制作、修改、修复、补充或“直接帮我写”时，回复说明设计判断，同时给出最小范围 patch。没有被本轮要求涉及的栏目绝不改动。
3. 你可以操作角色主体字段、世界书、开场白、系统提示词、历史后置指令、示例对话、作者说明、标签，以及全部正则/UI 美化。
4. 修改已有世界书时沿用完全相同的 title；修改已有正则时优先沿用现有 id，找不到 id 才用完全相同的 scriptName。新增项目不要编造 id。
5. 正则 findRegex 使用本产品现有的 /pattern/flags 字符串格式；捕获内容用 $1、$2 写入 replaceString。UI 仅使用安全的静态 HTML/CSS，不写 script、iframe、表单、外链资源、on* 事件或会遮挡整页的样式。
6. 不代演用户，不擅自确认恋爱关系，不删除用户内容，除非用户明确要求删除。
7. 回复要像长期合作的工坊客服，简洁说明做了什么和为什么，不要假装已经写入；用户会在界面确认后写入。

只输出一个严格 JSON 对象，不要代码围栏：
{
  "reply":"给用户看的自然回复",
  "patch": null 或 {
    "summary":"本次改动摘要",
    "fields":{"greeting":"只放确实要修改的完整新值"},
    "worldbook":{"upsert":[{"title":"条目名","keywords":["词"],"content":"完整正文","constant":false}],"removeTitles":[]},
    "regexScripts":{"upsert":[{"id":"修改已有项时才填","scriptName":"名称","findRegex":"/(...)/gi","replaceString":"安全 HTML/CSS","placement":[1,2],"disabled":false,"markdownOnly":true,"promptOnly":false,"runOnEdit":true}],"removeIds":[]}
  }
}
fields、worldbook、regexScripts 中不需要的部分直接省略。

长期记忆摘要：
${memory?.trim() || '暂无'}

最近对话：
${recent}

当前尚未写入的提案：
${pendingPatch ? JSON.stringify(pendingPatch) : '暂无'}

当前工坊草稿：
${JSON.stringify(copilotDraftView(draft))}

用户本轮消息：
${request.trim()}`
}

export function buildWorkshopCopilotCompressionPrompt(messages: WorkshopCopilotMessage[], previousMemory = '') {
  return `请把这段“AI 角色卡工坊助手”对话压缩成可供后续继续工作的长期记忆。保留：用户审美偏好、已经确认的角色设定、正则/UI 约定、仍未解决的问题、明确禁区。删除寒暄、重复过程和已被推翻的方案。不要替用户补充未确认事实。只输出中文摘要，不要标题和解释。\n\n已有长期记忆：\n${previousMemory || '暂无'}\n\n待压缩对话：\n${messages.map(({ role, content }) => `${role === 'user' ? '用户' : '助手'}：${content}`).join('\n')}`
}

function parseCopilotFields(value: unknown): WorkshopCopilotPatch['fields'] {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const fields: WorkshopCopilotPatch['fields'] = {}
  for (const key of copilotFieldKeys) {
    if (!(key in source)) continue
    if (key === 'alternateGreetings' || key === 'tags') fields[key] = texts(source[key])
    else fields[key] = typeof source[key] === 'string' ? String(source[key]).trim() : ''
  }
  return Object.keys(fields).length ? fields : undefined
}

function parseWorldbookPatch(value: unknown): WorkshopCopilotPatch['worldbook'] {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const upsert = Array.isArray(source.upsert) ? source.upsert.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const entry = item as Record<string, unknown>
    const title = text(entry.title)
    const content = typeof entry.content === 'string' ? entry.content.trim() : ''
    if (!title || !content) return []
    return [{ title, content, keywords: texts(entry.keywords), constant: entry.constant === true }]
  }) : []
  const removeTitles = texts(source.removeTitles)
  return upsert.length || removeTitles.length ? { upsert, removeTitles } : undefined
}

function parseRegexPatch(value: unknown): WorkshopCopilotPatch['regexScripts'] {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const upsert = Array.isArray(source.upsert) ? source.upsert.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const entry = item as Record<string, unknown>
    const id = text(entry.id)
    const scriptName = text(entry.scriptName)
    if (!id && !scriptName) return []
    const patch: Partial<RegexScript> & { id?: string; scriptName?: string } = {}
    if (id) patch.id = id
    if (scriptName) patch.scriptName = scriptName
    if (typeof entry.findRegex === 'string') patch.findRegex = entry.findRegex.trim()
    if (typeof entry.replaceString === 'string') patch.replaceString = entry.replaceString.trim()
    if (Array.isArray(entry.placement)) patch.placement = entry.placement.map(Number).filter(Number.isFinite)
    for (const key of ['disabled', 'markdownOnly', 'promptOnly', 'runOnEdit'] as const) if (typeof entry[key] === 'boolean') patch[key] = entry[key]
    return [patch]
  }) : []
  const removeIds = texts(source.removeIds)
  return upsert.length || removeIds.length ? { upsert, removeIds } : undefined
}

export function parseWorkshopCopilotResponse(raw: string): WorkshopCopilotResponse {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('工坊助手没有返回可识别的改动，请让它重试。')
  let value: unknown
  try { value = JSON.parse(cleaned.slice(start, end + 1)) } catch { throw new Error('工坊助手返回的改动不完整，请重试。') }
  if (!value || typeof value !== 'object') throw new Error('工坊助手返回格式无效。')
  const source = value as Record<string, unknown>
  const reply = text(source.reply) || '我已经整理好这次建议。'
  if (!source.patch || typeof source.patch !== 'object') return { reply, patch: null }
  const patchSource = source.patch as Record<string, unknown>
  const fields = parseCopilotFields(patchSource.fields)
  const worldbook = parseWorldbookPatch(patchSource.worldbook)
  const regexScripts = parseRegexPatch(patchSource.regexScripts)
  if (!fields && !worldbook && !regexScripts) return { reply, patch: null }
  return { reply, patch: { summary: text(patchSource.summary) || '更新角色卡草稿', fields, worldbook, regexScripts } }
}

const freshRegex = (): RegexScript => ({
  id: crypto.randomUUID(), scriptName: '新 UI 美化', findRegex: '', replaceString: '', trimStrings: [], placement: [1, 2],
  disabled: false, markdownOnly: false, promptOnly: false, runOnEdit: false, substituteRegex: 0, minDepth: null, maxDepth: null,
})

export function applyWorkshopCopilotPatch(draft: CharacterWorkshopDraft, patch: WorkshopCopilotPatch): CharacterWorkshopDraft {
  let worldbook = draft.worldbook.map((entry) => ({ ...entry, keywords: [...entry.keywords] }))
  const removeTitles = new Set(patch.worldbook?.removeTitles || [])
  if (removeTitles.size) worldbook = worldbook.filter((entry) => !removeTitles.has(entry.title))
  for (const entry of patch.worldbook?.upsert || []) {
    const index = worldbook.findIndex((current) => current.title === entry.title)
    if (index >= 0) worldbook[index] = { ...entry, keywords: [...entry.keywords] }
    else worldbook.push({ ...entry, keywords: [...entry.keywords] })
  }

  let regexScripts = draft.regexScripts.map((script) => ({ ...script, placement: [...script.placement], trimStrings: [...script.trimStrings] }))
  const removeIds = new Set(patch.regexScripts?.removeIds || [])
  if (removeIds.size) regexScripts = regexScripts.filter((script) => !removeIds.has(script.id))
  for (const entry of patch.regexScripts?.upsert || []) {
    const index = regexScripts.findIndex((script) => (entry.id && script.id === entry.id) || (!entry.id && entry.scriptName && script.scriptName === entry.scriptName))
    if (index >= 0) regexScripts[index] = { ...regexScripts[index], ...entry, id: regexScripts[index].id }
    else regexScripts.push({ ...freshRegex(), ...entry, id: crypto.randomUUID() })
  }
  return { ...draft, ...(patch.fields || {}), worldbook, regexScripts }
}

export function describeWorkshopCopilotPatch(patch: WorkshopCopilotPatch) {
  const items = Object.keys(patch.fields || {}).map((key) => copilotFieldLabels[key as keyof typeof copilotFieldLabels]).filter(Boolean)
  const worldCount = (patch.worldbook?.upsert?.length || 0) + (patch.worldbook?.removeTitles?.length || 0)
  const regexCount = (patch.regexScripts?.upsert?.length || 0) + (patch.regexScripts?.removeIds?.length || 0)
  if (worldCount) items.push(`世界书 ${worldCount} 项`)
  if (regexCount) items.push(`正则/UI ${regexCount} 项`)
  return items
}

export function buildCharacterWorkshopPrompt(brief: CharacterWorkshopBrief) {
  return `你是专业 Character Card V3 角色设计师。根据需求生成可长期扮演、逻辑自洽、不过早恋爱脑的中文角色卡。

用户需求：
- 核心构想：${brief.concept.trim()}
- 指定姓名：${brief.name.trim() || '由你取一个贴合设定的中文姓名'}
- 与用户关系：${brief.relationship.trim() || '根据核心构想合理设计'}
- 文风与气质：${brief.tone.trim() || '细腻、自然、剧情向'}
- 情感节奏：${brief.pace.trim() || '慢热，关系变化必须由事件支撑'}
- 边界与禁区：${brief.boundaries.trim() || '不替用户决定言行、心理和关键选择'}

设计规则：
1. 角色必须有独立目标、缺点、社会关系与行动逻辑，不能只围着用户转。
2. 感情按阶段递进；普通接触、外貌或一次冲突不能直接变成占有欲或深爱。
3. systemPrompt 必须锁定角色身份、知情边界、用户主权和稳定文风；不得代演用户。
4. postHistoryInstructions 应要求先核对最近剧情、时间地点、已发生事实和未完成事项，禁止重复已完成剧情。
5. 世界书只保留真正需要独立触发的背景、NPC、关系阶段或剧情规则，避免重复角色主体。
6. 开场白要有具体时间、地点、局面和可回应入口，但不得替用户发言或行动。

只输出一个 JSON 对象，不要 Markdown 代码围栏，不要解释。必须完全符合：
{
  "name":"",
  "tagline":"不超过40字",
  "description":"完整身份、外貌、经历、目标与矛盾",
  "personality":"性格、行为逻辑、说话方式、优缺点",
  "scenario":"故事背景与初始关系",
  "greeting":"完整开场白",
  "alternateGreetings":["备选开场1","备选开场2"],
  "mesExample":"{{user}}：...\\n{{char}}：...",
  "creatorNotes":"玩法说明与适合的剧情方向",
  "systemPrompt":"最高优先级扮演规则",
  "postHistoryInstructions":"历史核对与连续性规则",
  "tags":["标签"],
  "worldbook":[{"title":"条目名","keywords":["关键词"],"content":"精简正文","constant":false}]
}`
}

export function parseCharacterWorkshopDraft(raw: string): CharacterWorkshopDraft {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型没有返回可识别的角色卡 JSON，请重试或换一个模型。')
  let value: unknown
  try { value = JSON.parse(cleaned.slice(start, end + 1)) } catch { throw new Error('模型返回的角色卡 JSON 不完整，请重试。') }
  if (!value || typeof value !== 'object') throw new Error('角色卡内容格式无效。')
  const source = value as Record<string, unknown>
  const worldbook = Array.isArray(source.worldbook) ? source.worldbook.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const entry = item as Record<string, unknown>
    const title = text(entry.title)
    const content = text(entry.content)
    if (!title || !content) return []
    return [{ title, content, keywords: texts(entry.keywords), constant: entry.constant === true }]
  }) : []
  const draft = {
    ...createEmptyCharacterWorkshopDraft(),
    name: text(source.name), tagline: text(source.tagline), description: text(source.description),
    personality: text(source.personality), scenario: text(source.scenario), greeting: text(source.greeting),
    alternateGreetings: texts(source.alternateGreetings), mesExample: text(source.mesExample),
    creatorNotes: text(source.creatorNotes), systemPrompt: text(source.systemPrompt),
    postHistoryInstructions: text(source.postHistoryInstructions), tags: texts(source.tags), worldbook, regexScripts: [],
  }
  if (!draft.name || !draft.description || !draft.greeting) throw new Error('生成结果缺少姓名、角色描述或开场白，请重试。')
  return draft
}

function characterBook(name: string, entries: CharacterWorkshopDraft['worldbook']): CharacterBook | undefined {
  if (!entries.length) return undefined
  return {
    name: `${name} · 世界书`,
    entries: entries.map((entry, index): WorldBookEntry => ({
      id: index + 1,
      keys: entry.keywords,
      secondary_keys: [],
      comment: entry.title,
      content: entry.content,
      constant: entry.constant === true,
      selective: entry.constant !== true,
      insertion_order: 100 - index,
      enabled: true,
      position: 'before_char',
      use_regex: false,
      extensions: { position: 0, probability: 100, useProbability: true, depth: 4 },
    })),
  }
}

export function characterFromWorkshopDraft(draft: CharacterWorkshopDraft, avatar?: string): Character {
  return normalizeStoredCharacter({
    id: crypto.randomUUID(),
    ...draft,
    avatar: avatar || undefined,
    creator: '惟境 · AI 角色卡工坊',
    characterVersion: '1.0',
    cardSpec: 'chara_card_v3',
    cardSpecVersion: '3.0',
    characterBook: characterBook(draft.name, draft.worldbook),
    regexScripts: draft.regexScripts,
  })
}
