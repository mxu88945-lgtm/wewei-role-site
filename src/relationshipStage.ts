export type RelationshipStage = 1 | 2 | 3 | 4 | 5

type StageMessage = {
  role: string
  text: string
  characterId?: string
}

const STAGE_BY_TOKEN: Record<string, RelationshipStage> = {
  '1': 1, '一': 1,
  '2': 2, '二': 2,
  '3': 3, '三': 3,
  '4': 4, '四': 4,
  '5': 5, '五': 5,
}

const STAGE_LABELS: Record<RelationshipStage, string> = {
  1: '阶段一·契约归位',
  2: '阶段二·异常关注',
  3: '阶段三·旧秩序裂缝',
  4: '阶段四·认定与对等代价',
  5: '阶段五·重新选择',
}

const STAGE_PATTERN = /阶段\s*([一二三四五1-5])(?:\s*[·｜|:：—-]\s*([^<\n\r]{1,30}))?/

export function relationshipStageLabel(stage: RelationshipStage) {
  return STAGE_LABELS[stage]
}

export function extractRelationshipStage(text: string): RelationshipStage | undefined {
  const relationshipIndex = text.lastIndexOf('关系阶段')
  if (relationshipIndex < 0) return undefined
  const match = STAGE_PATTERN.exec(text.slice(relationshipIndex))
  return match ? STAGE_BY_TOKEN[match[1]] : undefined
}

export function enforceRelationshipStageFloor(text: string, floor: RelationshipStage) {
  const relationshipIndex = text.lastIndexOf('关系阶段')
  if (relationshipIndex < 0) return text
  const tail = text.slice(relationshipIndex)
  const match = STAGE_PATTERN.exec(tail)
  if (!match) return text
  const current = STAGE_BY_TOKEN[match[1]]
  if (!current || current >= floor || match.index === undefined) return text
  const start = relationshipIndex + match.index
  return `${text.slice(0, start)}${relationshipStageLabel(floor)}${text.slice(start + match[0].length)}`
}

function belongsToCharacter(message: StageMessage, characterId?: string) {
  return message.role === 'assistant' && (!characterId || !message.characterId || message.characterId === characterId)
}

export function highestRelationshipStage(messages: ReadonlyArray<StageMessage>, characterId?: string) {
  return messages.reduce<RelationshipStage | undefined>((highest, message) => {
    if (!belongsToCharacter(message, characterId)) return highest
    const stage = extractRelationshipStage(message.text)
    return stage && (!highest || stage > highest) ? stage : highest
  }, undefined)
}

export function repairRelationshipStageHistory(messages: ReadonlyArray<StageMessage>, characterId?: string) {
  let highest: RelationshipStage | undefined
  let changed = false
  const repaired = messages.map((message) => {
    if (!belongsToCharacter(message, characterId)) return message
    const stage = extractRelationshipStage(message.text)
    if (!stage) return message
    if (highest && stage < highest) {
      const text = enforceRelationshipStageFloor(message.text, highest)
      changed ||= text !== message.text
      return text === message.text ? message : { ...message, text }
    }
    if (!highest || stage > highest) highest = stage
    return message
  })
  return { messages: repaired, highest, changed }
}

export function relationshipStageLockInstruction(stage: RelationshipStage) {
  return `【关系阶段存档锁｜程序记录】本段聊天已经进入${relationshipStageLabel(stage)}。这是已发生的剧情事实，不是建议；本轮人物认知、行为与状态栏均不得回退到更低阶段。可以维持当前阶段，或在新事实满足条件后继续升级。争吵、疏远、冷静和暂时分开都不构成阶段倒退。`
}
