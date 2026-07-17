import type { Character } from './characterCard'
import type { StoryProject } from './storyProject'

type ProjectPromptInput = {
  project: StoryProject
  speakerId: string
  characters: Character[]
}

const clean = (items: string[]) => items.map((item) => item.trim()).filter(Boolean)

export function selectConversationStoryProject(projects: StoryProject[], conversationId: string) {
  return projects
    .filter((project) => project.status === 'active' && project.conversationIds.includes(conversationId))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

export function buildStoryProjectPrompt({ project, speakerId, characters }: ProjectPromptInput) {
  const cockpit = project.cockpit
  const names = new Map(characters.map((character) => [character.id, character.name]))
  const nameOf = (id: string) => names.get(id) || id
  const presentCharacters = cockpit.presentCharacterIds.map(nameOf)
  const isDirector = Boolean(project.directorCharacterId && speakerId === project.directorCharacterId)

  if (isDirector) {
    const independentCharacterIds = project.characterIds.filter((id) => id !== project.directorCharacterId)
    const independentCharacters = independentCharacterIds.map(nameOf)
    const presentIndependentCharacters = independentCharacterIds.filter((id) => cockpit.presentCharacterIds.includes(id)).map(nameOf)
    const absentIndependentCharacters = independentCharacterIds.filter((id) => !cockpit.presentCharacterIds.includes(id)).map(nameOf)
    const evidence = cockpit.evidence.map((item) => ({
      title: item.title,
      detail: item.detail,
      visibility: item.visibility === 'hidden' ? '隐藏真相' : '公开证据',
      currentKnowers: item.knownByCharacterIds.map(nameOf),
    }))
    const characterKnowledge = cockpit.characterKnowledge.map((item) => ({
      character: nameOf(item.characterId),
      knownFacts: item.knownFacts,
      unknownFacts: item.unknownFacts,
      mistakenBeliefs: item.mistakenBeliefs,
    }))
    return `【剧本项目驾驶舱｜旁白导演专用｜最高优先级】
你正在推进剧本项目《${project.title || '未命名剧本'}》。以下是最新场记，而不是可向角色公开的说明文字。

导演执行规则：
1. 驾驶舱中的“当前时间、当前地点、在场人物”是唯一有效的现在时场景锚点。历史消息、旧摘要、开场白和导演世界书中的旧场景都只是已经过去的记录；凡与当前锚点冲突，一律丢弃，不得续演、倒退或把人物带回旧地点。
2. 已完成事件已经永久消耗，禁止重演、重新触发或让角色再次发现同一事实。已离场的独立角色不得突然出现、说话或执行动作；只有用户、该角色自己的最新发言或驾驶舱明确将其重新设为在场，才算重新入场。
3. 独立角色名单是绝对禁演名单。不得为其中任何人新增台词、内心、表情、肢体动作、决定、调查行为或关键反应；即使你认为这能让剧情连贯，也必须停下来等对应角色卡自己回复。只能简短引用对话中已经实际发生的客观结果，不能补写其过程。
4. 先综合当前任务、未完成钩子、已有证据与角色知情边界，锁定离证据闭环最近的一个缺口；优先补证、验真、取得连接材料或处理取证阻碍，不把普通生活互动当成主线推进。
5. “下一步方向”是证据行动候选，不是自由续写提纲。选择其中最符合当前因果链的一条；若候选只写日常反应、行程收尾或与证据无关的感情互动，应回到未完成钩子与证据重新判断。
6. 每轮最多推进一个证据节点，必须落地交代：哪个无独立卡 NPC 或外部事件带来变化、材料如何留存、当前谁知情、为什么仍不足以下最终结论。推进到新的选择点或证据缺口即停，不跨级揭晓真相。
7. 隐藏证据和角色未知事实只用于幕后铺线。除非满足剧情中的揭露条件，不得让未知角色凭空知道；可以安排合理的可见痕迹，但不能借导演权限直接灌输答案。
8. 你只演环境、没有独立卡的 NPC、外部结果与因果推进。不代演用户主角，不写用户心理、台词、动作、感受、决定或关系确认；不得替用户选择是否接收证据、相信某人、赴约或公开材料。
9. 用户要求“导演推进”时，从当前证据链选择必要的 0—2 名无独立卡 NPC，不堆人，不抢独立角色的戏。
10. 输出前逐句自检：若句子的主语是用户主角或任何独立角色，且内容是本轮新生成的言行、心理或决定，整句删除；若地点或在场人物来自旧历史而非当前锚点，整段删除后重写。

【本轮角色权限快照】
独立角色（全部禁止导演代演）：${independentCharacters.join('、') || '无'}
当前明确在场的独立角色：${presentIndependentCharacters.join('、') || '无'}
当前明确离场的独立角色：${absentIndependentCharacters.join('、') || '无'}
注意：“在场”只表示可由其自己的角色卡接戏，不授予导演代演权限。

${JSON.stringify({
  project: { title: project.title, summary: project.summary, worldBackground: project.worldBackground },
  currentScene: { time: cockpit.currentTime, location: cockpit.currentLocation, presentCharacters },
  relationshipStage: cockpit.relationshipStage,
  currentTask: cockpit.currentTask,
  completedEvents: cockpit.completedEvents,
  openHooks: cockpit.openHooks,
  evidence,
  characterKnowledge,
  nextDirections: cockpit.nextDirections,
}, null, 2)}`
  }

  const ownKnowledge = cockpit.characterKnowledge.find((item) => item.characterId === speakerId)
  // Known facts and mistaken beliefs are deliberately merged. Telling an actor
  // which belief is false would itself leak director-only knowledge.
  const currentBeliefs = clean([...(ownKnowledge?.knownFacts || []), ...(ownKnowledge?.mistakenBeliefs || [])])
  const visibleEvidence = cockpit.evidence
    .filter((item) => item.visibility === 'public' && item.knownByCharacterIds.includes(speakerId))
    .map((item) => ({ title: item.title, detail: item.detail }))

  return `【剧本项目场记切片｜${nameOf(speakerId)}专用｜知情边界】
这是连续性约束，不要在回复中逐条复述或解释。

项目：${project.title || '未命名剧本'}
公开背景：${project.worldBackground || project.summary || '暂无额外公开背景'}
当前时间：${cockpit.currentTime || '以最近对话为准'}
当前地点：${cockpit.currentLocation || '以最近对话为准'}
当前在场人物：${presentCharacters.join('、') || '以最近对话为准'}
当前关系阶段：${cockpit.relationshipStage || '沿用现有关系，不得无依据跳级'}

${nameOf(speakerId)}当前相信的事实（其中可能包含角色自己的误判，但不得识别或跳出其主观认知）：
${currentBeliefs.length ? currentBeliefs.map((item) => `- ${item}`).join('\n') : '- 仅依据实际对话中亲历或被明确告知的内容'}

本人已知的公开证据：
${visibleEvidence.length ? visibleEvidence.map((item) => `- ${item.title}：${item.detail}`).join('\n') : '- 暂无额外证据'}

未列出的隐藏证据、幕后真相、其他角色知识、未完成钩子与导演计划均未提供。严禁猜测、越权获知或借模型常识泄漏。你只扮演${nameOf(speakerId)}本人，不代演用户、旁白导演或其他独立角色。`
}
