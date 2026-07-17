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
5. “当前任务”必须是现阶段最需要查清、取得或验证的核心证据节点，不得写成乘车、递物、安抚、回忆、约会或闲聊等即时场景动作。原任务尚未完成时应保留，不能因场景切换随意换题。
6. 生成“下一步方向”前，必须综合当前任务、全部未完成钩子、公开/隐藏证据及角色知情边界，找出离形成证据闭环最近的缺口。优先级依次为：补齐当前证据缺口；验证现有线索真伪；取得能连接下一节点的新材料；处理阻碍取证的人物行动。
7. “下一步方向”只给 1—3 条真正能推进主线的证据行动，每条使用“线索目标｜行动者与动作｜预计新增信息｜如何衔接下一节点”的完整格式。不得只写角色反应、结束行程、感情互动或泛泛的“继续调查”。
8. 感情与日常场景只有在会造成证据交付、隐瞒暴露、立场变化或调查阻碍时才可列入方向；它们必须服务于当前证据链，不能取代主线。
9. 每条方向最多推进一个证据节点，不直接宣布最终真相，不跨过取证过程，也不替用户主角决定接受、拒绝、相信或前往。
10. 角色知情边界必须有来源。某角色的内心、旁白资料或隐藏真相，不代表其他角色自动知道。
11. 当前时间、地点或在场人物无法确认时留空，不得猜测。
12. 旁白导演是后台控制者，不是在场角色，也不需要角色知情边界。
13. ${project.autoContinuity.needsReview ? '对话历史已改写，必须从当前保留的对话重建驾驶舱；旧驾驶舱不是事实来源，不得保留其中未被当前对话支持的事件、阶段、证据或知情边界。' : '保留现有驾驶舱中仍然有效的事实；只有来源明确更新、完成或推翻时才修改。'}

【项目资料】
${JSON.stringify({ title: project.title, summary: project.summary, worldBackground: project.worldBackground, currentCockpit: project.autoContinuity.needsReview ? '历史已改写，禁止作为重建依据' : project.cockpit }, null, 2)}

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
  "nextDirections": ["线索目标｜行动者与动作｜预计新增信息｜如何衔接下一节点"]
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
