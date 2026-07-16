import { normalizeStoryCockpit, type StoryCockpit, type StoryProject } from './storyProject'

export type CockpitSourceCharacter = {
  id: string
  name: string
  tagline?: string
  description?: string
  personality?: string
  scenario?: string
}

export type CockpitSourceConversation = {
  id: string
  title: string
  messages: { role: 'user' | 'assistant'; text: string; characterId?: string }[]
}

const compact = (value = '', max = 5000) => value.trim().slice(0, max)

export function buildCockpitAssistantInput({ project, characters, conversations, userName }: {
  project: StoryProject
  characters: CockpitSourceCharacter[]
  conversations: CockpitSourceConversation[]
  userName: string
}) {
  const characterMap = new Map(characters.map((character) => [character.id, character.name]))
  const roleData = characters.map((character) => ({
    id: character.id,
    name: character.name,
    tagline: compact(character.tagline, 500),
    description: compact(character.description),
    personality: compact(character.personality, 2500),
    scenario: compact(character.scenario, 2500),
  }))
  const chatData = conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.slice(-50).map((message) => ({
      speaker: message.role === 'user' ? userName : characterMap.get(message.characterId || '') || '未标明的角色',
      role: message.role,
      text: compact(message.text, 2500),
    })),
  }))

  return `请根据以下剧本资料与实际对话，整理“当前剧情驾驶舱”草稿。

【最高规则】
1. 只记录资料或对话中明确存在的事实，不得虚构日期、地点、事件、感情变化或人物行动。
2. 用户主角 ${userName} 只能以用户消息中明确写出的言行作为事实；模型代写的用户心理、动作、原谅、心软、离开、恋爱或复合一律不得采信。
3. 严格区分客观事实、角色声称、角色怀疑、角色误解和隐藏真相。
4. “已完成事件”只收已经实际发生的节点；计划、预告和可能性只能放入“未完成钩子”或“下一步方向”。
5. 角色知情边界必须有来源。某角色的内心、旁白资料或隐藏真相，不代表其他角色自动知道。
6. 当前时间、地点或在场人物无法确认时留空，不得猜测。
7. 旁白导演是后台控制者，不是在场角色，也不需要角色知情边界。
8. 保留现有驾驶舱中仍然有效的事实；只有来源明确更新或推翻时才修改。

【项目资料】
${JSON.stringify({ title: project.title, summary: project.summary, worldBackground: project.worldBackground, currentCockpit: project.cockpit }, null, 2)}

【用户身份】
${userName}

【允许使用的独立角色 ID】
${JSON.stringify(roleData, null, 2)}

【已绑定对话｜越靠后越新】
${JSON.stringify(chatData, null, 2)}

只输出一个合法 JSON 对象，不要 Markdown、代码围栏或解释。结构必须为：
{
  "currentTime": "",
  "currentLocation": "",
  "presentCharacterIds": [],
  "relationshipStage": "",
  "currentTask": "",
  "completedEvents": [],
  "openHooks": [],
  "evidence": [{ "title": "", "detail": "", "visibility": "public或hidden", "knownByCharacterIds": [] }],
  "characterKnowledge": [{ "characterId": "", "knownFacts": [], "unknownFacts": [], "mistakenBeliefs": [] }],
  "nextDirections": []
}`
}

export function parseCockpitAssistantResponse(raw: string, allowedCharacterIds: string[]): StoryCockpit {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('打工助手没有返回可识别的驾驶舱数据')
  let value: unknown
  try { value = JSON.parse(cleaned.slice(start, end + 1)) } catch { throw new Error('打工助手返回的 JSON 不完整，请重试') }
  if (!value || typeof value !== 'object') throw new Error('打工助手返回的数据格式不正确')
  const allowed = new Set(allowedCharacterIds)
  const normalized = normalizeStoryCockpit(value as Partial<StoryCockpit>)
  return {
    ...normalized,
    presentCharacterIds: normalized.presentCharacterIds.filter((id) => allowed.has(id)),
    evidence: normalized.evidence.map((item) => ({ ...item, knownByCharacterIds: item.knownByCharacterIds.filter((id) => allowed.has(id)) })),
    characterKnowledge: normalized.characterKnowledge.filter((item) => allowed.has(item.characterId)),
  }
}
