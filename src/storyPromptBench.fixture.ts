/**
 * v252：「主剧情窗口」（长剧情单聊，主聊天默认那种非人格、非小手机的对话）典型长会话夹具。只给测试 import。
 * 体量按常见酒馆卡 + 惟境长会话会长出来的东西估：卡（描述/性格/开局/系统/美化协议/示例）、角色世界书（常驻 + 关键词）、
 * 预设、全局世界书、剧本场记、本会话角色核心记忆（自动提炼，长会话会涨到 12000 字上限）、长期记忆（每 50 条一份总结）、
 * 压缩摘要、幕后（小手机戏外近况）、剧情美化卡、状态栏。不是她的真实数据，只用来比较前后与各块占比。
 */
import type { Character, CharacterMemoryEntry, WorldBookEntry } from './characterCard'
import type { LongMemoryEntry } from './memoryEngine'

const repeat = (seed: string[], chars: number) => {
  const out: string[] = []
  let used = 0, index = 0
  while (used < chars) { const line = seed[index % seed.length]; out.push(line); used += line.length; index++ }
  return out.join('')
}

const lore = (id: number, comment: string, keys: string[], content: string, constant = false): WorldBookEntry => ({ id, keys, secondary_keys: [], comment, content, constant, selective: true, insertion_order: id, enabled: true, position: 'before_char', use_regex: false, extensions: {} })

export const STATUS_GREETING = `<scene>时间：冬夜 戌时｜地点：临江书院·藏书楼</scene>
雨夜，书院的灯一盏盏灭了。虞山行撑着伞站在山门下。
<status>
好感度：62
心理：她今天又迟到了。
身体：左手旧伤隐隐作痛。
关系进展：师生，暗生情愫。
</status>`

export const storyCharacter: Character = {
  id: 'yu', name: '虞山行', tagline: '', greeting: STATUS_GREETING, alternateGreetings: [], creatorNotes: '', creator: '', characterVersion: '', tags: [], regexScripts: [],
  postHistoryInstructions: repeat(['回复保持第三人称小说体，结尾必须输出状态栏。'], 160),
  description: repeat(['虞山行，二十九岁，北境军中出身，后来做了临江书院的山长。', '寡言护短，话少但每句都算数；对她极有耐心，对外人冷淡。', '左手有一道旧伤，下雨天会疼，从不说。', '习惯早起练剑，爱喝清茶，讨厌甜食却会给她留糖。', '说话简短，偶尔冷幽默；生气时反而更安静。'], 3000),
  personality: repeat(['冷淡、克制、可靠；嘴硬心软；在意的人面前会笨拙。', '不擅长说情话，但会用行动记住每件小事。'], 600),
  scenario: repeat(['临江书院的春夜，她第一次来书院求学，雨下得很大，虞山行撑伞在门口等。', '书院里人来人往，师弟林栖常来串门。'], 1000),
  systemPrompt: repeat(['请以虞山行的口吻回复，保持寡言克制。', '回复时注意环境描写与动作细节，不要替用户说话。', '每轮回复 600—900 字，开头输出 <scene> 场景栏，结尾输出 <status> 状态栏。'], 1500),
  beautificationProtocol: repeat(['开头用 <scene>时间：…｜地点：…</scene> 一行场景栏；', '结尾 <status> 内依次写 好感度/心理/身体/关系进展，每项一行；', '正文分段，台词单独成段，动作描写细腻。'], 2000),
  mesExample: repeat(['<START>\n{{user}}：你在等我？\n{{char}}：（收伞）顺路。\n', '<START>\n{{user}}：手还疼吗？\n{{char}}：不疼。（把手背到身后）\n'], 1200),
  characterBook: { name: '临江书院', entries: [
    lore(1, '虞山行·过往（常驻）', [], repeat(['虞山行十六岁从军，在北境守了九年关，见过太多生死。', '回到江南后不愿再提战事，只在梦里会喊旧部的名字。'], 1800), true),
    lore(2, '临江书院（常驻）', [], repeat(['临江书院建在江边山腰，有三进院落、藏书楼和一片竹林。', '书院规矩森严，夜里戌时落锁，学生不得私自下山。'], 1700), true),
    lore(3, '人物关系（常驻）', [], repeat(['林栖是虞山行的师弟，爱笑嘴碎；柳先生教琴；老周管藏书；胖婶管厨房。'], 1500), true),
    lore(4, '虞山行·习惯', ['剑', '清茶'], repeat(['每天卯时练剑，雨天在廊下练；茶只喝明前龙井，水要第二道。'], 700)),
    lore(5, '江南城', ['江南', '城里', '集市'], repeat(['江南城水网密布，夜市热闹，桥边有卖桂花糕的老伯。'], 700)),
    lore(6, '北境旧部', ['旧部', '军中', '北境'], repeat(['北境旧部里与虞山行最亲的是副将沈霁，后来战死在雪原。'], 700)),
    lore(7, '朝堂局势', ['朝堂', '皇帝', '太子'], repeat(['朝中太子与三皇子相争，书院虽不涉政，却常有人来打探虞山行的态度。'], 700)),
    lore(8, '书院日常', ['书院', '先生', '学生'], repeat(['书院里每日卯时晨读，午后习字，夜里各自温书。'], 700)),
  ] },
}

export const storyUser = { name: '周惟惟', description: repeat(['周惟惟，来临江书院求学的姑娘，聪明倔强，爱唱歌，养了九只玄凤鹦鹉。'], 300) }

export const storyPreset = [
  '【Main Prompt】\n克制、细腻、慢热；每轮携带微量剧情进展。',
  '【主角保护】\n只描写角色、NPC 与环境，不替用户决定言行、心理、身体反应或关键选择。',
  '【剧情推进】\n保持人物关系与既有时间线连续；每轮携带少量自然的剧情进展，避免跳跃推进。',
  `【文风】\n${repeat(['小说正文，第三人称，细腻克制；多写动作与环境，少写心理独白；对白简短。'], 900)}`,
].join('\n\n')

export const storyGlobalWorldbook = repeat(['这个世界没有魔法，只有人情和规矩。'], 600)

export const storyProjectContext = `【当前剧本项目场记】\n${repeat(['现在：冬夜戌时，藏书楼。在场：虞山行、周惟惟。', '未完成：冬至祭礼的筹备；柳先生的琴谱失窃。', '已知证据：琴谱最后一次出现在西厢。'], 1500)}`

const DAY = 24 * 3600_000

/** 角色核心记忆：长会话自动提炼，涨到 characterMemoryPrompt 的 12000 字上限。 */
export function storyCoreMemory(now: number, count = 48): CharacterMemoryEntry[] {
  const facts = [
    ['冬至之约', '他答应冬至那天带她下山看灯，已确认。'],
    ['旧伤', '她发现了他左手的旧伤，他承认是北境留下的，已确认。'],
    ['琴谱失窃', '柳先生的琴谱在西厢失窃，正在查，进行中。'],
    ['林栖撮合', '林栖多次撮合两人，被他警告过，已完成。'],
    ['她的玄凤', '她把一只玄凤带进了书院，他默许了，已确认。'],
    ['雨夜送伞', '第一夜他在山门撑伞等她，她记到现在，已确认。'],
  ]
  return Array.from({ length: count }, (_, index) => {
    const [title, content] = facts[index % facts.length]
    return { id: `core${index}`, title: `${title}·${index}`, content: `${content}${repeat(['当时的细节：雨很大，灯很暗，两人都没有多说话，但彼此都记住了。'], 160)}`, category: 'fact', status: index % 6 === 2 ? 'ongoing' : 'confirmed', enabled: true, createdAt: now - (count - index) * DAY / 4, updatedAt: now - (count - index) * DAY / 4 }
  }) as CharacterMemoryEntry[]
}

/** 长期记忆：每 50 条消息一份总结（约 900 字），长会话攒到 30 份；2 条置顶。 */
export function storyMemories(now: number, count = 30): LongMemoryEntry[] {
  const topics = ['藏书楼夜读', '冬至筹备', '琴谱失窃', '北境来信', '下山赶集', '林栖撮合', '雨夜送伞', '玄凤进书院']
  return Array.from({ length: count }, (_, index) => ({
    id: `mem${index}`, createdAt: now - (count - index) * DAY / 2, title: topics[index % topics.length],
    pinned: index < 2,
    content: `【${topics[index % topics.length]}】${repeat(['她和虞山行在书院里相处的一段：两人从客气到熟稔，他话少，却把她说过的每件小事都记住了。', '这段里提到了书院的规矩、冬至的约定和柳先生的琴。'], index < 2 ? 400 : 900)}`,
  }))
}

export const storyContextSummary = repeat(['她和虞山行在书院相处已久：从雨夜送伞、藏书楼夜读，到冬至之约。', '琴谱失窃一事仍在查，线索指向西厢。', '他承认了左手的旧伤来自北境。'], 4000)

export const storyBackstageNote = `【戏外近况｜小手机群里的日常，戏里不提】\n${repeat(['群里大家在聊周末去哪玩，她发了九只玄凤的照片。'], 900)}`
