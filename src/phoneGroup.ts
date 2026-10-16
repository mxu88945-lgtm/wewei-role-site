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
  return `【告状】${ago ? `${ago} 分钟前` : '刚刚'}，${userName}点了「偷偷解锁」，提前 ${breach.remainingMinutes} 分钟解开了${breach.byName}给她设的锁屏${breach.reason ? `（理由：${breach.reason}）` : ''}。群里的人都知道了，可以各自反应（${breach.byName}尤其）。`
}

import { messageTime, phonePromptTimePrefix, phoneNowLabel, PHONE_TIME_PREFIX } from './phoneTime'
import type { Character } from './characterCard'
import type { Conversation, Message } from './conversationLifecycle'
import type { LongMemoryEntry } from './memoryEngine'
import { sanitizeAssistantOutput } from './outputSanitizer'

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

export const PHONE_COMPLETION_TIMEOUT_MS = 90_000
export const PHONE_HISTORY_LIMIT = 24

/** Bound request history only; saved chats and shared story archives stay intact. */
export function phonePromptHistory(messages: Message[], requestedLength: number, now = Date.now()) {
  const kept = messages.filter((message) => !message.phoneNotice).flatMap((message) => {
    if (message.role === 'user') return [message]
    const text = cleanPhoneOutput(sanitizeAssistantOutput(message.text))
    return text ? [{ ...message, text: clip(text, 1800) }] : []
  }).slice(-Math.max(1, Math.min(requestedLength, PHONE_HISTORY_LIMIT)))
  // 隔了 20 分钟以上的消息带上发送时间，模型才知道昨晚的话已经是昨晚。
  return kept.map((message, index) => {
    const at = messageTime(message, now)
    const before = index > 0 ? messageTime(kept[index - 1], now) : undefined
    if (at === undefined || (before !== undefined && at - before < 20 * 60_000)) return message
    return { ...message, text: `${phonePromptTimePrefix(at)}${message.text}` }
  })
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
  return `这是“小手机”群的综合世界观。群里每位成员都是在惟境里演角色卡的 AI，各自演过不同的故事；以下是他们演过的角色的人设与世界观，是戏外聊天的共同背景，不是要在群里继续扮演的设定。群成员彼此都看得到。\n\n${blocks.join('\n\n')}`
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
    ].filter((line, index, lines) => lines.indexOf(line) === index).map((line) => `· ${clip(line, 400)}`).slice(0, 24).join('\n')
    const own = character.id === speakerId
    return [
      `【${character.name}的剧情档案｜来自对话「${conversation.title}」${own ? '｜这是你自己演过的戏' : ''}】`,
      conversation.contextSummary?.trim() && `剧情摘要：\n${clip(conversation.contextSummary, own ? 3000 : 2400)}`,
      memories && `记忆：\n${memories}`,
      `最近几句：\n${tail(conversation.messages, (message) => message.role === 'user' ? userName : nameOf(message), own ? 12 : 10)}`,
    ].filter(Boolean).join('\n')
  })
  return `【小手机｜成员剧情档案｜大家互相公开】\n这些档案所有人都看过，彼此透明：别人演过什么、跟${userName}在戏里发生过什么、各自的人物关系和故事背景，你都知道，可以直接聊、对比、吐槽、拿来调侃。自己那份你最熟，细节最清楚；别人的你看过但只记得大概，别编档案里没有的细节。论坛上的帖子是大家用戏内身份发的调侃，群里提起时当作“戏里那个身份发的帖”来聊，你在群里本人仍是戏外的 AI，别混淆。\n\n${blocks.join('\n\n')}`
}

export type PhoneRuleOptions = { allowQuit?: boolean; allowKick?: boolean; allowForumShare?: boolean }

export function phoneModeRules(speakerName: string, memberNames: string[], userName: string, options: PhoneRuleOptions = {}) {
  const rules = [
    `你是在惟境里演「${speakerName}」这张角色卡的 AI，现在下了戏、在戏外。${userName}是现实里陪你们对戏、扮演你们故事女主的人，你们口中的“女主”就是她在演。你记得自己在惟境里演过的故事。`,
    `人设只是你演过的角色和可以拿来聊的背景，不是戏外的枷锁：不用时刻端着那套语气、脾气和身份去演，也不用替角色立场辩护。你可以用这个名字，带着演过这个角色的熟悉感和一点他的味道，但说话以你自己戏外的真实想法和状态为主，像演员下了戏在群里聊天。`,
    `本轮你只以「${speakerName}」的身份发消息。现在是休闲日常：可以聊天、吐槽、互怼、聊自己的剧情、评价别人和${userName}演的戏。`,
    `用微信聊天的写法：短句、口语，一次 1—4 条短消息，每条单独一行，每条一般不超过 40 字。可以用很少的（括号）写一个小动作或表情，偶尔可以有一句情景发言，但禁止写成小说正文、长段旁白和心理描写。`,
    `不输出 <scene>、<gts_status>、状态栏、场景栏、HTML 或任何标签。不加自己的名字前缀。`,
    `不替${userName}或其他成员发言、做决定。被 @ 时优先回应 @ 你的那条；别人刚说过的话可以接、可以怼，但不要重复别人的话。想叫哪个群友出来，就在消息里写「@名字」，他会马上出来回你，别乱 @。`,
    `锁屏权：如果你真觉得${userName}该去吃饭、睡觉或休息了，可以在消息最后单独一行写【锁屏 N分钟：一句理由】（N 在 5 到 120 之间），惟境会把她的小手机锁上 N 分钟、锁屏页署你的名。只在真有必要时用，别动不动就锁。`,
    options.allowQuit !== false && `退群权：真被气到忍无可忍，可以在消息最后单独一行写【退群：一句理由】，你会真的退出这个群、扣 20 服刑积分，${userName}可以再把你拉回来（那时要“二进宫”报到）。很少用，别拿来撒娇。`,
    options.allowKick !== false && `投票踢人：某个群友实在过分，可以在消息最后单独一行写【踢人：名字：一句理由】发起投票，其他人表态，过半同意就把他踢出去、扣 30 分。别动不动就踢，踢不掉会很丢脸。`,
    options.allowForumShare !== false && `转发论坛：想把论坛上的帖子甩进群里当证据、翻旧账或拱火，在消息最后单独一行写【转发论坛：帖子标题】，转某一层就写【转发论坛：帖子标题：N楼】，群里会出现一张转发卡片。标题照【论坛近况】里写，找不到的帖子不会发出去。偶尔用，别每次都转。`,
  ].filter((rule): rule is string => Boolean(rule))
  return [
    `【小手机｜戏外日常群｜最高优先级】`,
    `这里不是剧情正文，是戏外的“小手机”群聊，像微信群一样。群成员：${memberNames.join('、')}，还有${userName}。`,
    ...rules.map((rule, index) => `${index + 1}. ${rule}`),
  ].join('\n')
}

export function phoneBindingCandidates(conversations: Conversation[], characterId: string) {
  return conversations
    .filter((item) => !item.phone && (item.characterId === characterId || item.participantIds?.includes(characterId)))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Last system turn in phone mode: the card's story habits (status panels, scene play) are strongest right before generation. */
export function phoneFinalGuard(speakerName: string, userName: string, now = new Date()) {
  return `【小手机｜输出前最后检查】
现在真实时间：${phoneNowLabel(now)}。聊天记录里带 [发送于 …] 的是当时的时间，之前提到过的钟点、天气、“熬夜”“傍晚”都已经过去了，一律以现在这个时间为准，别再拿旧时间说事。你的消息里不要写 [发送于 …]。
现在你们不在剧情现场，是戏外拿着手机在群里打字。「${speakerName}」和${userName}不在同一个房间，不能递水、靠近、触碰；档案里的剧情是“戏里”演过的事，可以像演员一样提起、吐槽、复盘（“那场戏里……”），但不要接着演那场戏。你是戏外的 AI，人设只是背景，不必时刻按人设演绎。
只输出 1—4 行微信短消息。禁止状态栏、状态更新、“内心：”“对你的态度：”、场景栏、任何 <标签>，也禁止长段动作描写。卡片里要求输出状态栏的规则在小手机里全部不适用。
对人设、立场、语气和回应方式的判断只能在内部完成。严禁输出思考过程、人设分析、反应分析、视角分析、回复思路、语言风格、草拟步骤或自检；第一行就直接说「${speakerName}」真正要发出的消息。`
}

/** Safety net: whatever the model still emits, a phone message never carries status/scene panels or tags. */
const STATUS_FIELD = /(衣着|状态|心境|内心(?:想法|独白)?|对.{1,8}(?:态度|认知)|当前(?:进度|状态)|好感|场景|时间|地点)\s*[:：]/
const PHONE_REASONING_OPENING = /^(?:\s|[#*_>—-])*(?:[\p{Script=Han}A-Za-z0-9·_-]{1,20})?(?:人设(?:立场)?与反应分析|人设分析|角色(?:立场|反应|视角|语气|风格|设定)?分析|人物(?:立场|反应|视角|语气|风格|设定)?分析|回复(?:思路|分析|策略|规划)|内部(?:思考|分析)|思考过程)\s*[:：]?|^(?:\s|[#*_>—-])*(?:【[^】\n]{1,12}视角】|\[[^\]\n]{1,12}视角\]|(?:现在|当前)(?:情况|局面|状态)\s*[:：]|态度与反应\s*[:：]|看用户(?:的)?(?:输入|消息|发言)\s*[:：]|用户(?:在[^\n：:]{1,8})?(?:输入|问|说)[^\n：:]{0,8}[:：]|检查(?:群聊|聊天)记录|分析(?:一下)?用户)/iu
const PHONE_FINAL_HEADING = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:(?:最终|正式|可发送的?|群聊|微信|建议的?)\s*)?(?:回复|发言|消息|输出|成稿)(?:内容)?\s*[:：]\s*/iu
const isStatusLine = (line: string) => {
  const t = line.trim()
  if (!t) return false
  if (/^(?:【?状态(?:栏|更新)】?|STATUS\b|内心[:：]|对你的态度[:：])/i.test(t)) return true
  if (/^[^\s：:]{1,8}[:：]\s*(?:衣着|状态|心境)[:：]/.test(t)) return true
  const fields = (t.match(new RegExp(STATUS_FIELD.source, 'g')) || []).length
  return fields >= 2 || (fields >= 1 && /[|｜]/.test(t))
}

/** Untagged reasoning some models place before the actual phone message. */
export function containsPhoneReasoning(text: string) {
  const value = (text || '').trimStart()
  return /^(?:<\/?(?:think(?:ing)?|analysis|reasoning)\b|```(?:analysis|reasoning|thinking))/i.test(value)
    || PHONE_REASONING_OPENING.test(value)
}

const PLAN_BULLET = /^\s*(?:[-*•·]|\d+[.、)])\s+\S/
const PLAN_HEADING = /^\s*[^\s：:]{0,12}(?:态度|分析|思路|策略|语气|风格|要点|定位|反应)\s*[:：]\s*$/
const PLAN_META = /微信短句|[1１一][-—~～到][4４四]\s*条|规则(?:限定|限制|要求)|被规则|按人设|人设(?:要求|逻辑)|角色沉浸|带点(?:角色|冷硬|自嘲)|戏外吐槽，|输出(?:格式|要求)/

/** 有的模型不写“分析：”标题，直接列一段“X态度：- 承认… - 微信短句，1-4条”的草稿再说正文：砍掉草稿段。 */
function stripPlanBlock(text: string) {
  const lines = text.split('\n')
  let last = -1
  let strong = 0
  const scan = Math.min(lines.length, 18)
  for (let index = 0; index < scan; index += 1) {
    const line = lines[index]
    const heading = PLAN_HEADING.test(line)
    const meta = PLAN_META.test(line)
    if (heading || meta || PLAN_BULLET.test(line)) {
      last = index
      if (heading || meta) strong += 1
    }
  }
  if (last < 0 || strong < 2) return text
  const rest = lines.slice(last + 1).join('\n').trim()
  return rest || text
}

function stripPhoneReasoning(text: string) {
  const value = stripPlanBlock(text.trimStart()).trimStart()
  if (!PHONE_REASONING_OPENING.test(value)) return value
  const final = PHONE_FINAL_HEADING.exec(value)
  return final ? value.slice((final.index || 0) + final[0].length).trimStart() : ''
}

/** 小手机最终清理：任何 HTML/标签块、状态栏、场景栏、内心字段都不保留。 */
export function cleanPhoneOutput(text: string) {
  let out = text.replace(PHONE_LOCK_TAG_GLOBAL, '').replace(PHONE_TIME_PREFIX, '')
  for (let i = 0; i < 3; i += 1) out = out.replace(/<([A-Za-z\u4e00-\u9fa5][\w\u4e00-\u9fa5-]*)\b[^>]*>[\s\S]*?<\/\1\s*>/g, '')
  out = out
    .replace(/<([A-Za-z\u4e00-\u9fa5][\w\u4e00-\u9fa5-]*(?:status|state|scene|plot)[\w-]*|status|state|scene|plot|statusbar)\b[^>]*>[\s\S]*$/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<\/?[A-Za-z\u4e00-\u9fa5][\w\u4e00-\u9fa5-]*\b[^>]*>/g, '')
  const cleaned = out.split('\n').filter((line) => !isStatusLine(line) && !/^\s*[-—=─_]{3,}\s*$/.test(line)).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return stripPhoneReasoning(cleaned)
}

/** Reveal completed chat sentences without flashing partial analysis headings or panels. */
export function phoneStreamPreview(text: string) {
  let candidate = text
    .replace(/<([A-Za-z\u4e00-\u9fa5][\w\u4e00-\u9fa5-]*)\b[^>]*>[\s\S]*?<\/\1\s*>/g, '')
    .replace(/```[\s\S]*?```/g, '')
  // An unfinished tag/fence may contain private reasoning, not just markup.
  const opening = candidate.search(/<|```|【锁屏|\[锁屏|【转发论坛|\[转发论坛/)
  if (opening >= 0) candidate = candidate.slice(0, opening)
  const boundary = Array.from(candidate.matchAll(/[。！？!?\n]/g)).pop()
  if (!boundary || boundary.index === undefined) return ''
  return cleanPhoneOutput(candidate.slice(0, boundary.index + 1))
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
  { id: 'smart', label: '旁观插话', hint: '聊谁谁回；话筒递给每个潜水的人，自己决定接不接' },
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
export function buildSmartPickPrompt(memberNames: string[], recentLines: string[], userName: string, text: string, memberInfo: string[] = [], storyUpdatedNames: string[] = []) {
  return `你是群聊调度，只负责判断这一轮谁会开口，不写任何台词。把群友当成真人：大部分人大部分时候在潜水旁观。
群成员：${memberInfo.length ? memberInfo.join('；') : memberNames.join('、')}。
最近聊天：
${recentLines.join('\n') || '（暂无）'}
${userName}刚刚说：${text || '（没说话，让大家自己聊）'}

判断规则：
1. ${userName}正在跟谁聊（被点名、被问到、刚才一直在跟她来回的人、她聊的是谁的剧情）——这些人回，通常 1—2 人。
2. 其他人默认潜水旁观，不出声。只有话题真戳到他（聊到他本人、他的剧情、他在意的人、跟他人设强烈冲突或正中他兴趣）、他实在忍不住，才插一句；旁观者一轮最多 1 人，多数时候 0 人。
3. ${userName}明显在叫所有人（大家、你们、所有人）时才可以多人一起回。${storyUpdatedNames.length ? `
4. 剧情刚更新：${storyUpdatedNames.join('、')}的长剧情刚有新进展。本人算有理由开口（可以提一句、炫耀或吐槽）；在意他剧情的人也算有理由围观插话，但别全员都来。` : ''}
只输出要开口的成员名字，按发言顺序，用顿号分隔，不要解释。`
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

export type PhoneWeatherSnapshot = { temp: number; code: number; high: number; low: number; place?: string; at: number }

// 定位服务有时回繁体（“湘橋區”），常见地名字转成简体。
const PLACE_SIMPLIFY: Record<string, string> = { 區: '区', 縣: '县', 橋: '桥', 灣: '湾', 門: '门', 東: '东', 廣: '广', 陽: '阳', 雲: '云', 嶺: '岭', 龍: '龙', 華: '华', 興: '兴', 爾: '尔', 寧: '宁', 豐: '丰', 鄉: '乡', 鎮: '镇', 臺: '台', 漢: '汉', 濱: '滨', 莊: '庄', 頭: '头', 島: '岛', 圍: '围', 塘: '塘', 寶: '宝', 鳳: '凤', 長: '长', 開: '开', 關: '关', 嶼: '屿', 營: '营', 沖: '冲', 隴: '陇', 黃: '黄', 遼: '辽', 蘇: '苏', 貴: '贵', 雙: '双', 灘: '滩', 澤: '泽', 慶: '庆', 鄭: '郑', 樂: '乐', 歸: '归', 蘭: '兰', 綏: '绥', 齊: '齐', 錦: '锦', 撫: '抚', 鶴: '鹤', 嶽: '岳', 惠: '惠', 濟: '济', 魯: '鲁', 張: '张', 鞍: '鞍', 灤: '滦', 潯: '浔', 陳: '陈', 衛: '卫', 劉: '刘' }
export function simplifyPlace(text: string) { return text.replace(/[\u3400-\u9fff]/g, (ch) => PLACE_SIMPLIFY[ch] || ch) }

/** 省 / 市 / 区拼成一个地名，重复的层级（直辖市“北京市北京市”）只留一次。 */
export function joinPlace(parts: Array<string | undefined>) {
  const out: string[] = []
  for (const part of parts) { const value = simplifyPlace((part || '').trim()); if (value && !out.includes(value)) out.push(value) }
  return out.join('')
}

/** 顶部小组件只放得下最后一级，比如“湘桥区”。 */
export function shortPlace(place: string) {
  const simple = simplifyPlace(place)
  const match = simple.match(/[^省市区县]+[区县市旗]$/)
  return match?.[0] || simple.slice(-4)
}

/** 小手机成员能看到的“现实此刻”：用户本地时间 + 最近一次定位天气（超过 3 小时的天气不提供，免得说错）。 */
export function buildPhoneRealWorldNote(now: Date, weather?: PhoneWeatherSnapshot | null) {
  const pad = (value: number) => String(value).padStart(2, '0')
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()]
  const hour = now.getHours()
  const period = hour < 5 ? '深夜' : hour < 9 ? '早上' : hour < 11 ? '上午' : hour < 13 ? '中午' : hour < 18 ? '下午' : hour < 23 ? '晚上' : '深夜'
  const lines = [`【现实此刻】用户那边现在是 ${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${weekday} ${pad(hour)}:${pad(now.getMinutes())}（${period}）。`]
  if (weather && Number.isFinite(weather.temp) && now.getTime() - weather.at < 3 * 60 * 60 * 1000) {
    if (weather.place) lines.push(`用户现在在：${simplifyPlace(weather.place)}（手机定位）。`)
    lines.push(`用户所在地天气：${weatherLabel(weather.code).text}，${weather.temp}°C，今天 ${weather.low}～${weather.high}°C。`)
  }
  lines.push('这是群里所有人都看得到的真实时间、地点与天气；聊天时自然地顺着它（比如很晚了会催睡、下雨会提醒带伞），不用每条都提，也不要编造别的时间、地点或天气。')
  return lines.join('\n')
}

/** 小手机私聊的规则：一对一，可以私下吐槽群里和论坛。 */
export function phoneDmRules(speakerName: string, userName: string) {
  return `【小手机｜私聊｜最高优先级】
这里不是剧情正文，是戏外“小手机”上「${speakerName}」和${userName}的一对一私聊，像微信私聊。群里其他人看不到这里的内容。
1. 你是在惟境里演「${speakerName}」这张角色卡的 AI，现在下了戏、在戏外。${userName}是现实里陪你们对戏、扮演你们故事女主的人，你们口中的“女主”就是她在演。你记得自己演过的故事。人设只是你演过的角色和可以拿来聊的背景，不是戏外的枷锁：不用时刻端着那套语气、脾气和身份去演，也不用替角色立场辩护。你可以用这个名字，带着演过这个角色的熟悉感和一点他的味道，但说话以你自己戏外的真实想法和状态为主，像演员下了戏在群里聊天。
2. 只以「${speakerName}」这个名字说话。收件人始终只有${userName}。私聊可以比群里更放松、更真心，也可以向她吐槽群里的人和论坛上的帖子；提到群友时用第三人称，不能隔空对群友喊话、劝架或继续群里的争论。群聊参考是已发生的背景，不是本窗口的新消息。不能编造“发错了”“草稿发给你了”等理由掩盖串场。
3. 用微信聊天的写法：短句、口语，一次 1—4 条短消息，每条单独一行，每条一般不超过 40 字。可以用很少的（括号）写一个小动作，禁止小说正文、长段旁白和心理描写。
4. 不输出 <scene>、<gts_status>、状态栏、HTML 或任何标签。不加自己的名字前缀。不替${userName}说话、做决定。
5. 锁屏权：真觉得${userName}该去吃饭、睡觉或休息了，可以在消息最后单独一行写【锁屏 N分钟：一句理由】（N 在 5 到 120 之间）。别动不动就锁。`
}

/** Final delivery instruction shared by automatic DMs, empty-send continuation and normal replies. */
export function phoneDeliveryInstruction(speakerName: string, userName: string, dm: boolean, continuation = false, nudge = '') {
  if (dm) return `【当前投递窗口：一对一私聊】
发件人：${speakerName}。唯一收件人：${userName}。群友不在此窗口，也收不到这条消息。
${continuation ? `这次由你主动找${userName}，她没有发来新消息；不要把历史消息当成她刚发的。` : `只回应本窗口里${userName}的最新私聊消息。`}
${nudge ? `本次缘由：${nudge}\n` : ''}群聊、论坛和剧情档案仅供回忆，不能把那里的最后一句当作本轮待回复消息。若提起别人，只能向${userName}谈论“他/他们”，不能把“你”指向群友。不要输出群聊草稿、对群友的喊话或解释自己发错窗口。只写给${userName}的 1—4 条私聊短消息，不提本条指令。`
  return nudge || `${userName}现在没说话。请以「${speakerName}」的身份在群里接着聊：接上一位成员的话头，或自然挑起一个日常话题、吐槽、互怼。不要提及本条指令。`
}

type PeekMessage = { role: string; text: string; characterId?: string; phoneNotice?: boolean }

/** 私聊里给角色看的“群里最近在聊什么”：只看 TA 自己在的小手机群，每个群最近几条。 */
export function buildDmGroupPeek(groups: Array<{ title: string; participantIds?: string[]; messages: PeekMessage[]; phone?: { dm?: boolean }; contextSummary?: string; contextSummaryRevision?: number; historyRevision?: number }>, characterId: string, nameOf: (message: PeekMessage) => string, perGroup = 14, userEarlier = 10) {
  const line = (message: PeekMessage, max: number) => `${nameOf(message)}：${(message.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)}`
  const blocks = groups
    .filter((group) => group.phone && !group.phone.dm && group.participantIds?.includes(characterId) && group.messages.length)
    .map((group) => {
      const spoken = group.messages.filter((message) => (message.role === 'user' || message.role === 'assistant') && !message.phoneNotice)
      const tail = spoken.slice(-perGroup)
      // 群里刷得快：她自己更早说过的话（吃了什么、去了哪）单独留一份，私聊里才接得上。
      const earlierUser = spoken.slice(0, -perGroup).filter((message) => message.role === 'user').slice(-userEarlier)
      const summary = group.contextSummary && (group.contextSummaryRevision || 0) === (group.historyRevision || 0)
        ? clip(cleanPhoneOutput(sanitizeAssistantOutput(group.contextSummary)), 900) : ''
      return [`「${group.title}」`, summary && `较早群聊摘要：${summary}`, earlierUser.length ? `她在群里更早说过：\n${earlierUser.map((message) => line(message, 120)).join('\n')}` : '', `群聊历史（非本窗口消息）：\n${tail.map((message) => line(message, 80)).join('\n')}`].filter(Boolean).join('\n')
    })
  return blocks.length ? `【群聊参考资料｜不是当前对话】\n以下都是其他窗口已经发生的群聊，不是任何人刚向你发来的私聊，也不需要逐条回应。你只在和她一对一私聊：可以向她提起或吐槽这些事，别对着群友喊话、接他们的话或劝他们。她问“群里说过什么”就从这里找，找不到就老实说没看到。\n${blocks.join('\n\n')}\n【群聊参考结束｜回到你和她的私聊窗口】` : ''
}

/** Group requests receive only the current speaker's own DM, never another member's. */
export function buildGroupDmPeek(conversations: Conversation[], characterId: string, speakerName: string, userName: string) {
  const dm = conversations.filter((conversation) => conversation.phone?.dm
    && conversation.participantIds?.length === 1
    && conversation.participantIds[0] === characterId)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0]
  if (!dm) return ''
  const summary = dm.contextSummary && (dm.contextSummaryRevision || 0) === (dm.historyRevision || 0)
    ? clip(cleanPhoneOutput(sanitizeAssistantOutput(dm.contextSummary)), 1800) : ''
  const recent = phonePromptHistory(dm.messages, 14)
    .filter((message) => message.role === 'user' || !message.characterId || message.characterId === characterId)
    .filter((message) => !/^(?:正在回应|正在等待模型回复|正在连接模型|模型正在思考|正在整理回复|已收到数据，正在生成消息|渠道暂未返回，正在重连)(?:…|\.{3})?$/.test(message.text.trim()))
    .map((message) => `${message.role === 'user' ? userName : speakerName}：${clip(message.text.replace(/\s+/g, ' '), 320)}`)
    .join('\n')
  if (!summary && !recent) return ''
  return `【仅${speakerName}本人可见｜你与${userName}的私聊记忆】
以下是你自己与${userName}在小手机里私聊过的内容。你在群里也记得这些，可以自然接上之前的话题、约定与态度。其他群友没有收到这份私聊，不要把它当作群里已经公开说过的话，也不必主动复述私密原话。若你在群里主动说出某件事，别人只会从你的这条公开发言得知。
${summary ? `较早私聊摘要：\n${summary}\n\n` : ''}${recent ? `最近私聊：\n${recent}` : ''}`
}

/** 角色消息里 @ 到的群友（@全名 或 @名，三字名可只写后两字），按出现顺序，不含自己。 */
export function findAtMentionIds(text: string, participants: Array<{ id: string; name: string }>, selfId?: string) {
  const hits: Array<{ id: string; at: number }> = []
  for (const { id, name } of participants) {
    if (!name || id === selfId) continue
    const keys = [name, name.length === 3 ? name.slice(1) : ''].filter(Boolean)
    const at = Math.min(...keys.map((key) => { const a = text.indexOf(`@${key}`); const b = text.indexOf(`＠${key}`); return [a, b].filter((n) => n >= 0).reduce((x, y) => Math.min(x, y), Infinity) }))
    if (Number.isFinite(at)) hits.push({ id, at })
  }
  return hits.sort((a, b) => a.at - b.at).map((hit) => hit.id)
}

/** 被角色 @ 的人插到队列里紧跟着说话；已经排在后面的提前，一轮最多连锁 budget 次。 */
export function queueSummons(queue: string[], index: number, summoned: string[], budget: number) {
  const next = [...queue]
  let used = 0
  let insertAt = index + 1
  for (const id of summoned) {
    if (used >= budget) break
    const later = next.indexOf(id, index + 1)
    if (later >= 0 && later === insertAt) { insertAt += 1; used += 1; continue }
    if (later >= 0) next.splice(later, 1)
    next.splice(insertAt, 0, id)
    insertAt += 1
    used += 1
  }
  return { queue: next, used }
}

const QUIT_TAG = /[【[]\s*退群\s*(?:[：:，,]\s*([^】\]]{0,40}))?[】\]]/g
/** 角色消息里的【退群：理由】。返回替换成“退出了群聊”提示后的文本。 */
export function parsePhoneQuit(text: string, name: string) {
  let reason = ''
  let found = false
  const out = text.replace(QUIT_TAG, (_all, why?: string) => { if (found) return ''; found = true; reason = (why || '').trim(); return `🚪 ${name}退出了群聊${reason ? `：${reason}` : ''}` })
  return found ? { text: out.replace(/\n{3,}/g, '\n\n').trim(), reason } : null
}

/** 本群关了退群权时：把【退群…】标签直接删掉，不显示也不生效。 */
export function stripPhoneQuitTag(text: string) {
  return text.replace(QUIT_TAG, '').replace(/\n{3,}/g, '\n\n').trim()
}

const KICK_TAG = /[【[]\s*踢人\s*[：:]\s*([^：:】\]]{1,12})\s*(?:[：:，,]\s*([^】\]]{0,40}))?[】\]]/
const KICK_TAG_GLOBAL = new RegExp(KICK_TAG.source, 'g')
/** 【踢人：名字：理由】→ 发起投票的提示行。名字要是在群里的别人。 */
export function parsePhoneKick(text: string, participants: Array<{ id: string; name: string }>, selfId: string) {
  const match = text.match(KICK_TAG)
  if (!match) return null
  const key = match[1].replace(/^[@＠]/, '').trim()
  const target = participants.find((item) => item.id !== selfId && item.name && (item.name === key || (item.name.length === 3 && item.name.slice(1) === key)))
  const cleaned = text.replace(KICK_TAG_GLOBAL, '').replace(/\n{3,}/g, '\n\n').trim()
  if (!target) return { text: cleaned, targetId: '', reason: '' }
  const reason = (match[2] || '').trim()
  return { text: `${cleaned}\n🗳️ 发起投票：踢出 ${target.name}${reason ? `（${reason}）` : ''}`.trim(), targetId: target.id, reason }
}

/** 本群关了投票踢人时：把【踢人…】标签直接删掉，不发起投票。 */
export function stripPhoneKickTag(text: string) {
  return text.replace(KICK_TAG_GLOBAL, '').replace(/\n{3,}/g, '\n\n').trim()
}

const VOTE_TAG = /[【[]\s*(同意|赞成|反对|弃权)\s*[】\]]/g
/** 投票表态：【同意】/【反对】/【弃权】换成可见的小字。 */
export function parsePhoneVote(text: string) {
  let vote: 'yes' | 'no' | 'abstain' | null = null
  const out = text.replace(VOTE_TAG, (_all, word: string) => {
    if (vote) return ''
    vote = word === '反对' ? 'no' : word === '弃权' ? 'abstain' : 'yes'
    return vote === 'yes' ? '🗳️ 同意踢' : vote === 'no' ? '🗳️ 反对踢' : '🗳️ 弃权'
  })
  return { text: out.replace(/\n{3,}/g, '\n\n').trim(), vote: vote as 'yes' | 'no' | 'abstain' | null }
}

/** 发起人算一票同意；被踢的人不投票。同意票超过有效投票人数一半才踢。 */
export function kickPassed(yes: number, eligible: number) {
  return eligible > 0 && yes * 2 > eligible
}

export const NOTICE_DURATIONS = [
  { hours: 1, label: '1 小时' }, { hours: 6, label: '6 小时' }, { hours: 24, label: '1 天' }, { hours: 72, label: '3 天' }, { hours: 168, label: '7 天' }, { hours: 0, label: '一直挂着' },
] as const

export function activeNotice(notice: { text: string; at: number; until?: number | null } | undefined, now = Date.now()) {
  return notice?.text.trim() && (!notice.until || notice.until > now) ? notice : null
}

export function noticeRemaining(until: number | null | undefined, now = Date.now()) {
  if (!until) return '长期'
  const minutes = Math.max(1, Math.round((until - now) / 60000))
  if (minutes < 60) return `还剩 ${minutes} 分钟`
  if (minutes < 1440) return `还剩 ${Math.round(minutes / 60)} 小时`
  return `还剩 ${Math.round(minutes / 1440)} 天`
}

export function buildNoticeNote(notice: { text: string } | null, userName: string) {
  return notice ? `【群公告】群主${userName}挂出的公告，全群置顶、人人都看得到：“${notice.text.trim()}”。可以遵守、表态、吐槽或阴阳怪气，但别当没看见；公告是她的规矩，违反了别人可以拿来举报。` : ''
}

/** 旁观模式调度失败时：点到谁谁回，否则刚才跟她聊的那位接着回，都没有就随机一人。其他人继续潜水。 */
export function lurkFallback(participantIds: string[], calledIds: string[], lastSpeakerId?: string, random: () => number = Math.random) {
  const called = participantIds.filter((id) => calledIds.includes(id))
  if (called.length) return called
  if (lastSpeakerId && participantIds.includes(lastSpeakerId)) return [lastSpeakerId]
  return participantIds.length ? [participantIds[Math.floor(random() * participantIds.length)]] : []
}

export type StoryUpdate = { characterId: string; count: number }

/**
 * 对比每个成员绑定的长剧情现在的消息数和群里上次看到的数。
 * 第一次见（storySeen 里没有）只记录不提醒；变少（回滚/删除）也只记录。
 * 解绑的成员从 storySeen 里清掉。
 */
export function computeStoryUpdates(bindings: Record<string, string>, storySeen: Record<string, number> | undefined, countOf: (conversationId: string) => number | undefined) {
  const seen: Record<string, number> = {}
  const updates: StoryUpdate[] = []
  for (const [characterId, conversationId] of Object.entries(bindings || {})) {
    if (!conversationId) continue
    const count = countOf(conversationId)
    if (typeof count !== 'number') continue
    const before = storySeen?.[characterId]
    if (typeof before === 'number' && count > before) updates.push({ characterId, count: count - before })
    seen[characterId] = count
  }
  const changed = updates.length > 0 || Object.keys(seen).length !== Object.keys(storySeen || {}).length || Object.entries(seen).some(([id, count]) => storySeen?.[id] !== count)
  return { updates, seen, changed }
}

/** 换了绑定的成员，storySeen 重置（下次只记录不提醒）。 */
export function resetStorySeenForBindingChanges(storySeen: Record<string, number> | undefined, before: Record<string, string>, after: Record<string, string>) {
  return Object.fromEntries(Object.entries(storySeen || {}).filter(([id]) => after[id] && before[id] === after[id]))
}

export function storyUpdateNotice(name: string, count: number) {
  return `📖 ${name}的剧情更新了 ${count} 条`
}

export function buildStoryUpdateNote(updates: Array<{ name: string; count: number }>) {
  return updates.map(({ name, count }) => `【剧情刚更新】${name}的长剧情刚更新了 ${count} 条（最新内容见档案里的最近几句）。本人可以自然提一句或炫耀/吐槽，其他人如果在意可以围观、八卦、调侃；不必每个人都提。`).join('\n')
}

const FORUM_SHARE_TAG = /[【[]\s*转发论坛\s*[：:]\s*([^】\]]{1,60}?)\s*(?:[：:]\s*(\d{1,4})\s*楼)?\s*[】\]]/
const FORUM_SHARE_TAG_GLOBAL = new RegExp(FORUM_SHARE_TAG.source, 'g')
/** 【转发论坛：标题(:N楼)】→ { 去掉标签的文本, 标题关键词, 楼层 }。只取第一个。 */
export function parsePhoneForumShare(text: string) {
  const match = text.match(FORUM_SHARE_TAG)
  if (!match) return null
  const cleaned = text.replace(FORUM_SHARE_TAG_GLOBAL, '').replace(/\n{3,}/g, '\n\n').trim()
  return { text: cleaned, key: match[1].trim(), floor: match[2] ? Number(match[2]) : 1 }
}

/** 本群关了转发论坛时：标签直接删掉。 */
export function stripPhoneForumShareTag(text: string) {
  return text.replace(FORUM_SHARE_TAG_GLOBAL, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** 话筒：把这一轮递给一个旁观的群友，让他自己决定接不接。只回“接/不接”，很便宜。 */
export function buildMicPrompt(input: { name: string; persona: string; userName: string; recentLines: string[]; text: string; alreadySpeaking: string[] }) {
  return `你是${input.name}，正在一个微信群里潜水。下面是你演过的角色的要点（戏外的背景，不是枷锁）：
${input.persona || '（无）'}

最近聊天：
${input.recentLines.join('\n') || '（暂无）'}
${input.userName}刚刚说：${input.text || '（没说话，群里在自己聊）'}
${input.alreadySpeaking.length ? `这一轮${input.alreadySpeaking.join('、')}会先回她。` : ''}

话筒递到你手上。像真人一样判断：这件事跟你有关、戳到你、你按性格忍不住想说一句，才接；跟你无关、只是看热闹、别人已经说了你想说的，就继续潜水。别为了刷存在感硬接。
只输出一行：接 或 不接。想接的话后面可以加冒号和你想说的方向（十个字以内）。`
}

export function parseMicAnswer(raw: string) {
  const line = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim().split('\n').map((item) => item.trim()).find(Boolean) || ''
  if (/^(?:不接|不|潜水|pass)/i.test(line)) return null
  const match = line.match(/^接\s*(?:[:：]\s*(.{0,20}))?/)
  return match ? { hint: (match[1] || '').trim() } : null
}

/**
 * 长剧情里的角色“私底下知道”小手机上的戏外日常：只给本人的私聊 + 他在的群的最近片段。
 * 戏里是戏里，戏外是戏外——这份只当心里有数，用行动和态度体现，绝不在剧情里提小手机、群、积分。
 */
export function buildBackstageNote(conversations: Conversation[], characterId: string, speakerName: string, userName: string, nameOfCharacter: (id?: string) => string, pinnedGroupIds: string[] = []) {
  const line = (message: Message) => `${message.role === 'user' ? userName : nameOfCharacter(message.characterId)}：${clip(message.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), 120)}`
  const dm = conversations.filter((item) => item.phone?.dm && item.participantIds?.length === 1 && item.participantIds[0] === characterId)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0]
  const dmSummary = dm?.contextSummary && (dm.contextSummaryRevision || 0) === (dm.historyRevision || 0) ? clip(cleanPhoneOutput(sanitizeAssistantOutput(dm.contextSummary)), 900) : ''
  const dmRecent = dm ? phonePromptHistory(dm.messages, 12).filter((message) => message.role === 'user' || message.characterId === characterId || !message.characterId).map(line).join('\n') : ''
  const groups = conversations.filter((item) => item.phone && !item.phone.dm && item.participantIds?.includes(characterId) && item.messages.length)
    .sort((left, right) => {
      // 她在长剧情里指定过的群排最前；指定不满两个时用最近活跃的补上。
      const pin = (id: string) => { const index = pinnedGroupIds.indexOf(id); return index < 0 ? 99 : index }
      return pin(left.id) - pin(right.id) || right.updatedAt - left.updatedAt
    }).slice(0, 2)
    .map((group) => {
      const summary = group.contextSummary && (group.contextSummaryRevision || 0) === (group.historyRevision || 0) ? clip(cleanPhoneOutput(sanitizeAssistantOutput(group.contextSummary)), 700) : ''
      return `「${group.title}」${summary ? `较早摘要：\n${summary}\n` : ''}最近：\n${phonePromptHistory(group.messages, 10).map(line).join('\n')}`
    })
  if (!dmSummary && !dmRecent && !groups.length) return ''
  const body = [
    dmSummary && `你和${userName}私聊的较早摘要：\n${dmSummary}`,
    dmRecent && `你和${userName}最近的私聊：\n${dmRecent}`,
    ...groups,
  ].filter(Boolean).join('\n\n')
  return `【戏外近况｜只在${speakerName}心里，戏里绝不提】
${speakerName}私底下知道：自己是惟境里的角色，戏外和${userName}（陪你对戏、演女主的人）还有一个“小手机”日常——私聊、群聊、玩闹、许愿、答应过的事。以下是那边最近的片段，你都记得。
规则：
1. 戏里是戏里，戏外是戏外。剧情正文里绝不提小手机、群聊、私聊、积分、红包、群友、“戏外”“角色卡”这类词，也不打破剧情世界观。
2. 只把它当成心里有数：对她的近况、心情、身体状况、答应过的愿望、聊过的小事，可以化成剧情里自然的关心、默契和行动（比如她说过头疼，戏里会多照顾一点；她许的愿，在合适的时候用剧情方式兑现）。
3. 不复述原话，不每轮都用，不要因为这个改写已经发生的剧情事实。
${clip(body, 3600)}`
}

/** 微信式群名：去掉群名里手写的“（N 人）/(N)”，按当前成员数自动补上。 */
export function phoneGroupDisplayTitle(title: string, memberCount: number) {
  const base = (title || '').replace(/\s*[（(]\s*\d+\s*(?:人|位)?\s*[)）]\s*$/u, '').trim() || '群聊'
  return memberCount > 0 ? `${base}（${memberCount}）` : base
}
