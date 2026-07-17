import { normalizeStoryCockpit, type StoryCockpit, type StoryEvidence, type StoryProject } from './storyProject'
import { parseCockpitAssistantResponse, type CockpitSourceCharacter } from './storyCockpitAssistant'

export type ContinuityMessage = {
  id: number
  role: 'user' | 'assistant'
  text: string
  characterId?: string
}

export type ContinuityConversation = {
  id: string
  title: string
  messages: ContinuityMessage[]
}

export type AutomaticContinuityResult = {
  cockpit: StoryCockpit
  consumedOpenHooks: string[]
  changeSummary: string
}

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))]
const compact = (value = '', max = 2500) => value.trim().slice(0, max)

export function captureAssistantMessageIds(project: StoryProject, conversations: ContinuityConversation[]) {
  return Object.fromEntries(conversations
    .filter((conversation) => project.conversationIds.includes(conversation.id))
    .map((conversation) => [conversation.id, [...conversation.messages].reverse().find((message) => message.role === 'assistant')?.id || 0]))
}

export function hasUnprocessedAssistantMessages(project: StoryProject, conversations: ContinuityConversation[]) {
  const latest = captureAssistantMessageIds(project, conversations)
  return Object.entries(latest).some(([conversationId, messageId]) => messageId > (project.autoContinuity.lastProcessedAssistantMessageIds[conversationId] || 0))
}

export function buildAutomaticContinuityInput({ project, characters, conversations, userName }: {
  project: StoryProject
  characters: CockpitSourceCharacter[]
  conversations: ContinuityConversation[]
  userName: string
}) {
  const characterNames = new Map(characters.map((character) => [character.id, character.name]))
  const newDialogue = conversations
    .filter((conversation) => project.conversationIds.includes(conversation.id))
    .map((conversation) => {
      const afterId = project.autoContinuity.lastProcessedAssistantMessageIds[conversation.id] || 0
      return {
        id: conversation.id,
        title: conversation.title,
        messages: conversation.messages.filter((message) => message.id > afterId).slice(-20).map((message) => ({
          messageId: message.id,
          role: message.role,
          speaker: message.role === 'user' ? userName : characterNames.get(message.characterId || '') || '未标明的角色',
          text: compact(message.text),
        })),
      }
    })
    .filter((conversation) => conversation.messages.some((message) => message.role === 'assistant'))

  const roleData = characters.map((character) => ({ id: character.id, name: character.name, tagline: compact(character.tagline, 300) }))
  return `你是自动场记，只分析“本轮新增对话”对现有剧情驾驶舱造成的变化，不续写剧情。

【不可违反】
1. 只把新增对话中已经实际发生的事情记为完成事件。计划、预告、威胁、猜测与下一步意图不是已完成事件。
2. 用户主角 ${userName} 的事实只采信用户消息；模型替她描写的心理、动作、接受、原谅、恋爱、离开或选择一律忽略。
3. 已完成事件永久保留。旧钩子只有在新增对话明确完成或失效时才能消耗；消耗时必须原样复制到 consumedOpenHooks。
4. currentTask 表示当前最需要查清、取得或验证的核心证据节点。尚未完成时原样保留；只有它已经完成、失效，或现值只是乘车、递物、安抚、回忆、约会、闲聊等非证据动作时，才根据未完成钩子与证据缺口修正。
5. 更新 nextDirections 时必须综合 currentTask、全部未完成钩子、公开/隐藏证据和角色知情边界，选择离证据闭环最近的 1—3 个行动。每条使用“线索目标｜行动者与动作｜预计新增信息｜如何衔接下一节点”的格式，每次最多推进一个证据节点，不得一次跨越多个阶段或直接揭晓真相。
6. 角色反应、结束行程、日常陪伴与感情互动本身不算推进方向；只有它会造成证据交付、隐瞒暴露、立场变化或调查阻碍时才能记录，并须明确它如何服务当前证据链。
7. 关系阶段只依据明确发生的互动更新；不得替用户确认感情，不得把暧昧、沉默或模型代写当作恋爱确认。
8. 客观事实、角色已知、仍未知、误解与隐藏真相分别维护。某角色听到传闻不代表传闻为真。
9. 不删除仍有效的旧事实、证据或知情边界。新信息不足以更新某字段时，原样保留。
10. 旁白或导演不是在场人物，不建立角色知情边界。
11. 独立角色重新出场时，其状态栏可能引用本人上次离场前的旧地点与旧事件；那是个人历史锚点，不代表全剧时间倒退。除非最新用户消息或客观事件明确切换场景，不得把 currentTime、currentLocation、在场人物或已完成事件回滚到旧餐聚、旧住所、旧会议等历史截面。

【当前项目与驾驶舱】
${JSON.stringify({ title: project.title, summary: project.summary, worldBackground: project.worldBackground, cockpit: project.cockpit }, null, 2)}

【独立角色】
${JSON.stringify(roleData, null, 2)}

【本轮新增对话】
${JSON.stringify(newDialogue, null, 2)}

只输出合法 JSON，不要 Markdown 或解释：
{
  "changeSummary": "一句话说明本轮场记更新；若无客观进展则写未发现可记账的新进展",
  "consumedOpenHooks": ["只能逐字复制本轮已经完成或失效的旧钩子"],
  "cockpit": {
    "currentTime": "", "currentLocation": "", "presentCharacterIds": [],
    "relationshipStage": "", "currentTask": "", "completedEvents": [], "openHooks": [],
    "evidence": [{ "id": "保留已有id或为新增证据留空", "title": "", "detail": "", "visibility": "public或hidden", "knownByCharacterIds": [] }],
    "characterKnowledge": [{ "characterId": "", "knownFacts": [], "unknownFacts": [], "mistakenBeliefs": [] }],
    "nextDirections": ["线索目标｜行动者与动作｜预计新增信息｜如何衔接下一节点"]
  }
}`
}

export function parseAutomaticContinuityResponse(raw: string, allowedCharacterIds: string[]): AutomaticContinuityResult {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('自动场记没有返回可识别的数据')
  let value: unknown
  try { value = JSON.parse(cleaned.slice(start, end + 1)) } catch { throw new Error('自动场记返回的 JSON 不完整') }
  if (!value || typeof value !== 'object') throw new Error('自动场记返回的数据格式不正确')
  const result = value as { cockpit?: unknown; consumedOpenHooks?: unknown; changeSummary?: unknown }
  return {
    cockpit: parseCockpitAssistantResponse(JSON.stringify(result.cockpit || {}), allowedCharacterIds),
    consumedOpenHooks: Array.isArray(result.consumedOpenHooks) ? unique(result.consumedOpenHooks.filter((item): item is string => typeof item === 'string')) : [],
    changeSummary: typeof result.changeSummary === 'string' && result.changeSummary.trim() ? result.changeSummary.trim() : '自动场记已更新剧情进度',
  }
}

function mergeEvidence(existing: StoryEvidence[], proposed: StoryEvidence[]) {
  const next = existing.map((item) => ({ ...item, knownByCharacterIds: [...item.knownByCharacterIds] }))
  proposed.forEach((item) => {
    const index = next.findIndex((entry) => (item.id && entry.id === item.id) || (item.title && entry.title === item.title))
    if (index >= 0) next[index] = { ...next[index], ...item, id: next[index].id }
    else if (item.title || item.detail) next.push({ ...item, id: item.id || `evidence-${Date.now()}-${next.length}` })
  })
  return next
}

export function mergeAutomaticContinuity(existingValue: StoryCockpit, result: AutomaticContinuityResult): StoryCockpit {
  const existing = normalizeStoryCockpit(existingValue)
  const proposed = normalizeStoryCockpit(result.cockpit)
  const consumed = new Set(result.consumedOpenHooks.filter((hook) => existing.openHooks.includes(hook)))
  const completedEvents = unique([...existing.completedEvents, ...proposed.completedEvents])
  const openHooks = unique([...existing.openHooks.filter((hook) => !consumed.has(hook)), ...proposed.openHooks]).filter((hook) => !consumed.has(hook))
  const knowledge = new Map(existing.characterKnowledge.map((item) => [item.characterId, item]))
  proposed.characterKnowledge.forEach((item) => knowledge.set(item.characterId, item))
  return {
    currentTime: proposed.currentTime || existing.currentTime,
    currentLocation: proposed.currentLocation || existing.currentLocation,
    presentCharacterIds: proposed.presentCharacterIds,
    relationshipStage: proposed.relationshipStage || existing.relationshipStage,
    currentTask: proposed.currentTask || existing.currentTask,
    completedEvents,
    openHooks,
    evidence: mergeEvidence(existing.evidence, proposed.evidence),
    characterKnowledge: [...knowledge.values()],
    nextDirections: proposed.nextDirections.length ? proposed.nextDirections : existing.nextDirections,
  }
}
