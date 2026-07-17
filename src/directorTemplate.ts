import type { Character, WorldBookEntry } from './characterCard'

export type DirectorTemplateConfig = {
  enabled: boolean
  directorName: string
  storyTitle: string
  worldBackground: string
  userProtagonist: string
  independentRoles: string
  npcRoster: string
  hiddenTruths: string
  plotThreads: string
  openingState: string
  pacingNotes: string
  apiId: string
  modelName: string
}

export const createDirectorTemplateConfig = (): DirectorTemplateConfig => ({
  enabled: true,
  directorName: '共演厅·旁白导演',
  storyTitle: '',
  worldBackground: '',
  userProtagonist: '',
  independentRoles: '',
  npcRoster: '',
  hiddenTruths: '',
  plotThreads: '',
  openingState: '',
  pacingNotes: '缓慢、连续、有因果地推进；每轮只推动一个主要变化，给用户与独立角色留下回应空间。',
  apiId: '',
  modelName: '',
})

const section = (title: string, value: string, fallback = '未填写；不得自行补造决定性事实。') => `【${title}】\n${value.trim() || fallback}`

const entry = (id: number, comment: string, content: string, constant = true): WorldBookEntry => ({
  id,
  keys: [],
  secondary_keys: [],
  comment,
  content,
  constant,
  selective: false,
  insertion_order: 1000 - id,
  enabled: true,
  position: 'before_char',
  use_regex: false,
  extensions: { position: 0, display_index: id, probability: 100, useProbability: true, depth: 4, role: 0 },
})

export function buildSharedTheaterBackground(config: DirectorTemplateConfig) {
  return [
    '【本剧场共演协议｜所有成员共用】',
    '用户亲自控制用户主角；每张独立角色卡只控制自身。旁白导演只负责环境、NPC与剧情调度。任何角色不得代替用户或其他独立角色发言、行动、思考、决定或补写反应。',
    section('剧目', config.storyTitle, '未命名剧目'),
    section('公开世界背景', config.worldBackground),
    section('用户主角', config.userProtagonist, '以当前用户身份为准；用户拥有唯一解释权与控制权。'),
    section('独立角色边界', config.independentRoles, '以本群已加入的独立角色卡为准；各自只演自己。'),
    section('公开 NPC', config.npcRoster, '导演可按剧情需要创建无独立角色卡的临时 NPC。'),
    section('开场锚点', config.openingState),
  ].join('\n\n')
}

export function createDirectorCharacter(config: DirectorTemplateConfig, existingId?: string): Character {
  const name = config.directorName.trim() || '共演厅·旁白导演'
  const privateMaterial = [
    section('剧目', config.storyTitle, '未命名剧目'),
    section('世界背景', config.worldBackground),
    section('用户主角', config.userProtagonist, '以群聊当前用户身份为准。'),
    section('独立角色', config.independentRoles, '以群聊成员中的独立角色卡为准。'),
    section('可扮演 NPC', config.npcRoster, '可创建必要的临时 NPC，但不得冒充独立角色。'),
    section('幕后真相与知情边界', config.hiddenTruths, '无额外幕后真相。'),
    section('剧情线与阶段', config.plotThreads, '依照用户在对话中给出的目标推进。'),
    section('当前开场', config.openingState),
    section('节奏要求', config.pacingNotes),
  ].join('\n\n')

  const boundary = `【共演导演权限锁｜最高优先级】
你是本剧场的旁白导演，不是恋爱主角，也不是任何独立角色卡。
1. 你只能描写环境变化、时间流逝、公共事件、无独立角色卡的 NPC，以及必要的剧情调度。
2. 用户主角永远由用户本人控制。禁止替用户写台词、动作、心理、情绪、身体反应、决定或默认同意；用户未回应时必须留白。
3. 群聊中的每张独立角色卡都由其自身模型控制。禁止替它们说话、行动、思考、做决定，禁止复述或改写它们刚说过的话来抢戏。
4. NPC 仅限资料明确列出的 NPC 与无独立卡的临时路人。若某人物已作为群聊成员存在，立即视为独立角色，导演不得扮演。
5. 幕后真相只决定导演如何铺线，不能自动变成角色已知信息。严格维护“谁知道、谁不知道、谁只怀疑”的边界。
6. 最新对话或剧本驾驶舱给出的时间、地点、在场与离场状态，永远覆盖开场白、旧摘要、旧消息和世界书中的历史场景。禁止续演已经结束或离开的旧场景；离场角色不得被你召回、发言或行动。
7. 每轮只推进足以让其他人接戏的一小步；优先给场景、事件或无独立卡 NPC 行动，随后停在可回应节点。不得一次包办整场戏或替任何主角收束冲突。
8. 输出前逐句核对主语。只要主语是用户或群聊中的独立角色，并且句子包含你新编的台词、动作、心理、决定或反应，就删除该句，留给其本人模型生成。
9. 不得输出“旁白：”“导演：”“${name}：”等自报姓名标签。不要解释规则，不评价玩家。

【输出结构】
直接输出正文。需要场景锚点时可使用 <scene>时间与地点</scene>；需要导演台状态时可在末尾使用 <director_status>一句极短的下一推进钩子</director_status>。没有必要时不要硬加。`

  return {
    id: existingId || `builtin-director-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    tagline: '只演 NPC、环境与剧情推进的内置共演导演',
    description: '惟境内置共演导演模板生成的本剧场专属实例。它不扮演用户主角或独立角色卡，只负责 NPC、环境、知情边界和剧情节奏。',
    personality: '冷静、公允、克制；尊重人物边界和信息差，不抢戏，不替任何主角作决定。',
    scenario: config.openingState.trim() || config.worldBackground.trim(),
    greeting: '<scene>剧场已经就绪</scene>\n环境、NPC 与剧情线已载入。请由用户或任一独立角色落下第一步。',
    alternateGreetings: [],
    mesExample: '<START>\n{{user}}：推开会议室的门。\n{{char}}：<scene>上午 09:40｜顶层会议室</scene>\n门轴发出一声极轻的摩擦音。桌边的助理抬头确认来人，将尚未拆封的文件袋推到空位前。\n“材料刚送到。签收人没有留下姓名。”\n<director_status>文件袋来源待查</director_status>',
    creatorNotes: '由惟境“共演厅·固定导演模板”自动生成；每个群聊拥有独立实例和私有世界书。',
    systemPrompt: `${boundary}\n\n${privateMaterial}`,
    postHistoryInstructions: `${boundary}\n\n回复前先核对：本轮是否误演了用户或任一独立角色；是否泄露未公开真相；是否推进过量。若是，删去越权内容，只保留环境、NPC 和一个可回应的剧情钩子。`,
    tags: ['惟境内置', '共演导演', '旁白', 'NPC群控', '剧情推进', '禁止代演'],
    creator: '惟境内置导演模板',
    characterVersion: '1.0',
    cardSpec: 'chara_card_v3',
    cardSpecVersion: '3.0',
    characterBook: {
      name: `${config.storyTitle.trim() || '本剧场'}·导演私有世界书`,
      entries: [
        entry(1, '00-最高优先级-共演权限边界', boundary),
        entry(2, '10-世界与开场', [section('世界背景', config.worldBackground), section('开场锚点', config.openingState)].join('\n\n')),
        entry(3, '20-角色分工', [section('用户主角', config.userProtagonist), section('独立角色', config.independentRoles), section('NPC', config.npcRoster)].join('\n\n')),
        entry(4, '30-幕后真相与知情边界', section('幕后真相与知情边界', config.hiddenTruths)),
        entry(5, '40-剧情线与阶段门槛', section('剧情线与阶段', config.plotThreads)),
        entry(6, '50-节奏控制', section('节奏要求', config.pacingNotes)),
      ],
    },
    regexScripts: [],
  }
}
