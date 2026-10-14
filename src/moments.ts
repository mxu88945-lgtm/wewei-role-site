import type { Character } from './characterCard'
import type { Conversation } from './conversationLifecycle'

/** 戏外社区·动态（朋友圈）。独立结构化保存，只按需把当前帖子相关的少量内容送进模型。 */
export const USER_AUTHOR = 'user'

export type MomentVisibility =
  | { kind: 'all' }
  | { kind: 'group'; groupId: string }
  | { kind: 'members'; memberIds: string[] }

export type MomentComment = { id: string; authorId: string; replyToAuthorId?: string; text: string; createdAt: number }

export type Moment = {
  id: string
  authorId: string
  text: string
  image?: string
  createdAt: number
  visibility: MomentVisibility
  sourceConversationId?: string
  sourceExcerpt?: string
  likes: string[]
  comments: MomentComment[]
  pinned?: boolean
  commentsClosed?: boolean
  savedToMemory?: boolean
}

export const phoneGroupsOf = (conversations: Conversation[]) => conversations.filter((item) => item.phone)

/** Everyone who can see the post (characters only; the user sees everything). */
export function momentAudienceIds(moment: Pick<Moment, 'visibility' | 'authorId'>, conversations: Conversation[]) {
  const groups = phoneGroupsOf(conversations)
  let ids: string[]
  if (moment.visibility.kind === 'group') {
    const groupId = moment.visibility.groupId
    ids = groups.find((item) => item.id === groupId)?.participantIds || []
  } else if (moment.visibility.kind === 'members') ids = moment.visibility.memberIds
  else ids = groups.flatMap((item) => item.participantIds || [])
  const unique = [...new Set(ids)]
  if (moment.authorId !== USER_AUTHOR && !unique.includes(moment.authorId)) unique.push(moment.authorId)
  return unique
}

export const communityMemberIds = (conversations: Conversation[]) => [...new Set(phoneGroupsOf(conversations).flatMap((item) => item.participantIds || []))]

export function sortMoments(moments: Moment[]) {
  return [...moments].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt - a.createdAt)
}

const clip = (value: string | undefined, max: number) => {
  const text = (value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** A short, bounded brief per character: persona + the gist of the story they bound in 小手机. */
export function characterBrief(character: Character, conversations: Conversation[]) {
  const boundId = phoneGroupsOf(conversations).map((group) => group.phone?.bindings[character.id]).find(Boolean)
  const bound = boundId ? conversations.find((item) => item.id === boundId) : undefined
  const story = bound ? clip(bound.contextSummary, 500) || clip(bound.messages.slice(-4).map((message) => message.text).join(' / '), 300) : ''
  return `【${character.name}】${clip(character.description, 420)}${character.personality ? `｜性格：${clip(character.personality, 160)}` : ''}${character.scenario?.trim() ? `\n所在故事背景：${clip(character.scenario, 300)}` : ''}${story ? `\n他演过的戏（大家都看过）：${story}` : ''}`
}

export function momentLine(moment: Moment, nameOf: (id: string) => string) {
  return `${nameOf(moment.authorId)}：${clip(moment.text, 80)}${moment.comments.length ? `（${moment.comments.length} 条评论）` : ''}`
}

export function threadText(moment: Moment, nameOf: (id: string) => string, limit = 30) {
  return moment.comments.slice(-limit).map((comment) => `${nameOf(comment.authorId)}${comment.replyToAuthorId ? ` 回复 ${nameOf(comment.replyToAuthorId)}` : ''}：${comment.text}`).join('\n')
}

export const COMMUNITY_RULES = (userName: string) => `【惟境戏外社区·动态】
这是惟境角色们的“朋友圈”。所有人都知道自己是惟境里的角色卡，${userName}是现实里陪他们对戏、扮演故事女主的人，也是社区管理员“周导”。
· 口吻像真实朋友圈：短、口语、有梗，可以吐槽、互怼、举报、阴阳怪气，但保持各自人设。
· 大家演过的戏互相公开、都看过，可以直接聊别人的剧情和人物关系；只是别编档案里没有的细节。
· 不写小说正文，不写旁白、心理描写，不输出任何标签或状态栏。`

export function buildPostPrompt(input: { author: Character; brief: string; userName: string; recent: string[]; summaries: string[]; sourceExcerpt?: string }) {
  return [
    { role: 'system' as const, content: `${COMMUNITY_RULES(input.userName)}\n\n${input.brief}${input.summaries.length ? `\n\n社区里已沉淀的重要动态：\n${input.summaries.join('\n')}` : ''}${input.recent.length ? `\n\n最近的动态：\n${input.recent.join('\n')}` : ''}` },
    { role: 'user' as const, content: `请以「${input.author.name}」的身份发一条朋友圈动态。${input.sourceExcerpt ? `这条动态来自他演过的这段剧情：\n${clip(input.sourceExcerpt, 600)}\n` : ''}只输出动态正文，1—3 句；如果要配图，在最后另起一行写「[图片] 简短画面描述」。` },
  ]
}

export function buildCommentPrompt(input: { moment: Moment; nameOf: (id: string) => string; briefs: string[]; candidateNames: string[]; mentionedNames: string[]; userName: string; recent: string[]; trigger: string }) {
  const { moment, nameOf } = input
  const source = moment.sourceExcerpt ? `\n这条动态关联原剧情片段（只有原剧情里的人清楚来龙去脉）：${clip(moment.sourceExcerpt, 400)}` : ''
  return [
    { role: 'system' as const, content: `${COMMUNITY_RULES(input.userName)}\n\n能看到这条动态的角色：\n${input.briefs.join('\n')}${input.recent.length ? `\n\n最近其他动态：\n${input.recent.join('\n')}` : ''}` },
    { role: 'user' as const, content: `动态｜${nameOf(moment.authorId)}：${moment.text}${source}\n\n已有评论：\n${threadText(moment, nameOf) || '（还没有）'}\n\n${input.trigger}\n可以发言的角色只有：${input.candidateNames.join('、')}。${input.mentionedNames.length ? `被 @ 的 ${input.mentionedNames.join('、')} 必须回复。` : ''}不要替${input.userName}发言。
只输出 JSON：{"likes":["点赞的角色名"],"comments":[{"author":"角色名","reply_to":"被回复的人名或空字符串","text":"评论"}]}。评论按时间顺序，允许角色之间互相回复、连环接梗；每条不超过 40 字。` },
  ]
}

export type ParsedReaction = { likes: string[]; comments: Array<{ author: string; replyTo: string; text: string }> }

export function parseReaction(raw: string): ParsedReaction {
  const match = raw.replace(/```(?:json)?/g, '').match(/\{[\s\S]*\}/)
  if (!match) return { likes: [], comments: [] }
  try {
    const data = JSON.parse(match[0]) as { likes?: unknown; comments?: unknown }
    const likes = Array.isArray(data.likes) ? data.likes.filter((item): item is string => typeof item === 'string') : []
    const comments = Array.isArray(data.comments) ? data.comments.flatMap((item) => {
      const entry = item as { author?: unknown; reply_to?: unknown; text?: unknown }
      return typeof entry.author === 'string' && typeof entry.text === 'string' && entry.text.trim()
        ? [{ author: entry.author.trim(), replyTo: typeof entry.reply_to === 'string' ? entry.reply_to.trim() : '', text: entry.text.trim().slice(0, 200) }]
        : []
    }) : []
    return { likes, comments }
  } catch {
    return { likes: [], comments: [] }
  }
}

export function splitPostImage(raw: string) {
  const text = raw.trim().replace(/^["“]|["”]$/g, '')
  const match = text.match(/\n?\s*\[图片\]\s*(.+)$/)
  return match ? { text: text.slice(0, match.index).trim(), image: match[1].trim() } : { text, image: undefined }
}

export function findMentionIds(text: string, people: Array<{ id: string; name: string }>) {
  return people.filter((person) => person.name && new RegExp(`[@＠]${person.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text)).map((person) => person.id)
}

/** Plain story text for a post's source: drop status panels, tags and extra whitespace. */
export function excerptFromMessage(text: string, max = 600) {
  const plain = text
    .replace(/<(gts_status|status|state|statusbar)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return plain.length > max ? `${plain.slice(0, max)}…` : plain
}
