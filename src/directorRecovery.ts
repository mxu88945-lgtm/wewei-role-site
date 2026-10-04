import type { Character } from './characterCard'
import type { Conversation } from './conversationLifecycle'
import { createDirectorTemplateConfig, normalizeDirectorTemplateConfig, type DirectorTemplateConfig } from './directorTemplate'

function isDirectorCard(card: Character) {
  return card.creator === '惟境内置导演模板'
    || Boolean(card.directorTemplateConfig)
    || (card.tags.includes('共演导演') && card.systemPrompt.includes('【共演导演权限锁'))
}

/** Recover editor fields from the generated card without rebuilding or replacing its contents. */
export function recoverDirectorConfig(card: Character, conversation: Conversation): DirectorTemplateConfig {
  const stored = normalizeDirectorTemplateConfig(card.directorTemplateConfig)
  if (stored) return stored
  const config = createDirectorTemplateConfig()
  const sections: Array<[keyof DirectorTemplateConfig, string]> = [
    ['storyTitle', '剧目'], ['worldBackground', '世界背景'], ['userProtagonist', '用户主角'],
    ['independentRoles', '独立角色'], ['npcRoster', '可扮演 NPC'], ['hiddenTruths', '幕后真相与知情边界'],
    ['plotThreads', '剧情线与阶段'], ['temporaryPlot', '临时剧情推进（可选，用户后期指令）'],
    ['openingState', '当前开场'], ['pacingNotes', '节奏要求'],
  ]
  for (const [key, title] of sections) {
    const marker = `【${title}】\n`
    const start = card.systemPrompt.indexOf(marker)
    if (start < 0) continue
    const tail = card.systemPrompt.slice(start + marker.length)
    const end = tail.search(/\n\n【/)
    // All recovered section keys are strings; never interpret their contents as executable data.
    Object.assign(config, { [key]: (end < 0 ? tail : tail.slice(0, end)).trim() })
  }
  config.directorName = card.name
  config.apiId = conversation.participantApiIds?.[card.id] || ''
  config.modelName = conversation.participantModelNames?.[card.id] || ''
  return config
}

/** Old groups may retain the director card but lack its explicit conversation binding. */
export function recoverConversationDirector(source: Conversation, characters: Character[]): Conversation {
  if (source.kind !== 'group') return source
  const members = characters.filter((card) => source.participantIds?.includes(card.id))
  const explicit = members.find((card) => card.id === source.directorCharacterId)
  if (explicit && source.directorConfig) return source
  const candidates = members.filter(isDirectorCard)
  const director = explicit || (candidates.length === 1 ? candidates[0] : undefined)
  if (!director) return source
  return {
    ...source,
    directorCharacterId: director.id,
    directorConfig: source.directorConfig || recoverDirectorConfig(director, source),
  }
}
