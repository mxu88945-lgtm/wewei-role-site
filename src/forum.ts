import type { ChatApiContentPart } from './chatApi'
import type { ChatImage } from './chatImages'
import type { Moment } from './moments'

/** 戏外社区·论坛：角色和她都能开帖、一楼一楼盖楼。独立保存，只把当前帖子相关的少量内容送进模型。 */
export const FORUM_USER = 'user'

export const FORUM_BOARDS = ['日常', '吐槽', '剧情讨论', '八卦', '求助', '整活', '新人报到', '投诉信箱'] as const
export type ForumBoard = typeof FORUM_BOARDS[number]

export type ForumReport = { reason: string; at: number }
export const FORUM_REPORT_REASONS = ['人身攻击', '造谣传谣', '私聊争宠', '违规锁机', '引战拱火', '欺负造物主'] as const
export const FORUM_SYSTEM = '__forum_system__'

export type ForumFloor = { id: string; authorId: string; text: string; replyToFloor?: number; anonymous?: boolean; createdAt: number; likes?: string[]; images?: ChatImage[]; reports?: ForumReport[] }

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
  reports?: ForumReport[]
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
· 大家演过的戏和人设互相公开、都看过，可以直接聊、拿别人的剧情和人物关系开涮；只是别编没有的细节。
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

/** 把模型常见的“不太标准的 JSON”修一修：中文引号当分隔符、全角冒号逗号、结尾多余逗号。 */
const repairJsonish = (text: string) => text
  .replace(/[“”„‟＂]/g, (quote, offset: number, all: string) => {
    // 只替换紧挨着结构符号的弯引号，正文里的“引号”保持原样。
    const before = all.slice(0, offset).replace(/\s+$/, '').slice(-1)
    const after = all.slice(offset + quote.length).replace(/^\s+/, '').slice(0, 1)
    return /[{[,，:：]/.test(before) || /[}\],，:：]/.test(after) ? '"' : quote
  })
  .replace(/"\s*：\s*/g, '": ')
  .replace(/([}\]"\d]|true|false|null)\s*，\s*(?=["{[])/g, '$1, ')
  .replace(/,\s*([}\]])/g, '$1')

const tryParse = (text: string) => {
  try { return JSON.parse(text) as unknown } catch { /* fall through */ }
  try { return JSON.parse(repairJsonish(text)) as unknown } catch { return null }
}

const stripFences = (raw: string) => raw.replace(/```(?:json|JSON)?/g, '')

const jsonObject = (raw: string) => {
  const match = stripFences(raw).match(/\{[\s\S]*\}/)
  if (!match) return null
  const data = tryParse(match[0])
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null
}

/** 被截断或整体解析不了时：把里面每个完整的 {…}（不含嵌套）单独捞出来。 */
const salvageObjects = (raw: string) => {
  const text = stripFences(raw)
  const found: Array<Record<string, unknown>> = []
  for (const match of text.matchAll(/\{[^{}]*\}/g)) {
    const data = tryParse(match[0])
    if (data && typeof data === 'object' && !Array.isArray(data)) found.push(data as Record<string, unknown>)
  }
  return found
}

/** 从截断的文本里抠出某个字符串字段的值（"key": "…"）。 */
const looseString = (raw: string, key: string) => {
  const match = repairJsonish(stripFences(raw)).match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"?`))
  if (!match) return ''
  try { return JSON.parse(`"${match[1]}"`) as string } catch { return match[1] }
}

export function parseThreadDraft(raw: string): { board?: ForumBoard; title: string; body: string; image?: string; anonymous: boolean } | null {
  const data: Record<string, unknown> = jsonObject(raw) || (() => {
    // 截断时尽量救回标题和正文（正文被切掉一截也比整条失败好）。
    const title = looseString(raw, 'title')
    const body = looseString(raw, 'body')
    if (!title || !body) return null
    return { title, body, board: looseString(raw, 'board'), image: looseString(raw, 'image'), anonymous: /"anonymous"\s*:\s*true/.test(raw) }
  })() || {}
  const title = typeof data.title === 'string' ? data.title.trim().slice(0, 40) : ''
  const body = typeof data.body === 'string' ? data.body.trim().slice(0, 800) : ''
  if (!title || !body) return null
  const image = typeof data.image === 'string' && data.image.trim() ? data.image.trim().slice(0, 120) : undefined
  return { board: isForumBoard(data.board) ? data.board : undefined, title, body, ...(image ? { image } : {}), anonymous: data.anonymous === true }
}

export type ParsedFloors = { likes: string[]; floors: Array<{ author: string; replyToFloor: number; text: string; anonymous: boolean }> }

const floorFrom = (item: unknown, maxFloor: number) => {
  const entry = (item || {}) as { author?: unknown; name?: unknown; reply_to_floor?: unknown; replyToFloor?: unknown; text?: unknown; content?: unknown; anonymous?: unknown }
  const author = typeof entry.author === 'string' ? entry.author : typeof entry.name === 'string' ? entry.name : ''
  const text = typeof entry.text === 'string' ? entry.text : typeof entry.content === 'string' ? entry.content : ''
  if (!author.trim() || !text.trim()) return []
  const target = Math.floor(Number(entry.reply_to_floor ?? entry.replyToFloor) || 0)
  return [{ author: author.trim(), replyToFloor: target >= 1 && target <= maxFloor ? target : 0, text: text.trim().slice(0, 300), anonymous: entry.anonymous === true }]
}

export function parseFloors(raw: string, maxFloor: number): ParsedFloors {
  const data = jsonObject(raw)
  const likesOf = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : []
  if (data && Array.isArray(data.floors)) {
    const floors = data.floors.flatMap((item) => floorFrom(item, maxFloor))
    if (floors.length || likesOf(data.likes).length) return { likes: likesOf(data.likes), floors }
  }
  // 截断 / 格式乱：逐个捞完整的楼层对象，likes 单独抠。
  const floors = salvageObjects(raw).flatMap((item) => floorFrom(item, maxFloor))
  const likesMatch = repairJsonish(stripFences(raw)).match(/"likes"\s*:\s*(\[[^\]]*\])/)
  const likes = data ? likesOf(data.likes) : likesMatch ? likesOf(tryParse(likesMatch[1])) : []
  return { likes, floors }
}

/** 回帖作者名对上真人：去掉 @、（楼主）、括号和空格；先在逛论坛的人里找，再在全体群友里找，最后容忍包含关系。 */
export function normalizeForumAuthor(name: string) {
  return name
    .replace(/[（(【[][^）)】\]]*[）)】\]]/g, '')
    .replace(/楼主|层主/g, '')
    .replace(/[@＠\s:：·•\-—"“”'‘’]/g, '')
    .trim()
}

export function matchForumAuthor(name: string, readers: Array<{ id: string; name: string }>, members: Array<{ id: string; name: string }> = []) {
  const key = normalizeForumAuthor(name)
  if (!key) return undefined
  const pools = [readers, members]
  for (const pool of pools) {
    const hit = pool.find((item) => item.name && normalizeForumAuthor(item.name) === key)
    if (hit) return hit.id
  }
  for (const pool of pools) {
    const hit = pool.find((item) => {
      const target = normalizeForumAuthor(item.name || '')
      return target.length >= 2 && key.length >= 2 && (key.includes(target) || target.includes(key))
    })
    if (hit) return hit.id
  }
  return undefined
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

/** 小手机群里每次回话都带上的“论坛近况”：最近几天活跃的帖子，本群成员参与过的优先。 */
export function buildForumRecapNote(threads: ForumThread[], memberIds: string[], nameOf: (id: string) => string, userName: string, now = Date.now(), maxThreads = 4) {
  const recent = threads.filter((thread) => now - thread.updatedAt < 3 * 24 * 3600000)
  if (!recent.length) return ''
  const involved = (thread: ForumThread) => [thread.authorId, ...thread.floors.map((floor) => floor.authorId)].some((id) => id === FORUM_USER || memberIds.includes(id))
  const picked = [...recent].sort((a, b) => Number(involved(b)) - Number(involved(a)) || b.updatedAt - a.updatedAt).slice(0, maxThreads)
  const who = (id: string, anonymous?: boolean) => anonymous ? (id === FORUM_USER ? `匿名（其实是${userName}，大家不确定）` : '匿名') : nameOf(id)
  const blocks = picked.map((thread) => {
    const floors = thread.floors.slice(-4).map((floor) => `  ${who(floor.authorId, floor.anonymous)}：${floor.images?.length ? '[图] ' : ''}${clip(floor.text, 50)}`).join('\n')
    return `· [${thread.board}]《${clip(thread.title, 30)}》楼主 ${who(thread.authorId, thread.anonymous)}：${thread.images?.length ? `[${thread.images.length}张图] ` : ''}${clip(thread.body, 80)}（${thread.floors.length} 回复）${floors ? `\n${floors}` : ''}`
  })
  return `【论坛近况】大家都逛过戏外论坛，下面是最近几天的帖子。群聊里可以自然提起、接着吵、翻旧帖，但别逐字复述，也别每句都扯论坛。\n${blocks.join('\n')}`
}

/** 论坛帖子/楼层的分享卡片文字（你分享和角色转发共用）。floor ≤ 1 是帖子本身。 */
export function forumShareText(thread: ForumThread, floor: number, nameOf: (id: string) => string) {
  const item = floor > 1 ? thread.floors[floor - 2] : undefined
  if (item) return `【分享论坛楼层】《${thread.title}》${floor}楼 ${item.anonymous ? '匿名用户' : nameOf(item.authorId)}：${item.text.slice(0, 200)}`
  const who = thread.anonymous ? '匿名用户' : nameOf(thread.authorId)
  return `【分享论坛帖子】《${thread.title}》（${thread.board}·${who}）\n${thread.body.slice(0, 200)}${thread.body.length > 200 ? '…' : ''}${thread.floors.length ? `\n已有 ${thread.floors.length} 层回复` : ''}`
}

const titleKey = (value: string) => value.replace(/[《》「」"“”'‘’\s]/g, '').replace(/…$/, '').toLowerCase()
/** 按角色写的标题关键词找帖子：完全相同优先，其次互相包含，同等时取最近更新的。 */
export function findForumThread(threads: ForumThread[], key: string) {
  const want = titleKey(key)
  if (!want) return undefined
  const scored = threads.map((thread) => {
    const title = titleKey(thread.title)
    const score = title === want ? 3 : title.includes(want) ? 2 : want.includes(title.slice(0, 30)) && title.length >= 2 ? 1 : 0
    return { thread, score }
  }).filter((entry) => entry.score > 0)
  scored.sort((a, b) => b.score - a.score || b.thread.updatedAt - a.thread.updatedAt)
  return scored[0]?.thread
}
