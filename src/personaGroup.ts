/**
 * v234：人格窗口「临时群聊 / 拉人进来」。
 *
 * - 主人格（窗口本人）始终在场；客人按扇窗口（thread.memberIds）拉进、请出，
 *   客人卡与他在这扇人格窗口里的记忆放在 persona.guests 里，请出后保留，拉回时记忆还在。
 * - 只有主人格时（没有在场客人、历史里也没有客人说过话），请求与之前逐字一致。
 * - 客人只说自己的话：礼物、人物档案、自我卡、点歌、任务卡只对主人格生效，客人段落里的这些标签直接丢掉。
 * - 纯函数，不读写存储，不调用模型。
 */
import type { Character } from './characterCard'
import type { PersonaMemoryEntry, PersonaMessage, PersonaThread, PersonaWindow } from './personaWindow'
import { stripPersonaFormatInstructions } from './personaWindowPresentation'

export type PersonaReplyMode = 'mention' | 'natural'

export type PersonaGuest = {
  /** 永远以 guest- 开头（和主人格的 persona- 区分）。 */
  id: string
  source: 'card' | 'custom'
  /** source=card：角色库里的卡 id（名字、头像、人设实时读卡）。 */
  characterId?: string
  name: string
  /** emoji 或图片（data:/https:）。 */
  avatar?: string
  /** 手写简卡的人设；角色卡客人不填就读卡。 */
  persona?: string
  /** 他自己的世界观（只在这扇人格窗口里，不改原卡）。 */
  world?: string
  /** v256：角色卡客人绑定的剧场/剧本（她勾选的），这些故事的经过常驻在他的卡里（≤900 字）。 */
  boundStoryIds?: string[]
  /** v287：角色卡客人带上原卡剧情、开局场景和人物关系（默认不带 = 借人不借戏）。 */
  keepStory?: boolean
  /** v286：他自己的回复渠道和模型（不填 = 跟窗口主人同一个）。群聊里每人单独请求。 */
  apiChannelId?: string
  modelName?: string
  /** 他在这扇人格窗口里的记忆：只记他在场时的事，按他的视角。 */
  memories: PersonaMemoryEntry[]
  createdAt: number
  updatedAt: number
}

export type GroupSpeaker = { id: string; name: string; avatar?: string; main: boolean }
export type ResolvedGuest = GroupSpeaker & { persona: string; world: string; memories: PersonaMemoryEntry[]; fromCard?: boolean; keepStory?: boolean }

/** 同时在场的客人上限（不含主人格）。 */
export const PERSONA_GROUP_GUEST_LIMIT = 6
/** 自然接话：每轮最多几段（几人）。 */
export const PERSONA_GROUP_NATURAL_CAP = 3
/** @ 点名：一次最多点几个人。 */
export const PERSONA_GROUP_MENTION_CAP = 4
/** 一轮回复最多预留几个消息编号。 */
export const PERSONA_GROUP_SEGMENT_CAP = Math.max(PERSONA_GROUP_NATURAL_CAP, PERSONA_GROUP_MENTION_CAP)
/** 客人记忆：自动整理的门槛（他在场的新消息条数）。 */
export const PERSONA_GUEST_MEMORY_EVERY = 40
const GUEST_LIBRARY_LIMIT = 40
const GUEST_PERSONA_MAX = 1600
const GUEST_WORLD_MAX = 1200
const GUEST_MEMORY_PROMPT_MAX = 1200

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const str = (value: unknown) => typeof value === 'string' ? value : ''
const clip = (value: string, max: number) => value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value

export const isGuestId = (id: string | undefined): id is string => Boolean(id && id.startsWith('guest-'))
export const newGuestId = () => `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
export const isImageAvatar = (avatar: string | undefined) => Boolean(avatar && /^(?:data:image\/|https?:|blob:|\/)/.test(avatar))

/** 这条回复是不是客人说的（旧消息没有 speakerId = 主人格）。 */
export const isGuestMessage = (message: Pick<PersonaMessage, 'role' | 'speakerId'>) => message.role === 'assistant' && isGuestId(message.speakerId)

export function normalizeGuests(value: unknown, normalizeMemory: (raw: unknown) => PersonaMemoryEntry | null): PersonaGuest[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const guests: PersonaGuest[] = []
  for (const raw of value) {
    if (!isRecord(raw)) continue
    const id = str(raw.id)
    const name = str(raw.name).trim().slice(0, 40)
    if (!isGuestId(id) || !name || seen.has(id)) continue
    seen.add(id)
    const source = raw.source === 'card' && str(raw.characterId) ? 'card' : 'custom'
    guests.push({
      id, source, name,
      ...(source === 'card' ? { characterId: str(raw.characterId) } : {}),
      ...(str(raw.avatar).trim() ? { avatar: str(raw.avatar).trim() } : {}),
      ...(str(raw.persona).trim() ? { persona: str(raw.persona).slice(0, 8000) } : {}),
      ...(str(raw.world).trim() ? { world: str(raw.world).slice(0, 8000) } : {}),
      ...(source === 'card' && raw.keepStory === true ? { keepStory: true } : {}),
      ...(source === 'card' && Array.isArray(raw.boundStoryIds) && raw.boundStoryIds.some((id) => typeof id === 'string' && id) ? { boundStoryIds: [...new Set(raw.boundStoryIds.filter((id): id is string => typeof id === 'string' && Boolean(id)))].slice(0, 6) } : {}),
      ...(str(raw.apiChannelId).trim() ? { apiChannelId: str(raw.apiChannelId).trim(), ...(str(raw.modelName).trim() ? { modelName: str(raw.modelName).trim().slice(0, 200) } : {}) } : {}),
      memories: (Array.isArray(raw.memories) ? raw.memories : []).map(normalizeMemory).filter((item): item is PersonaMemoryEntry => Boolean(item)),
      createdAt: Number(raw.createdAt) || 0,
      updatedAt: Number(raw.updatedAt) || 0,
    })
  }
  return guests.slice(0, GUEST_LIBRARY_LIMIT)
}

/** 线程上的群聊字段（旧数据没有 = 只有主人格）。 */
export function normalizeThreadGroup(raw: Record<string, unknown>): Partial<Pick<PersonaThread, 'memberIds' | 'replyMode' | 'guestMemoryThrough'>> {
  const memberIds = Array.isArray(raw.memberIds) ? [...new Set(raw.memberIds.filter(isGuestId as (id: unknown) => id is string))].slice(0, PERSONA_GROUP_GUEST_LIMIT) : []
  const through = isRecord(raw.guestMemoryThrough) ? Object.fromEntries(Object.entries(raw.guestMemoryThrough).filter(([id, at]) => isGuestId(id) && Number.isSafeInteger(at))) as Record<string, number> : {}
  return {
    ...(memberIds.length ? { memberIds } : {}),
    ...(raw.replyMode === 'natural' ? { replyMode: 'natural' as const } : raw.replyMode === 'mention' ? { replyMode: 'mention' as const } : {}),
    ...(Object.keys(through).length ? { guestMemoryThrough: through } : {}),
  }
}

/** 消息上的发言人字段。 */
export function normalizeMessageGroup(value: Record<string, unknown>, role: 'user' | 'assistant'): Partial<Pick<PersonaMessage, 'speakerId' | 'speakerName' | 'present' | 'groupTurn'>> {
  const present = Array.isArray(value.present) ? [...new Set(value.present.filter(isGuestId as (id: unknown) => id is string))].slice(0, PERSONA_GROUP_GUEST_LIMIT) : []
  const speakerId = role === 'assistant' ? str(value.speakerId) : ''
  return {
    ...(speakerId ? { speakerId } : {}),
    ...(speakerId && isGuestId(speakerId) && str(value.speakerName).trim() ? { speakerName: str(value.speakerName).trim().slice(0, 40) } : {}),
    ...(present.length ? { present } : {}),
    ...(role === 'assistant' && Number.isSafeInteger(value.groupTurn) ? { groupTurn: Number(value.groupTurn) } : {}),
  }
}

type CardLike = Pick<Character, 'id' | 'name' | 'avatar' | 'description' | 'personality' | 'scenario'>

/** 客人此刻的样子：角色卡客人实时读卡（卡被删就用存下的名字），世界观优先用这里改过的。 */
export function resolveGuest(guest: PersonaGuest, characters: readonly CardLike[] = []): ResolvedGuest {
  const card = guest.source === 'card' ? characters.find((item) => item.id === guest.characterId) : undefined
  const name = (card?.name || guest.name).trim() || guest.name
  const cardPersona = card ? [card.description, card.personality].map((part) => stripPersonaFormatInstructions(part || '')).filter((part) => part.trim()).join('\n') : ''
  const persona = (guest.persona?.trim() || cardPersona).replace(/\{\{char\}\}/gi, name)
  // v237：角色卡客人不再自动带原卡开局场景（那是原卡的剧情），只有她在这里手写的世界观才生效。
  // v287：勾了「带上原卡剧情和关系」才读原卡开局场景。
  const keepStory = Boolean(card) && guest.keepStory === true
  const world = (guest.world?.trim() || (keepStory ? stripPersonaFormatInstructions(card?.scenario || '') : '')).replace(/\{\{char\}\}/gi, name)
  return { id: guest.id, name, avatar: guest.avatar || card?.avatar, main: false, fromCard: Boolean(card), ...(keepStory ? { keepStory: true } : {}), persona: clip(persona.trim(), GUEST_PERSONA_MAX), world: clip(world.trim(), GUEST_WORLD_MAX), memories: guest.memories }
}

/** 这扇窗口此刻在场的客人（按拉进来的顺序；库里已删掉的不算）。 */
export function presentGuests(persona: Pick<PersonaWindow, 'guests'>, thread: Pick<PersonaThread, 'memberIds'>, characters: readonly CardLike[] = []): ResolvedGuest[] {
  const guests = persona.guests || []
  return (thread.memberIds || []).map((id) => guests.find((guest) => guest.id === id)).filter((guest): guest is PersonaGuest => Boolean(guest)).map((guest) => resolveGuest(guest, characters))
}

export const isGroupActive = (persona: Pick<PersonaWindow, 'guests'>, thread: Pick<PersonaThread, 'memberIds'>) => (thread.memberIds || []).some((id) => (persona.guests || []).some((guest) => guest.id === id))

export const replyModeOf = (thread: Pick<PersonaThread, 'replyMode'>): PersonaReplyMode => thread.replyMode === 'natural' ? 'natural' : 'mention'

/** 名字（含客人）展示用：客人优先读库里现在的名字，库里没有就用消息上存的。 */
export function speakerOf(message: Pick<PersonaMessage, 'role' | 'speakerId' | 'speakerName'>, persona: Pick<PersonaWindow, 'guests'>, mainName: string, characters: readonly CardLike[] = []): GroupSpeaker {
  if (!isGuestMessage(message)) return { id: '', name: mainName, main: true }
  const guest = (persona.guests || []).find((item) => item.id === message.speakerId)
  if (guest) { const resolved = resolveGuest(guest, characters); return { id: resolved.id, name: resolved.name, avatar: resolved.avatar, main: false } }
  return { id: message.speakerId || '', name: message.speakerName || '客人', main: false }
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * @ 解析：按她写下的先后顺序返回被点名的人（不重复）；「@所有人」= 在场所有人。
 * 名字长的先匹配，免得「@阿」吃掉「@阿七」。
 */
export function parseMentions(text: string, speakers: readonly GroupSpeaker[], cap = PERSONA_GROUP_MENTION_CAP): string[] {
  if (!text.includes('@') && !text.includes('＠')) return []
  const named = speakers.filter((item) => item.name.trim()).slice().sort((a, b) => b.name.length - a.name.length)
  if (!named.length) return []
  const pattern = new RegExp(`[@＠](所有人|全体|${named.map((item) => escapeRegExp(item.name)).join('|')})`, 'g')
  const ids: string[] = []
  for (const match of text.matchAll(pattern)) {
    if (match[1] === '所有人' || match[1] === '全体') { for (const item of speakers) if (!ids.includes(item.id)) ids.push(item.id); continue }
    const hit = named.find((item) => item.name === match[1])
    if (hit && !ids.includes(hit.id)) ids.push(hit.id)
  }
  return ids.slice(0, cap)
}

export type GroupTurnPlan = {
  mode: PersonaReplyMode
  /** 主人格在最前，然后是在场客人。主人格的 id 用 persona.id。 */
  speakers: GroupSpeaker[]
  guests: ResolvedGuest[]
  /** @ 点名：本轮依次回复的人；自然接话：null（模型判断）。 */
  targets: string[] | null
  cap: number
}

/** 这一轮谁说：@ 点名看她最新一条消息里 @ 了谁（没 @ = 主人格）；自然接话交给模型（最多 3 段）。 */
export function planGroupTurn(persona: Pick<PersonaWindow, 'id' | 'guests'>, thread: Pick<PersonaThread, 'memberIds' | 'replyMode'>, history: readonly Pick<PersonaMessage, 'role' | 'text'>[], main: { name: string; avatar?: string }, characters: readonly CardLike[] = []): GroupTurnPlan | null {
  const guests = presentGuests(persona, thread, characters)
  if (!guests.length) return null
  const speakers: GroupSpeaker[] = [{ id: persona.id, name: main.name, avatar: main.avatar, main: true }, ...guests.map(({ id, name, avatar }) => ({ id, name, avatar, main: false }))]
  const mode = replyModeOf(thread)
  if (mode === 'natural') return { mode, speakers, guests, targets: null, cap: PERSONA_GROUP_NATURAL_CAP }
  const latest = [...history].reverse().find((item) => item.role === 'user' && item.text.trim())
  const mentioned = latest ? parseMentions(latest.text, speakers) : []
  const targets = mentioned.length ? mentioned : [persona.id]
  return { mode, speakers, guests, targets, cap: targets.length }
}

const memoryLines = (entries: readonly PersonaMemoryEntry[], max = GUEST_MEMORY_PROMPT_MAX) => {
  const usable = entries.filter((entry) => entry.content.trim())
  const ordered = [...usable.filter((entry) => entry.pinned || entry.locked), ...usable.filter((entry) => !entry.pinned && !entry.locked).slice(-12)]
  const rows: string[] = []
  let used = 0
  for (const entry of ordered) {
    const row = `· ${entry.title && entry.title !== '记忆' ? `${entry.title}：` : ''}${entry.content.trim().replace(/\s+/g, ' ')}`
    if (used + row.length > max) break
    rows.push(row); used += row.length + 1
  }
  return rows.join('\n')
}

/**
 * 第一条 system 的稳定部分：成员、各自人设/世界观/窗口记忆、模式与输出格式。
 * 只随成员、模式、客人卡或客人记忆变化；每轮谁说放【本轮背景】。
 */
/** v256：角色卡客人的前世记忆指路（只在他确有过往记录时写进他的卡里）。 */
export const guestPastLifePointer = (name: string, user: string) => `前世记忆：${name}和${user}在小手机交流或长剧情里有过往记录（那是过去的线上交流和一起写过的故事，不是此刻的身份与关系）。聊到相关的人、事或往事时，应用会在本轮附上【${name}的前世记忆】片段，只有${name}自己记得；没附上的细节不编造。`

/** v287：角色卡客人默认借人不借戏；勾了 keepStory 的按原卡来。 */
function guestCardRules(guests: readonly ResolvedGuest[], user: string, pastNote: string) {
  const cardGuests = guests.filter((guest) => guest.fromCard)
  const strip = cardGuests.filter((guest) => !guest.keepStory), keep = cardGuests.filter((guest) => guest.keepStory)
  // 没有角色卡客人时仍保留原规则文字，基线不变。
  const stripNames = keep.length && strip.length ? `（${strip.map((guest) => guest.name).join('、')}）` : ''
  const names = { user }
  const rules: string[] = []
  if (strip.length || !keep.length) rules.push(`- 从角色卡拉来的客人${stripNames}是“借人不借戏”：原卡里的剧情、人物关系、恩怨和与${names.user}或任何人的过往一律不作数；原卡里的其他人物不在场，也不要提起。他是第一次走进这扇窗口，和在场的人原本素不相识，彼此的关系只从这扇窗口里发生的事开始（他自己的窗口记忆和【他的世界观】另有写明的除外）。${pastNote}`)
  if (keep.length) rules.push(`- ${keep.map((guest) => guest.name).join('、')}带着原卡的身份、人物关系和过往来到这里：原卡写的都作数，可以自然提起；原卡里的其他人物不在场，不要替他们说话。`)
  return rules.join('\n') + '\n'
}

export function buildGroupSystemBlock(plan: Pick<GroupTurnPlan, 'mode' | 'guests'>, names: { char: string; user: string }, pastLifeGuests: ReadonlySet<string> = new Set(), boundStories: ReadonlyMap<string, string> = new Map(), canKick = false, speakerId?: string) {
  const allowed = [names.char, ...plan.guests.map((guest) => guest.name)]
  // v295：轮到“借人不借戏”的客人开口时，别的客人带来的原卡剧情只有他们自己知道——这一轮不给他看。
  const speaker = speakerId ? plan.guests.find((guest) => guest.id === speakerId) : undefined
  const stripSpeaker = Boolean(speaker && !speaker.keepStory)
  const hidden = (guest: ResolvedGuest) => stripSpeaker && guest.id !== speakerId
  const cards = plan.guests.map((guest) => hidden(guest) ? [
    `〔${guest.name}｜临时加入的客人〕`,
    guest.persona && `人设（只写性格与样子，供你认人）：\n${clip(guest.persona, 600)}`,
    guest.keepStory && `${guest.name}带着自己原卡里的故事来：那是${guest.name}自己的戏，${speaker!.name}不在那出戏里，不知道里面的身份、关系和往事；${guest.name}嘴里提到的戏里的人和事，${speaker!.name}只当是第一次听说。`,
  ].filter(Boolean).join('\n') : [
    `〔${guest.name}｜临时加入的客人〕`,
    guest.persona && (guest.fromCard ? (guest.keepStory ? `人设（来自原角色卡，原卡里的身份、人物关系和过往都作数）：\n${guest.persona}` : `人设（借自原角色卡，只取性格、说话方式、外貌与身份气质）：\n${guest.persona}`) : `人设：\n${guest.persona}`),
    guest.world && `${guest.name}的世界观：\n${guest.world}`,
    memoryLines(guest.memories) && `${guest.name}在这扇窗口里记得的事（只属于${guest.name}）：\n${memoryLines(guest.memories)}`,
    pastLifeGuests.has(guest.id) && guestPastLifePointer(guest.name, names.user),
    boundStories.get(guest.id) && `${guest.name}和${names.user}一起演过、她特意让他记着的剧场/剧本（只有${guest.name}记得；是一起写过的故事，不是此刻）：\n${boundStories.get(guest.id)}`,
  ].filter(Boolean).join('\n')).join('\n\n')
  const pastNote = pastLifeGuests.size ? `（卡里写了「前世记忆」的客人例外：他记得和${names.user}的过往交流与一起写过的故事，可以自然认出她、想起往事；但原卡身份、职业和故事里的人物关系仍不自动成为此刻的关系，此刻的场景只从这扇窗口开始。）` : ''
  const mode = plan.mode === 'natural'
    ? `【回复模式｜自然接话】每个人各自单独回复：应用一次只请一个人开口，轮到谁写在【本轮背景】里。有话就接，没话说的人可以不接；不要每人轮流硬说。`
    : `【回复模式｜@ 点名】${names.user}在消息里 @ 谁，就只由谁回复；@ 了几个人就按 @ 的顺序一个一个来；没有 @ 时由${names.char}回复。应用一次只请一个人开口，轮到谁写在【本轮背景】里。`
  return `【临时群聊｜这扇窗口现在不只你们两个人】
此刻在场：${names.user}（她本人，谁都不替她说话）、${names.char}（窗口主人，始终在场）${plan.guests.map((guest) => `、${guest.name}`).join('')}。以下群聊规则优先于上文“一对一”的说法；${names.char}自己的相处规则、记忆与专属功能照旧。

${cards}

${mode}
【群聊回复格式】
- 每次只写轮到的那个人的一段，段首另起一行写【名字】，名字只能是：${allowed.join('、')}。这个标记只给应用看，会被隐藏，不会显示给她。
- 只写这个人自己的话和简短动作；不替别人说话（别人会自己回），不替${names.user}发言、行动或决定。
${guestCardRules(plan.guests, names.user, pastNote)}${stripSpeaker && plan.guests.some((guest) => guest.keepStory && guest.id !== speakerId) ? `- 这一轮是${speaker!.name}开口：${speaker!.name}没带原卡剧情，只活在这扇窗口里；别人带来的故事是别人的，不要顺着入戏、不要套用戏里的身份或称呼（包括对${names.user}的称呼和关系）。\n` : ''}- 客人各按自己的人设与世界观说话，只知道自己在场时发生的事；${names.char}的长期记忆、前世记忆和与${names.user}的私事，客人并不知道。尤其〔幕后手记与戏外私聊〕只是${names.char}本人和${names.user}的戏外真心话：哪怕客人也演过同一场戏、记得那场戏，也不知道这些手记和私聊，不得引用、暗示或接这些话。
${canKick ? `- 请出：这里是${names.char}的地方。${names.char}真被某位客人惹烦、或客人越界、冒犯${names.user}时，可以在【${names.char}】那段末尾单独一行写 [请出:客人名字]，应用会请他离开（他的记忆保留，${names.user}随时能再拉回来）。先用话说清再请；别为一点小事请人，也不要每轮都请。客人不能请出任何人。\n` : ''}- 礼物、人物档案、自我卡、点歌和任务卡只属于${names.char}，只能写在【${names.char}】那一段；客人段落里不要写这些标记（写了也会被丢掉）。客人想记住的事，可以在自己那段末尾写 [记忆:一句话]，只记进他自己的窗口记忆。`
}

/** 【本轮背景】里的一句：这一轮谁说。 */
export function buildGroupTurnTail(plan: GroupTurnPlan) {
  const nameOf = (id: string) => plan.speakers.find((item) => item.id === id)?.name || ''
  if (plan.targets) {
    const names = plan.targets.map(nameOf).filter(Boolean)
    return names.length > 1
      ? `【本轮发言｜@ 点名】本轮依次由 ${names.join('、')} 回复，每人一段，段首写【名字】，别人不插话。`
      : `【本轮发言｜@ 点名】本轮只由 ${names[0]} 回复，段首写【${names[0]}】，别人不插话。`
  }
  return `【本轮发言｜自然接话】由你判断这一轮谁接话（${plan.speakers.map((item) => item.name).join('、')} 之中），最多 ${plan.cap} 段，每段段首写【名字】。`
}

/** v286：不接话时只回这一行。 */
export const GROUP_SKIP_TAG = '[不接话]'
export const isGroupSkip = (raw: string) => /^\s*(?:【[^】\n]*】\s*)?[[［]\s*不接话\s*[\]］]\s*$/.test(raw)

/** v286：这一轮依次请谁开口。@ 点名 = 点到的人；自然接话 = 她这句话里叫到名字的客人先，然后窗口主人，再其他客人。 */
export function groupTurnOrder(plan: Pick<GroupTurnPlan, 'speakers' | 'targets'>, latestUserText = ''): string[] {
  if (plan.targets) return [...plan.targets]
  const main = plan.speakers.find((item) => item.main)
  const guests = plan.speakers.filter((item) => !item.main)
  const named = guests.filter((item) => item.name.trim() && latestUserText.includes(item.name.trim()))
  return [...named.map((item) => item.id), ...(main ? [main.id] : []), ...guests.filter((item) => !named.includes(item)).map((item) => item.id)]
}

/** v286：每人单独请求时的【本轮背景】一句：轮到谁、这一轮前面的人已经说了什么、能不能不接。 */
export function buildGroupSoloTail(plan: Pick<GroupTurnPlan, 'speakers'>, speakerId: string, said: readonly { name: string; text: string }[], allowSkip: boolean) {
  const name = plan.speakers.find((item) => item.id === speakerId)?.name || ''
  const before = said.length ? `\n这一轮前面已经有人接了话（她都看到了）：\n${said.map((item) => `【${item.name}】\n${item.text}`).join('\n\n')}\n可以接着他们的话说，别重复他们说过的。` : ''
  const skip = allowSkip ? `\n${name}要是这一轮没什么想说的，就只回一行 ${GROUP_SKIP_TAG}，不用硬接。` : ''
  return `【本轮发言｜轮到 ${name}】这次只写 ${name} 一个人的一段，段首写【${name}】；别人会各自回复，不要替任何人写。${before}${skip}`
}

/** 历史里有客人说过话、但现在没人在场：提醒只以主人格身份回（只进【本轮背景】）。 */
export function buildGroupAfterTail(names: { char: string }) {
  return `【群聊已结束】记录里以【名字】开头的回复，是曾临时加入这扇窗口的客人说的；他们现在不在场。你只以${names.char}的身份回复，不写【名字】标记。`
}

export type GroupSegment = { speakerId: string; raw: string }

/**
 * 把一次回复按【名字】切成多段（每段一个发言人）。
 * - 只认段首（开头或换行后）的【在场名字】，其它【】照常当正文；
 * - 流式时，末尾半截的「【虞山」先藏起来，不闪到屏幕上；
 * - 模型替她写的【她的名字】段及之后全部丢掉；
 * - @ 点名只留被点到的人（模型没写标记 → 全给第一个被点名的人），自然接话最多 cap 段。
 */
export function splitGroupReply(raw: string, plan: Pick<GroupTurnPlan, 'speakers' | 'targets' | 'cap'>, options: { userName?: string; streaming?: boolean } = {}): GroupSegment[] {
  const speakers = plan.speakers.filter((item) => item.name.trim())
  const defaultId = plan.targets?.[0] || speakers.find((item) => item.main)?.id || speakers[0]?.id || ''
  let text = raw
  const markerNames = [...speakers.map((item) => item.name), ...(options.userName?.trim() ? [options.userName.trim()] : [])]
  if (options.streaming) {
    const tail = /(^|\n)[ \t]*【([^】\n]*)$/.exec(text)
    if (tail && markerNames.some((name) => name.startsWith(tail[2]))) text = text.slice(0, tail.index + tail[1].length)
  }
  const sorted = [...new Set(markerNames)].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`(^|\\n)[ \\t]*【(${sorted.map(escapeRegExp).join('|')})】[ \\t]*[:：]?[ \\t]*\\n?`, 'g')
  const pieces: GroupSegment[] = []
  let cursor = 0
  let current = defaultId
  for (const match of text.matchAll(pattern)) {
    const start = match.index + match[1].length
    pieces.push({ speakerId: current, raw: text.slice(cursor, start) })
    const name = match[2]
    const speaker = speakers.find((item) => item.name === name)
    if (!speaker) { cursor = text.length; current = ''; break }
    current = speaker.id
    cursor = match.index + match[0].length
  }
  if (current) pieces.push({ speakerId: current, raw: text.slice(cursor) })
  // 合并连续同一人的段，去掉空段
  const merged: GroupSegment[] = []
  for (const piece of pieces) {
    if (!piece.raw.trim()) continue
    const last = merged[merged.length - 1]
    if (last && last.speakerId === piece.speakerId) last.raw = `${last.raw.trim()}\n\n${piece.raw.trim()}`
    else merged.push({ speakerId: piece.speakerId, raw: piece.raw.trim() })
  }
  if (plan.targets) {
    const targets = plan.targets
    const kept = merged.filter((piece) => targets.includes(piece.speakerId))
    if (!kept.length && merged.length) return [{ speakerId: targets[0], raw: merged.map((piece) => piece.raw).join('\n\n') }]
    return kept.slice(0, Math.max(1, targets.length))
  }
  return merged.slice(0, Math.max(1, plan.cap))
}

/** 历史发给模型时的一条回复：群聊里（或客人说的）段首加【名字】，和输出格式一致。 */
export const labelGroupContent = (name: string, content: string) => `【${name}】\n${content}`

/** 客人这扇人格窗口里待整理的消息：他在场时、他的记忆游标之后。 */
export function pendingGuestMessages(thread: Pick<PersonaThread, 'messages' | 'guestMemoryThrough'>, guestId: string) {
  const through = thread.guestMemoryThrough?.[guestId] || 0
  return thread.messages.filter((message) => message.id > through && (message.speakerId === guestId || Boolean(message.present?.includes(guestId))) && message.text.trim() && message.finishReason !== 'error')
}

export const pendingGuestCount = (persona: Pick<PersonaWindow, 'threads'>, guestId: string) => persona.threads.reduce((sum, thread) => sum + pendingGuestMessages(thread, guestId).length, 0)

export const guestMemoryExtractionPrompt = (guest: Pick<ResolvedGuest, 'name' | 'world' | 'persona'>, userName: string, mainName: string) => `【客人窗口记忆整理器｜只输出 JSON，不要续写对话】
你要从“本次新增对话”里，整理出值得 ${guest.name} 记住的事。${guest.name} 是临时加入 ${mainName} 这扇窗口的客人，下面是他在场时发生的群聊。
- 只记 ${guest.name} 亲历、亲耳听到的事，按 ${guest.name} 的视角和他自己的世界观来写（用“我”指 ${guest.name}）；
- 值得记：${userName} 对他说的话、和他有关的约定、玩笑、称呼、关系变化，他明确表达过的立场；
- 不记普通寒暄、氛围描写、猜测，不记 ${mainName} 和 ${userName} 私下的事；不把临时虚构场景当成真实经历。
${guest.world ? `${guest.name}的世界观（参考）：${clip(guest.world, 400)}\n` : ''}输出一个 JSON 对象，不要 Markdown 代码围栏、解释或其他文字：
{"memories":[{"title":"简短标题","content":"一两句话"}]}
没有值得记的内容时返回 {"memories":[]}。`

/** ———— 状态变换（都作用在一个人格上） ———— */

const withThread = (persona: PersonaWindow, threadId: string, transform: (thread: PersonaThread) => PersonaThread): PersonaWindow => ({ ...persona, threads: persona.threads.map((thread) => thread.id === threadId ? transform(thread) : thread) })

/** 拉进这扇窗口（客人已在库里）。同时在场上限 6 位。 */
export function inviteGuest(persona: PersonaWindow, threadId: string, guestId: string): PersonaWindow {
  if (!(persona.guests || []).some((guest) => guest.id === guestId)) return persona
  return withThread(persona, threadId, (thread) => {
    const members = (thread.memberIds || []).filter((id) => (persona.guests || []).some((guest) => guest.id === id))
    if (members.includes(guestId) || members.length >= PERSONA_GROUP_GUEST_LIMIT) return thread
    return { ...thread, memberIds: [...members, guestId] }
  })
}

/** 请出窗口：卡和记忆都留着，拉回来还在。 */
export function dismissGuest(persona: PersonaWindow, threadId: string, guestId: string): PersonaWindow {
  return withThread(persona, threadId, (thread) => {
    const memberIds = (thread.memberIds || []).filter((id) => id !== guestId)
    const next = { ...thread }
    if (memberIds.length) next.memberIds = memberIds
    else delete next.memberIds
    return next
  })
}

/** 新客人进库并拉进这扇窗口。名字撞了主人格/她/别的客人就加个后缀。 */
export function addGuest(persona: PersonaWindow, threadId: string, input: Omit<PersonaGuest, 'id' | 'memories' | 'createdAt' | 'updatedAt'> & { id?: string }, reserved: readonly string[] = [], now = Date.now()): { persona: PersonaWindow; guest: PersonaGuest | null } {
  const base = input.name.trim().slice(0, 40)
  if (!base) return { persona, guest: null }
  const taken = new Set([...reserved, ...(persona.guests || []).map((guest) => guest.name)])
  let name = base
  for (let index = 2; taken.has(name); index++) name = `${base}${index}`
  const guest: PersonaGuest = { ...input, id: input.id && isGuestId(input.id) ? input.id : newGuestId(), name, memories: [], createdAt: now, updatedAt: now }
  const withGuest = { ...persona, guests: [...(persona.guests || []), guest].slice(-GUEST_LIBRARY_LIMIT) }
  return { persona: inviteGuest(withGuest, threadId, guest.id), guest }
}

export function updateGuest(persona: PersonaWindow, guestId: string, patch: Partial<Pick<PersonaGuest, 'name' | 'avatar' | 'persona' | 'world' | 'memories' | 'boundStoryIds' | 'keepStory' | 'apiChannelId' | 'modelName'>>, now = Date.now()): PersonaWindow {
  return { ...persona, guests: (persona.guests || []).map((guest) => {
    if (guest.id !== guestId) return guest
    const next: PersonaGuest = { ...guest, ...patch, updatedAt: now }
    if (patch.name !== undefined) next.name = patch.name.trim().slice(0, 40) || guest.name
    for (const key of ['avatar', 'persona', 'world'] as const) if (patch[key] !== undefined && !String(patch[key]).trim()) delete next[key]
    if (patch.boundStoryIds !== undefined && !patch.boundStoryIds.length) delete next.boundStoryIds
    if ('keepStory' in patch && patch.keepStory !== true) delete next.keepStory
    // v286：渠道清空 = 跟窗口主人；模型只在有自己的渠道时留着。
    if ('apiChannelId' in patch && !patch.apiChannelId) { delete next.apiChannelId; delete next.modelName }
    else if ('modelName' in patch && !patch.modelName) delete next.modelName
    return next
  }) }
}

/** 彻底删除一位客人（卡与他的窗口记忆）；他说过的话保留（显示为存下的名字）。 */
export function deleteGuest(persona: PersonaWindow, guestId: string): PersonaWindow {
  const guests = (persona.guests || []).filter((guest) => guest.id !== guestId)
  const next = { ...persona, threads: persona.threads.map((thread) => {
    if (!thread.memberIds?.includes(guestId) && !thread.guestMemoryThrough?.[guestId]) return thread
    const memberIds = (thread.memberIds || []).filter((id) => id !== guestId)
    const through = { ...thread.guestMemoryThrough }
    delete through[guestId]
    const updated: PersonaThread = { ...thread }
    if (memberIds.length) updated.memberIds = memberIds; else delete updated.memberIds
    if (Object.keys(through).length) updated.guestMemoryThrough = through; else delete updated.guestMemoryThrough
    return updated
  }) }
  if (guests.length) next.guests = guests
  else delete next.guests
  return next
}

export function setReplyMode(persona: PersonaWindow, threadId: string, mode: PersonaReplyMode): PersonaWindow {
  return withThread(persona, threadId, (thread) => {
    const next = { ...thread }
    if (mode === 'natural') next.replyMode = 'natural'
    else delete next.replyMode
    return next
  })
}

/** 客人的记忆只写进他自己（persona.guests[i].memories），不碰主人格的长期记忆。 */
export function addGuestMemories(persona: PersonaWindow, guestId: string, entries: PersonaMemoryEntry[], merge: (existing: PersonaMemoryEntry[], incoming: PersonaMemoryEntry[]) => PersonaMemoryEntry[], cursor?: { threadId: string; throughId: number }, now = Date.now()): PersonaWindow {
  if (!(persona.guests || []).some((guest) => guest.id === guestId)) return persona
  const guests = (persona.guests || []).map((guest) => guest.id === guestId && entries.length ? { ...guest, memories: merge(guest.memories, entries), updatedAt: now } : guest)
  const next = { ...persona, guests }
  if (!cursor) return next
  return withThread(next, cursor.threadId, (thread) => ({ ...thread, guestMemoryThrough: { ...thread.guestMemoryThrough, [guestId]: Math.max(thread.guestMemoryThrough?.[guestId] || 0, cursor.throughId) } }))
}

/** 输入框里刚敲了一个 @（在末尾）——弹出 @ 选择器。 */
export const typedMentionTrigger = (previous: string, next: string) => next.length === previous.length + 1 && next.startsWith(previous) && /[@＠]$/.test(next)

/** 选好的人插进草稿：末尾刚敲的 @ 换成「@名字 」，否则接在后面。 */
export function insertMention(draft: string, name: string) {
  if (/[@＠]$/.test(draft)) return `${draft.slice(0, -1)}@${name} `
  return `${draft}${draft && !/\s$/.test(draft) ? ' ' : ''}@${name} `
}


/** v258：主人格那段里的 [请出:名字]，只认此刻在场的客人（名字全等），去重。 */
export function parseGuestKicks(text: string, guests: readonly Pick<ResolvedGuest, 'id' | 'name'>[]) {
  const out: Array<Pick<ResolvedGuest, 'id' | 'name'>> = []
  for (const match of text.matchAll(/\[\s*请出\s*[:：]\s*([^\]\n]{1,40})\]/g)) {
    const name = match[1].replace(/^[@＠]/, '').trim()
    const guest = guests.find((item) => item.name.trim() === name)
    if (guest && !out.some((item) => item.id === guest.id)) out.push(guest)
  }
  return out
}

/** v288：她气泡里不显示 @名字（点名照样生效）；只有 @ 的那条整条不显示。 */
export function groupMentionNames(main: string, guests: readonly { name: string }[]): string[] | null {
  if (!guests.length) return null
  return [main, ...guests.map((guest) => guest.name), '所有人', '全体'].map((name) => String(name || '').trim()).filter(Boolean).sort((a, b) => b.length - a.length)
}
export function stripGroupMentions(text: string, names: readonly string[]): string {
  if (!names.length || !/[@＠]/.test(text)) return text
  return text.replace(new RegExp(`[@＠](?:${names.map(escapeRegExp).join('|')})[\\s,，、]*`, 'g'), '').replace(/^\s+/, '')
}
export function isMentionOnlyText(text: string, names: readonly string[]): boolean {
  return /[@＠]/.test(text) && !stripGroupMentions(text, names).trim()
}
