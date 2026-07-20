import { normalizeStoryCockpit, type StoryCanon, type StoryCockpit, type StoryProject } from './storyProject'

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

const sampleWholeStory = (messages: CockpitSourceConversation['messages']) => {
  if (messages.length <= 180) return messages
  const first = messages.slice(0, 30)
  const middle = messages.slice(30, -90)
  const sampledMiddle = Array.from({ length: 60 }, (_, index) => middle[Math.floor(index * middle.length / 60)]).filter(Boolean)
  return [...first, ...sampledMiddle, ...messages.slice(-90)]
}

export function buildStoryCanonAssistantInput({ project, characters, conversations, userName }: {
  project: StoryProject
  characters: CockpitSourceCharacter[]
  conversations: CockpitSourceConversation[]
  userName: string
}) {
  const names = new Map(characters.map((character) => [character.id, character.name]))
  const sources = conversations.map((conversation) => ({
    title: conversation.title,
    totalMessages: conversation.messages.length,
    sampledMessages: sampleWholeStory(conversation.messages).map((message) => ({
      speaker: message.role === 'user' ? userName : names.get(message.characterId || '') || '未标明角色',
      text: compact(message.text, 1400),
    })),
  }))
  return `你是剧本总编与连续性审计员。请根据项目资料、现有驾驶舱和绑定对话，为整部剧本整理一份“核心剧情总纲”草稿。

【规则】
1. 越新的明确事件覆盖越旧的状态；必须识别逮捕、伏法、死亡、结案、真相公开、关系结束等终局节点。
2. closedArcs 只写已经明确完成或不可逆的结论，并写清最终状态。已伏法、已死亡、已结案的人物或案件不得继续当作身份尚未曝光、仍在暗中行动的悬念。
3. openArcs 只写确实还没解决的主线，不得把已结案内容重新包装成伏笔。
4. currentArc 说明故事现在处于哪一篇章、主要矛盾是什么，不写已经过去的阶段。
5. synopsis 用 300—800 字概括起因、关键转折、已确认真相与当前局面；不得续写、脑补或替用户主角 ${userName} 决定。
6. 角色卡设定只能作为背景，实际发生的对话和用户已经确认的驾驶舱结论优先。
7. 对话过长时 source 中会保留开端、全程均匀采样与最近消息；现有驾驶舱的已完成事件和结论用于补足未采样段落。

【项目与现有驾驶舱】
${JSON.stringify({ title: project.title, summary: project.summary, worldBackground: project.worldBackground, cockpit: project.cockpit }, null, 2)}

【角色】
${JSON.stringify(characters.map((item) => ({ id: item.id, name: item.name })), null, 2)}

【绑定对话】
${JSON.stringify(sources, null, 2)}

只输出合法 JSON：
{"synopsis":"","closedArcs":[""],"currentArc":"","openArcs":[""]}`
}

export function parseStoryCanonAssistantResponse(raw: string): StoryCanon {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('总纲助手没有返回可识别的数据')
  let value: unknown
  try { value = JSON.parse(cleaned.slice(start, end + 1)) } catch { throw new Error('总纲助手返回的 JSON 不完整，请重试') }
  if (!value || typeof value !== 'object') throw new Error('总纲助手返回的数据格式不正确')
  const source = value as Partial<StoryCanon>
  const strings = (items: unknown) => Array.isArray(items) ? [...new Set(items.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))] : []
  return {
    synopsis: typeof source.synopsis === 'string' ? source.synopsis.trim() : '',
    closedArcs: strings(source.closedArcs),
    currentArc: typeof source.currentArc === 'string' ? source.currentArc.trim() : '',
    openArcs: strings(source.openArcs),
  }
}

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
13. ${project.autoContinuity.needsReview ? '对话历史已改写，必须从当前保留的对话重建可能受影响的事实。旧驾驶舱中的场景、事件、证据或知情边界不是事实来源；但 manualAnchors.relationshipStage 与 manualAnchors.plannedEvents 是用户明确要求保留的锚点，不得删除、倒退或改写。关系阶段是当前起点，不是阶段锁，后续有充分新互动时允许自然推进。' : '保留现有驾驶舱中仍然有效的事实；只有来源明确更新、完成或推翻时才修改。'}
14. currentCockpit 中的 plannedEvents 是用户亲自指定的未来事件，不是已经发生的事实。不得把它们写入已完成事件、钩子、证据或下一步方向，也不得改写；界面会在自动整理后原样保留它们。

【项目资料】
${JSON.stringify({
  title: project.title,
  summary: project.summary,
  worldBackground: project.worldBackground,
  currentCockpit: project.autoContinuity.needsReview ? '历史已改写，AI 派生事实禁止作为重建依据' : project.cockpit,
  manualAnchors: project.autoContinuity.needsReview ? { relationshipStage: project.cockpit.relationshipStage, plannedEvents: project.cockpit.plannedEvents } : undefined,
}, null, 2)}

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
