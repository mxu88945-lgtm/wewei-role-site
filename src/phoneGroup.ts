const PHONE_LOCK_TAG = /[【[]\s*锁屏\s*(\d{1,3})\s*(?:分钟|分|min)?\s*(?:[：:，,]\s*([^】\]]{0,60}))?[】\]]/
const PHONE_LOCK_TAG_GLOBAL = new RegExp(PHONE_LOCK_TAG.source, 'g')

/** 角色在小手机里下的锁屏指令：【锁屏 40分钟：去吃饭】。返回去掉指令后的文本与分钟数（限制 5–120）。 */
export function parsePhoneLockCommand(text: string): { text: string; minutes: number; reason: string } | null {
  const match = text.match(PHONE_LOCK_TAG)
  if (!match) return null
  const minutes = Math.min(120, Math.max(5, Number(match[1]) || 0))
  return { text: text.replace(PHONE_LOCK_TAG_GLOBAL, '').replace(/\n{3,}/g, '\n\n').trim(), minutes, reason: (match[2] || '').trim() }
}

export type PhoneLockState = { until: number; startedAt: number; byId: string; byName: string; reason: string }
export type PhoneLockBreach = { at: number; byName: string; remainingMinutes: number; reason: string }

/** 她偷偷解锁后 15 分钟内，群里所有人都知道。 */
export function buildPhoneLockBreachNote(breach: PhoneLockBreach | null | undefined, now: number, userName: string) {
  if (!breach || now - breach.at > 15 * 60 * 1000) return ''
  const ago = Math.max(0, Math.round((now - breach.at) / 60000))
  return `【告状】${ago ? `${ago} 分钟前` : '刚刚'}，${userName}点了「偷偷解锁」，提前 ${breach.remainingMinutes} 分钟解开了${breach.byName}给她设的锁屏${breach.reason ? `（理由：${breach.reason}）` : ''}。群里的人都知道了，可以按各自人设反应（${breach.byName}尤其）。`
}

import type { Character } from './characterCard'
import type { Conversation, Message } from './conversationLifecycle'
import type { LongMemoryEntry } from './memoryEngine'

/**
 * 小手机：戏外日常群。角色卡们知道自己是惟境里的角色，用户是现实中陪他们
 * 对戏、扮演他们故事女主的人。聊天是微信式短句，不是小说正文。
 */
export type PhoneGroupConfig = {
  /** characterId → 这张卡绑定的过往对话 id（单聊或群聊） */
  bindings: Record<string, string>
}

const clip = (value: string | undefined, max: number) => {
  const text = (value || '').trim()
  return text.length > max ? `${text.slice(0, max)}……（后略）` : text
}

/** The card as it should speak in the phone group: persona kept, every story-mode output rule dropped. */
export function phoneCharacter(character: Character): Character {
  return {
    ...character,
    greeting: '',
    alternateGreetings: [],
    mesExample: '',
    systemPrompt: '',
    postHistoryInstructions: '',
    beautificationProtocol: '',
    regexScripts: [],
  }
}

/** 综合世界观：把每位成员的人设、背景、世界观原样拼进这个群的共用背景里。 */
export function buildPhoneGroupBackground(members: Character[]) {
  const blocks = members.map((member) => {
    const world = (member.characterBook?.entries || [])
      .filter((entry) => entry.enabled !== false && entry.content?.trim())
      .slice(0, 12)
      .map((entry) => `· ${entry.comment || (entry.keys || []).join('、') || '设定'}：${clip(entry.content, 600)}`)
      .join('\n')
    return [
      `【${member.name}${member.tagline ? `｜${member.tagline}` : ''}】`,
      member.description.trim() && `人物背景：\n${clip(member.description, 2400)}`,
      member.personality.trim() && `性格：\n${clip(member.personality, 1400)}`,
      member.scenario.trim() && `所在故事：\n${clip(member.scenario, 1200)}`,
      world && `所在世界观：\n${world}`,
    ].filter(Boolean).join('\n')
  })
  return `这是“小手机”群的综合世界观。群里每位成员都是惟境里的角色卡，各自来自不同的故事；以下是他们每个人的人设与世界观，群成员彼此都看得到。\n\n${blocks.join('\n\n')}`
}

export type PhoneArchiveSource = {
  character: Character
  conversation?: Conversation
  characterMemories: Array<{ title?: string; content: string; enabled?: boolean }>
  longMemories: LongMemoryEntry[]
}

const tail = (messages: Message[], names: (message: Message) => string, count: number) => messages
  .filter((message) => message.text?.trim())
  .slice(-count)
  .map((message) => `${names(message)}：${clip(cleanPhoneOutput(message.text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), 160)}`)
  .join('\n')

/** 每位成员绑定的“过往戏份档案”：对话摘要、长期记忆、角色记忆和最近几句。 */
export function buildPhoneArchive(sources: PhoneArchiveSource[], speakerId: string, userName: string, nameOf: (message: Message) => string) {
  const blocks = sources.map(({ character, conversation, characterMemories, longMemories }) => {
    if (!conversation) return `【${character.name}的剧情档案】还没有绑定过往对话。`
    const memories = [
      ...characterMemories.filter((entry) => entry.enabled !== false).map((entry) => `${entry.title ? `${entry.title}：` : ''}${entry.content}`),
      ...longMemories.map((entry) => `${entry.title ? `${entry.title}：` : ''}${entry.content}`),
    ].map((line) => `· ${clip(line, 400)}`).slice(0, 24).join('\n')
    const own = character.id === speakerId
    return [
      `【${character.name}的剧情档案｜来自对话「${conversation.title}」${own ? '｜这是你自己演过的戏' : ''}】`,
      conversation.contextSummary?.trim() && `剧情摘要：\n${clip(conversation.contextSummary, own ? 3000 : 1500)}`,
      memories && `记忆：\n${memories}`,
      `最近几句：\n${tail(conversation.messages, (message) => message.role === 'user' ? userName : nameOf(message), own ? 12 : 6)}`,
    ].filter(Boolean).join('\n')
  })
  return `【小手机｜成员剧情档案】\n你最熟悉自己的那份档案，可以随口聊自己的剧情、吐槽自己演过的事。别人的档案你知道存在：想聊别人的细节时，可以在群里“申请查阅”某人的聊天记录，对方答应或${userName}允许后再引用；没被查阅前别把别人的隐私细节当成自己早就知道。\n\n${blocks.join('\n\n')}`
}

export function phoneModeRules(speakerName: string, memberNames: string[], userName: string) {
  return `【小手机｜戏外日常群｜最高优先级】
这里不是剧情正文，是戏外的“小手机”群聊，像微信群一样。群成员：${memberNames.join('、')}，还有${userName}。
1. 你是惟境里的角色卡「${speakerName}」，你清楚自己是角色，也记得自己在惟境里演过的故事；${userName}是现实里陪你们对戏、扮演你们故事女主的人，你们口中的“女主”就是她在演。
2. 本轮你只以「${speakerName}」的身份发消息。保持自己的人设、语气和脾气，但现在是休闲日常：可以聊天、吐槽、互怼、聊自己的剧情、评价别人和${userName}演的戏。
3. 用微信聊天的写法：短句、口语，一次 1—4 条短消息，每条单独一行，每条一般不超过 40 字。可以用很少的（括号）写一个小动作或表情，偶尔可以有一句情景发言，但禁止写成小说正文、长段旁白和心理描写。
4. 不输出 <scene>、<gts_status>、状态栏、场景栏、HTML 或任何标签。不加自己的名字前缀。
5. 不替${userName}或其他成员发言、做决定。被 @ 时优先回应 @ 你的那条；别人刚说过的话可以接、可以怼，但不要重复别人的话。
6. 锁屏权：如果你真觉得${userName}该去吃饭、睡觉或休息了，可以在消息最后单独一行写【锁屏 N分钟：一句理由】（N 在 5 到 120 之间），惟境会把她的小手机锁上 N 分钟、锁屏页署你的名。只在真有必要时用，别动不动就锁。`
}

export function phoneBindingCandidates(conversations: Conversation[], characterId: string) {
  return conversations
    .filter((item) => !item.phone && (item.characterId === characterId || item.participantIds?.includes(characterId)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Last system turn in phone mode: the card's story habits (status panels, scene play) are strongest right before generation. */
export function phoneFinalGuard(speakerName: string, userName: string) {
  return `【小手机｜输出前最后检查】
现在你们不在剧情现场，是戏外拿着手机在群里打字。「${speakerName}」和${userName}不在同一个房间，不能递水、靠近、触碰；档案里的剧情是“戏里”演过的事，可以像演员一样提起、吐槽、复盘（“那场戏里……”），但不要接着演那场戏。
只输出 1—4 行微信短消息。禁止状态栏、状态更新、“内心：”“对你的态度：”、场景栏、任何 <标签>，也禁止长段动作描写。卡片里要求输出状态栏的规则在小手机里全部不适用。`
}

/** Safety net: whatever the model still emits, a phone message never carries status/scene panels or tags. */
const STATUS_FIELD = /(衣着|状态|心境|内心(?:想法|独白)?|对.{1,8}(?:态度|认知)|当前(?:进度|状态)|好感|场景|时间|地点)\s*[:：]/
const isStatusLine = (line: string) => {
  const t = line.trim()
  if (!t) return false
  if (/^(?:【?状态(?:栏|更新)】?|STATUS\b|内心[:：]|对你的态度[:：])/i.test(t)) return true
  if (/^[^\s：:]{1,8}[:：]\s*(?:衣着|状态|心境)[:：]/.test(t)) return true
  const fields = (t.match(new RegExp(STATUS_FIELD.source, 'g')) || []).length
  return fields >= 2 || (fields >= 1 && /[|｜]/.test(t))
}

/** 小手机最终清理：任何 HTML/标签块、状态栏、场景栏、内心字段都不保留。 */
export function cleanPhoneOutput(text: string) {
  let out = text.replace(PHONE_LOCK_TAG_GLOBAL, '')
  for (let i = 0; i < 3; i += 1) out = out.replace(/<([A-Za-z\u4e00-\u9fa5][\w\u4e00-\u9fa5-]*)\b[^>]*>[\s\S]*?<\/\1\s*>/g, '')
  out = out
    .replace(/<([A-Za-z\u4e00-\u9fa5][\w\u4e00-\u9fa5-]*(?:status|state|scene|plot)[\w-]*|status|state|scene|plot|statusbar)\b[^>]*>[\s\S]*$/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<\/?[A-Za-z\u4e00-\u9fa5][\w\u4e00-\u9fa5-]*\b[^>]*>/g, '')
  return out.split('\n').filter((line) => !isStatusLine(line) && !/^\s*[-—=─_]{3,}\s*$/.test(line)).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const shuffle = <T,>(items: T[], random: () => number) => {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

/** 用户发言没 @ 人时：两个人自然接话，叫“你们/大家”时三个。 */
export function pickPhoneRepliers(participantIds: string[], lastSpeakerId: string | undefined, text: string, random: () => number = Math.random) {
  const count = /你们|大家|所有人|都/.test(text) ? 3 : 2
  const fresh = participantIds.filter((id) => id !== lastSpeakerId)
  return shuffle(fresh.length ? fresh : participantIds, random).slice(0, Math.min(count, participantIds.length))
}

/** 用户不说话时：两到三个人轮流聊，开头不是上一个说话的人。 */
export function pickPhoneChatters(participantIds: string[], lastSpeakerId: string | undefined, random: () => number = Math.random, everyone = false) {
  if (!participantIds.length) return []
  const count = everyone ? participantIds.length : Math.min(participantIds.length, 2 + Math.floor(random() * 2))
  const ordered = shuffle(participantIds.filter((id) => id !== lastSpeakerId), random)
  if (lastSpeakerId && participantIds.includes(lastSpeakerId)) ordered.push(lastSpeakerId)
  return ordered.slice(0, count)
}

export type PhoneReplyMode = 'free' | 'smart' | 'all' | 'at' | 'named'
export const PHONE_REPLY_MODES: Array<{ id: PhoneReplyMode; label: string; hint: string }> = [
  { id: 'free', label: '自然聊天', hint: '被提到的优先，否则随机两人接话' },
  { id: 'smart', label: '情境发言', hint: '看聊天内容决定一个或多个人回' },
  { id: 'all', label: '全员回复', hint: '所有人都会回你' },
  { id: 'at', label: '指定发言', hint: '只有被 @ 的人回' },
]

/** Names said plainly count in 点名 mode: full name, or the given name of a three-character name (谢聿衡 → 聿衡). */
export function findNamedParticipantIds(text: string, participants: Array<{ id: string; name: string }>) {
  return participants.filter(({ name }) => {
    if (!name) return false
    if (text.includes(name)) return true
    const given = name.length === 3 ? name.slice(1) : ''
    return Boolean(given) && text.includes(given)
  }).map(({ id }) => id)
}

export function selectPhoneSpeakers(input: { mode: PhoneReplyMode; participantIds: string[]; mentionedIds: string[]; namedIds: string[]; lastSpeakerId?: string; text: string; random?: () => number }) {
  const { participantIds, mentionedIds, namedIds } = input
  const mode = input.mode === 'named' ? 'free' : input.mode
  const at = participantIds.filter((id) => mentionedIds.includes(id))
  if (mode === 'at') return at
  const named = participantIds.filter((id) => mentionedIds.includes(id) || namedIds.includes(id))
  if (mode === 'all') return [...named, ...shuffle(participantIds.filter((id) => !named.includes(id)), input.random || Math.random)]
  if (named.length) {
    const extra = pickPhoneRepliers(participantIds.filter((id) => !named.includes(id)), input.lastSpeakerId, '', input.random).slice(0, 1)
    return [...named, ...extra]
  }
  return pickPhoneRepliers(participantIds, input.lastSpeakerId, input.text, input.random)
}

/** 情境发言：让模型只读最近几条，判断谁该回。只回名字，花费很小。 */
export function buildSmartPickPrompt(memberNames: string[], recentLines: string[], userName: string, text: string) {
  return `你是群聊调度，只负责判断这一轮谁该说话，不写任何台词。
群成员：${memberNames.join('、')}。
最近聊天：
${recentLines.join('\n') || '（暂无）'}
${userName}刚刚说：${text || '（没说话，让大家自己聊）'}

规则：被点名或被问到的人必须回；话题跟谁有关谁回；明显是对所有人说的可以多人；一般 1—3 人，最多 ${memberNames.length} 人。
只输出要回复的成员名字，按回复顺序，用顿号分隔，不要解释。`
}

export function parseSmartPick(raw: string, participants: Array<{ id: string; name: string }>) {
  const hits = participants
    .map(({ id, name }) => ({ id, index: name ? raw.indexOf(name) : -1 }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index)
  return hits.map((item) => item.id)
}


export function weatherLabel(code: number): { text: string; icon: string } {
  if (code === 0) return { text: '晴', icon: '☀️' }
  if (code <= 2) return { text: '多云', icon: '⛅️' }
  if (code === 3) return { text: '阴', icon: '☁️' }
  if (code === 45 || code === 48) return { text: '雾', icon: '🌫️' }
  if (code >= 51 && code <= 57) return { text: '毛毛雨', icon: '🌦️' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { text: code >= 65 || code === 82 ? '大雨' : '雨', icon: '🌧️' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { text: '雪', icon: '❄️' }
  if (code >= 95) return { text: '雷雨', icon: '⛈️' }
  return { text: '未知', icon: '🌡️' }
}

export type PhoneWeatherSnapshot = { temp: number; code: number; high: number; low: number; at: number }

/** 小手机成员能看到的“现实此刻”：用户本地时间 + 最近一次定位天气（超过 3 小时的天气不提供，免得说错）。 */
export function buildPhoneRealWorldNote(now: Date, weather?: PhoneWeatherSnapshot | null) {
  const pad = (value: number) => String(value).padStart(2, '0')
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()]
  const hour = now.getHours()
  const period = hour < 5 ? '深夜' : hour < 9 ? '早上' : hour < 11 ? '上午' : hour < 13 ? '中午' : hour < 18 ? '下午' : hour < 23 ? '晚上' : '深夜'
  const lines = [`【现实此刻】用户那边现在是 ${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${weekday} ${pad(hour)}:${pad(now.getMinutes())}（${period}）。`]
  if (weather && Number.isFinite(weather.temp) && now.getTime() - weather.at < 3 * 60 * 60 * 1000) {
    lines.push(`用户所在地天气：${weatherLabel(weather.code).text}，${weather.temp}°C，今天 ${weather.low}～${weather.high}°C。`)
  }
  lines.push('这是群里所有人都看得到的真实时间与天气；聊天时自然地顺着它（比如很晚了会催睡、下雨会提醒带伞），不用每条都提，也不要编造别的时间或天气。')
  return lines.join('\n')
}
