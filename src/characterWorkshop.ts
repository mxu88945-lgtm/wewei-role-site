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

const emptyDraft = (): CharacterWorkshopDraft => ({
  name: '', tagline: '', description: '', personality: '', scenario: '', greeting: '', alternateGreetings: [],
  mesExample: '', creatorNotes: '', systemPrompt: '', postHistoryInstructions: '', tags: [], worldbook: [], regexScripts: [],
})

const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const texts = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : []

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
    ...emptyDraft(),
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
