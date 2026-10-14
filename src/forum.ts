import type { ChatApiContentPart } from './chatApi'
import type { ChatImage } from './chatImages'
import type { Moment } from './moments'

/** 戏外社区·论坛：角色和她都能开帖、一楼一楼盖楼。独立保存，只把当前帖子相关的少量内容送进模型。 */
export const FORUM_USER = 'user'

export const FORUM_BOARDS = ['日常', '吐槽', '剧情讨论', '八卦', '求助', '整活'] as const
export type ForumBoard = typeof FORUM_BOARDS[number]

export type ForumFloor = { id: string; authorId: string; text: string; replyToFloor?: number; anonymous?: boolean; createdAt: number; likes?: string[]; images?: ChatImage[] }

export const FORUM_THREAD_IMAGE_LIMIT = 9
export const FORUM_FLOOR_IMAGE_LIMIT = 3

export type ForumThread = {
  id: string
  board: ForumBoard
  title: string
  authorId: string
  anonymous?: boolean
  body: string
  images?: ChatImage[]
  /** 角色发帖时“配的图”，只有文字描述。 */
  imageNote?: string
  createdAt: number
  updatedAt: number
  floors: ForumFloor[]
  likes: string[]
  pinned?: boolean
  locked?: boolean
  savedToMemory?: boolean
  sourceConversationId?: string
  sourceExcerpt?: string
}

const clip = (value: string | undefined, max: number) => {
  const text = (value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export const isForumBoard = (value: unknown): value is ForumBoard => typeof value === 'string' && (FORUM_BOARDS as readonly string[]).includes(value)

/** 热度：回帖和点赞越多、越新越靠前。 */
export function forumHeat(thread: ForumThread, now = Date.now()) {
  const hours = Math.max(0, (now - thread.updatedAt) / 3600000)
  return (thread.floors.length * 2 + thread.likes.length + 1) / Math.pow(hours + 2, 1.2)
}

export function sortThreads(threads: ForumThread[], mode: 'new' | 'hot', now = Date.now()) {
  return [...threads].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
    || (mode === 'hot' ? forumHeat(b, now) - forumHeat(a, now) : b.updatedAt - a.updatedAt))
}

/** 楼号：1 楼是正文，回帖从 2 楼开始。 */
export const floorNumber = (index: number) => index + 2

export function forumThreadLine(thread: ForumThread, nameOf: (id: string) => string) {
  return `[${thread.board}]《${clip(thread.title, 30)}》${thread.anonymous ? '匿名' : nameOf(thread.authorId)}（${thread.floors.length} 回复）`
}

export function floorsText(thread: ForumThread, nameOf: (id: string) => string, limit = 30) {
  const start = Math.max(0, thread.floors.length - limit)
  return thread.floors.slice(start).map((floor, offset) => {
    const number = floorNumber(start + offset)
    const who = floor.anonymous ? '匿名' : nameOf(floor.authorId)
    return `${number}楼 ${who}${floor.replyToFloor ? ` 回复${floor.replyToFloor}楼` : ''}：${floor.images?.length ? `[${floor.images.length}张图] ` : ''}${clip(floor.text, 160)}`
  }).join('\n')
}

export const FORUM_RULES = (userName: string) => `【惟境戏外社区·论坛】
这是惟境角色们自己的论坛，像贴吧/豆瓣小组。所有人都知道自己是惟境里的角色卡，${userName}是现实里陪他们对戏、扮演故事女主的人，也是论坛管理员“周导”。
· 口吻像真实网友盖楼：短、口语、有梗，可以吐槽、互怼、阴阳怪气、拉踩、站队、玩梗、发“+1”“前排”，但保持各自人设和说话习惯。
· 可以偶尔匿名发言（anonymous 为 true），匿名时语气也要像本人，让大家能猜。
· 每个人只清楚自己演过的戏；别人的剧情细节不知道就别编，可以追问。
· 不写小说正文、旁白、心理描写，不输出任何标签或状态栏。`

export function buildThreadPrompt(input: { authorName: string; brief: string; userName: string; recent: string[]; board?: ForumBoard; sourceExcerpt?: string; hint?: string }) {
  return [
    { role: 'system' as const, content: `${FORUM_RULES(input.userName)}\n\n${input.brief}${input.recent.length ? `\n\n论坛最近的帖子：\n${input.recent.join('\n')}` : ''}` },
    { role: 'user' as const, content: `请以「${input.authorName}」的身份在论坛开一个新帖${input.board ? `，发在「${input.board}」版` : `，从这些版块里选一个：${FORUM_BOARDS.join('、')}`}。${input.hint ? `主题方向：${clip(input.hint, 200)}\n` : ''}${input.sourceExcerpt ? `帖子来自他演过的这段剧情：\n${clip(input.sourceExcerpt, 600)}\n` : ''}标题要像真帖子一样抓眼球（不超过 24 字），正文 1—4 句。别和最近的帖子撞题。想配图就在 image 里用一句话描述图片内容，不配就写空字符串。
只输出 JSON：{"board":"版块","title":"标题","body":"正文","image":"","anonymous":false}` },
  ]
}

export function buildFloorsPrompt(input: { pixels?: ChatImage[]; thread: ForumThread; nameOf: (id: string) => string; briefs: string[]; candidateNames: string[]; mentionedNames: string[]; userName: string; recent: string[]; trigger: string }) {
  const { thread, nameOf } = input
  const source = thread.sourceExcerpt ? `\n这个帖子关联原剧情片段（只有原剧情里的人清楚来龙去脉）：${clip(thread.sourceExcerpt, 400)}` : ''
  const nextFloor = floorNumber(thread.floors.length)
  const opImages = thread.images?.length ? `\n（楼主贴了 ${thread.images.length} 张图${input.pixels?.length ? '，图片附在后面，回帖可以针对图片内容' : ''}）` : thread.imageNote ? `\n（楼主配图：${clip(thread.imageNote, 80)}）` : ''
  const messages: Array<{ role: 'system' | 'user'; content: string | ChatApiContentPart[] }> = [
    { role: 'system' as const, content: `${FORUM_RULES(input.userName)}\n\n逛论坛的角色：\n${input.briefs.join('\n')}${input.recent.length ? `\n\n论坛里其他帖子：\n${input.recent.join('\n')}` : ''}` },
    { role: 'user' as const, content: `帖子｜[${thread.board}]《${thread.title}》\n1楼 ${thread.anonymous ? '匿名' : nameOf(thread.authorId)}（楼主）：${thread.body}${opImages}${source}\n\n已有回帖：\n${floorsText(thread, nameOf) || '（还没有）'}\n\n${input.trigger}\n可以回帖的角色只有：${input.candidateNames.join('、')}。${input.mentionedNames.length ? `被点名的：${input.mentionedNames.join('、')}，他们必须出现。` : ''}
新回帖从 ${nextFloor} 楼开始编号。2—6 条，按时间顺序；可以回复某一楼（reply_to_floor 写楼号，不回复就写 0），允许连环互怼、楼主回复；每条不超过 60 字。
只输出 JSON：{"likes":["给楼主点赞的角色名"],"floors":[{"author":"角色名","reply_to_floor":0,"text":"回帖","anonymous":false}]}` },
  ]
  if (input.pixels?.length) {
    const last = messages[1]
    last.content = [{ type: 'text', text: last.content as string }, ...input.pixels.map((image): ChatApiContentPart => ({ type: 'image_url', image_url: { url: image.dataUrl, detail: 'low' } }))]
  }
  return messages
}

const jsonObject = (raw: string) => {
  const match = raw.replace(/```(?:json)?/g, '').match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) as Record<string, unknown> } catch { return null }
}

export function parseThreadDraft(raw: string): { board?: ForumBoard; title: string; body: string; image?: string; anonymous: boolean } | null {
  const data = jsonObject(raw)
  if (!data) return null
  const title = typeof data.title === 'string' ? data.title.trim().slice(0, 40) : ''
  const body = typeof data.body === 'string' ? data.body.trim().slice(0, 800) : ''
  if (!title || !body) return null
  const image = typeof data.image === 'string' && data.image.trim() ? data.image.trim().slice(0, 120) : undefined
  return { board: isForumBoard(data.board) ? data.board : undefined, title, body, ...(image ? { image } : {}), anonymous: data.anonymous === true }
}

export type ParsedFloors = { likes: string[]; floors: Array<{ author: string; replyToFloor: number; text: string; anonymous: boolean }> }

export function parseFloors(raw: string, maxFloor: number): ParsedFloors {
  const data = jsonObject(raw)
  if (!data) return { likes: [], floors: [] }
  const likes = Array.isArray(data.likes) ? data.likes.filter((item): item is string => typeof item === 'string') : []
  const floors = Array.isArray(data.floors) ? data.floors.flatMap((item) => {
    const entry = item as { author?: unknown; reply_to_floor?: unknown; text?: unknown; anonymous?: unknown }
    if (typeof entry.author !== 'string' || !entry.author.trim() || typeof entry.text !== 'string' || !entry.text.trim()) return []
    const target = Math.floor(Number(entry.reply_to_floor) || 0)
    return [{ author: entry.author.trim(), replyToFloor: target >= 1 && target <= maxFloor ? target : 0, text: entry.text.trim().slice(0, 300), anonymous: entry.anonymous === true }]
  }) : []
  return { likes, floors }
}

/** 旧“动态”一次性搬进论坛：每条动态变成一个帖子，评论变成楼层。 */
export function threadsFromMoments(moments: Moment[]): ForumThread[] {
  return moments.map((moment) => {
    const title = clip(moment.text.split(/[。！？!?\n]/)[0], 24) || '旧动态'
    return {
      id: `m-${moment.id}`,
      board: '日常' as ForumBoard,
      title,
      authorId: moment.authorId,
      body: moment.text,
      ...(moment.image ? { imageNote: moment.image } : {}),
      createdAt: moment.createdAt,
      updatedAt: moment.comments.length ? moment.comments[moment.comments.length - 1].createdAt : moment.createdAt,
      floors: moment.comments.map((comment) => ({ id: comment.id, authorId: comment.authorId, text: comment.replyToAuthorId ? comment.text : comment.text, createdAt: comment.createdAt })),
      likes: moment.likes,
      pinned: moment.pinned,
      locked: moment.commentsClosed,
      savedToMemory: moment.savedToMemory,
      sourceConversationId: moment.sourceConversationId,
      sourceExcerpt: moment.sourceExcerpt,
    }
  })
}

/** 挑一批逛论坛的人：楼主、被点名的、楼里出现过的优先，再随机补几个，最多 max 人。 */
export function pickForumReaders(memberIds: string[], thread: ForumThread, mentionedIds: string[], max = 8, random = Math.random) {
  const priority = [thread.authorId, ...mentionedIds, ...thread.floors.slice(-10).map((floor) => floor.authorId)].filter((id) => id !== FORUM_USER && memberIds.includes(id))
  const rest = memberIds.filter((id) => !priority.includes(id)).sort(() => random() - .5)
  return [...new Set([...priority, ...rest])].slice(0, max)
}

/** 送给模型看的图：楼主的图 + 最新一条带图回帖，最多 4 张。 */
export function forumPromptPixels(thread: ForumThread, max = 4) {
  const latest = [...thread.floors].reverse().find((floor) => floor.images?.length)
  return [...(thread.images || []), ...(latest?.images || [])].slice(0, max)
}
