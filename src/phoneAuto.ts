import type { Character } from './characterCard'
import type { Conversation } from './conversationLifecycle'
import { completeChat, type ApiConfig, type ChatApiMessage } from './chatApi'
import { characterBrief, communityMemberIds } from './moments'
import {
  FORUM_USER, buildFloorsPrompt, buildThreadPrompt, floorNumber, forumThreadLine, parseFloors, parseThreadDraft, pickForumReaders, sortThreads,
  type ForumFloor, type ForumThread,
} from './forum'

/** 小手机“自动活跃”：App 开着时按点触发，重新打开时补一次错过的。没有服务器，关掉 App 时不会跑。 */
export const PHONE_AUTO_KEY = 'weijing.phoneAuto'
export const PHONE_AUTO_INTERVALS = [30, 60, 120, 240, 480] as const
export type PhoneAutoSettings = { enabled: boolean; intervalMinutes: number; forum: boolean; groups: boolean; lastRun: number; quietNight: boolean }
export const DEFAULT_PHONE_AUTO: PhoneAutoSettings = { enabled: false, intervalMinutes: 120, forum: true, groups: true, lastRun: 0, quietNight: true }
export const PHONE_AUTO_EVENT = 'weijing-phone-auto-settings'
export const FORUM_UPDATED_EVENT = 'weijing-forum-updated'

export function readPhoneAuto(): PhoneAutoSettings {
  try { return { ...DEFAULT_PHONE_AUTO, ...(JSON.parse(localStorage.getItem(PHONE_AUTO_KEY) || 'null') || {}) } } catch { return DEFAULT_PHONE_AUTO }
}
export function writePhoneAuto(value: PhoneAutoSettings) {
  try { localStorage.setItem(PHONE_AUTO_KEY, JSON.stringify(value)) } catch { /* ignore */ }
  window.dispatchEvent(new Event(PHONE_AUTO_EVENT))
}

/** 是否该跑一次；返回这次代表的时间点（错过多次只补最近一次）。 */
export function dueRunAt(settings: PhoneAutoSettings, now: number) {
  if (!settings.enabled || (!settings.forum && !settings.groups)) return null
  const interval = Math.max(15, settings.intervalMinutes) * 60000
  if (!settings.lastRun) return now
  if (now - settings.lastRun < interval) return null
  const missed = Math.floor((now - settings.lastRun) / interval)
  return settings.lastRun + missed * interval
}

/** 凌晨 1 点到 7 点算睡觉时间，开了“夜里安静”就不发。 */
export const isQuietHour = (at: number) => { const hour = new Date(at).getHours(); return hour >= 1 && hour < 7 }

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

async function callModel(api: ApiConfig, messages: ChatApiMessage[], maxTokens: number) {
  let output = ''
  await completeChat({ api, messages, temperature: .95, topP: .95, maxTokens, streaming: false, signal: new AbortController().signal, onDelta: (delta) => { output += delta } })
  return output
}

/** 论坛自动一轮：有时某个角色开新帖，有时大家去热帖下面接着盖楼。at 是这次“发生”的时间。 */
export async function forumAutoTick(input: { threads: ForumThread[]; characters: Character[]; conversations: Conversation[]; api: ApiConfig; userName: string; at: number; random?: () => number }): Promise<ForumThread[]> {
  const random = input.random || Math.random
  const memberIds = communityMemberIds(input.conversations)
  const members = memberIds.map((id) => input.characters.find((item) => item.id === id)).filter(Boolean) as Character[]
  if (!members.length) return input.threads
  const nameOf = (id: string) => id === FORUM_USER ? input.userName : input.characters.find((item) => item.id === id)?.name || '已离开的角色'
  const recent = sortThreads(input.threads, 'new').slice(0, 6).map((item) => forumThreadLine(item, nameOf))
  const active = input.threads.filter((item) => !item.locked && input.at - item.updatedAt < 2 * 24 * 3600000)
  let threads = input.threads
  let target: ForumThread | undefined
  if (!active.length || random() < .5) {
    const author = members[Math.floor(random() * members.length)]
    const draft = parseThreadDraft(await callModel(input.api, buildThreadPrompt({ authorName: author.name, brief: characterBrief(author, input.conversations), userName: input.userName, recent }), 600))
    if (!draft) throw new Error('模型没写出完整的帖子')
    target = { id: uid(), board: draft.board || '日常', title: draft.title, authorId: author.id, anonymous: draft.anonymous || undefined, body: draft.body, ...(draft.image ? { imageNote: draft.image } : {}), createdAt: input.at, updatedAt: input.at, floors: [], likes: [] }
    threads = [target, ...threads]
  } else {
    target = sortThreads(active, 'hot', input.at)[0]
  }
  const readers = pickForumReaders(memberIds, target, [], 6, random).map((id) => input.characters.find((item) => item.id === id)).filter(Boolean) as Character[]
  const raw = await callModel(input.api, buildFloorsPrompt({
    thread: target, nameOf, userName: input.userName,
    trigger: target.floors.length ? '过了一阵，逛论坛的角色又刷到这个帖子，接着楼里的话头聊。' : '帖子刚发出来，逛论坛的角色自然地来回帖（不是每个人都必须说话）。',
    briefs: readers.map((character) => characterBrief(character, input.conversations)),
    candidateNames: readers.map((character) => character.name), mentionedNames: [],
    recent: recent.slice(0, 4),
  }), 1600)
  const parsed = parseFloors(raw, floorNumber(target.floors.length) + 6)
  const byName = (name: string) => readers.find((character) => character.name === name)?.id
  const floors: ForumFloor[] = parsed.floors.flatMap((floor, index) => {
    const authorId = byName(floor.author)
    return authorId ? [{ id: uid(), authorId, text: floor.text, replyToFloor: floor.replyToFloor || undefined, anonymous: floor.anonymous || undefined, createdAt: input.at + (index + 1) * 60000 }] : []
  })
  const likes = parsed.likes.map(byName).filter((id): id is string => Boolean(id))
  const id = target.id
  return threads.map((item) => item.id === id ? { ...item, likes: [...new Set([...item.likes, ...likes])], floors: [...item.floors, ...floors], updatedAt: floors.length ? floors[floors.length - 1].createdAt : item.updatedAt } : item)
}

/** 群聊自动冒泡挑一个群：最近有人说过话的群优先。 */
export function pickAutoGroup(conversations: Conversation[], random = Math.random) {
  const groups = conversations.filter((item) => item.phone && (item.participantIds || []).length)
  if (!groups.length) return undefined
  const weighted = groups.map((group) => ({ group, weight: 1 + Math.min(5, group.messages.length / 20) }))
  let roll = random() * weighted.reduce((sum, item) => sum + item.weight, 0)
  for (const item of weighted) { roll -= item.weight; if (roll <= 0) return item.group }
  return groups[groups.length - 1]
}
