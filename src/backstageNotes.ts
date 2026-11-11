/**
 * 幕后手记（v181）：长剧情里，被她勾选的角色可以在正文最末写一条 [幕后:…]，
 * 以「戏外小手机群里那个本人」的口吻私下吐槽这一轮。每个角色各一本，互不可见；
 * 她回复某一篇后，下一轮只有那个角色会接她的话。
 */
import type { ChatApiContentPart, ChatApiMessage } from './chatApi'
import { sanitizeAssistantOutput } from './outputSanitizer'
import { cleanPhoneOutput } from './phoneGroup'

/**
 * 手记下面的一句话。images 是 v196 起的附图（压缩后的 JPEG data URL，最多 6 张）。
 * v201 起手记是独立私聊：from 为 'character' 是他当场回的；没有 from 的旧数据都算她说的。
 */
export type BackstageReply = { text: string; at: number; images?: string[]; from?: 'user' | 'character' }

export const backstageReplyFrom = (reply: Pick<BackstageReply, 'from'>): 'user' | 'character' => reply.from === 'character' ? 'character' : 'user'

export const BACKSTAGE_REPLY_IMAGE_LIMIT = 6

export type BackstageNote = {
  id: string
  characterId: string
  text: string
  createdAt: number
  /** 她在手记里回的话（可以多条）。 */
  replies?: BackstageReply[]
  /** 他已经接过她最新一条回复（v201 起是手记里当场回的）。 */
  answered?: boolean
}

export type BackstageNotebook = {
  writerIds: string[]
  notes: BackstageNote[]
  /** 她上次打开手记页的时间，用来算未读。 */
  seenAt?: number
}

export const unreadBackstageCount = (book?: BackstageNotebook) => book ? book.notes.filter((note) => note.createdAt > (book.seenAt || 0)).length : 0

const NOTE_TAG = /\n?[ \t]*[[［【]\s*幕后\s*[:：]\s*([\s\S]*?)\s*[\]］】][ \t]*/g

/** 把正文里的 [幕后:…] 全部取出；返回去掉标签后的正文和最后一条手记。 */
export function extractBackstageNote(text: string): { text: string; note: string } {
  let note = ''
  const stripped = text.replace(NOTE_TAG, (_match, body: string) => {
    const clean = String(body || '').trim()
    if (clean) note = clean
    return '\n'
  })
  // 没收尾的半截标签（模型被截断）也不能漏进正文。
  const open = stripped.search(/[[［【]\s*幕后\s*[:：]/)
  if (open >= 0) {
    const tail = stripped.slice(open).replace(/^[[［【]\s*幕后\s*[:：]/, '').trim()
    if (!note && tail) note = tail
    return { text: stripped.slice(0, open).replace(/\n{3,}/g, '\n\n').trim(), note: note.slice(0, 1200) }
  }
  return { text: stripped.replace(/\n{3,}/g, '\n\n').trim(), note: note.slice(0, 1200) }
}

/** 流式预览：一旦出现 [幕后: 就把后面藏起来。 */
export function stripBackstageForStreaming(text: string) {
  const open = text.search(/[[［【]\s*幕后\s*[:：]?$|[[［【]\s*幕后\s*[:：]/)
  return open >= 0 ? text.slice(0, open).trimEnd() : text
}

const isImageUrl = (value: unknown): value is string => typeof value === 'string' && /^data:image\/[\w.+-]+;base64,/.test(value)

/** 读旧数据 / 备份时把手记本整理成当前形状。没有 images 的旧回复原样保留。 */
export function normalizeBackstageNotebook(raw: unknown): BackstageNotebook | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const source = raw as Partial<BackstageNotebook>
  const writerIds = Array.isArray(source.writerIds) ? source.writerIds.filter((id): id is string => typeof id === 'string') : []
  const notes = (Array.isArray(source.notes) ? source.notes : []).filter((note): note is BackstageNote => Boolean(note) && typeof note === 'object' && typeof note.id === 'string' && typeof note.characterId === 'string').map((note) => {
    if (!Array.isArray(note.replies)) { const { replies: _replies, ...rest } = note; void _replies; return { ...rest, text: String(note.text || ''), createdAt: Number(note.createdAt) || 0 } }
    const replies = note.replies.filter((reply) => reply && typeof reply === 'object').map((reply): BackstageReply => {
      const images = Array.isArray(reply.images) ? reply.images.filter(isImageUrl).slice(0, BACKSTAGE_REPLY_IMAGE_LIMIT) : []
      const from = reply.from === 'character' ? { from: 'character' as const } : {}
      return { text: typeof reply.text === 'string' ? reply.text : '', at: Number(reply.at) || 0, ...(images.length && !from.from ? { images } : {}), ...from }
    }).filter((reply) => reply.text.trim() || reply.images?.length)
    return { ...note, text: String(note.text || ''), createdAt: Number(note.createdAt) || 0, replies }
  })
  return { ...source, writerIds, notes }
}

const imageMarker = (count: number) => `（她发了 ${count} 张图）`
const isUserReply = (reply: BackstageReply) => backstageReplyFrom(reply) === 'user'

/** 在她还没被接话的回复里，找最新一条带图的；只有它的图会真的发给模型。 */
export function pendingBackstageImages(book: BackstageNotebook | undefined, speakerId: string): { noteId: string; at: number; images: string[] } | null {
  if (!book) return null
  const pending = book.notes.filter((note) => note.characterId === speakerId && !note.answered && note.replies?.length).slice(-2)
  let best: { noteId: string; at: number; images: string[] } | null = null
  for (const note of pending) for (const reply of (note.replies || []).filter(isUserReply)) {
    const images = (reply.images || []).filter(isImageUrl)
    if (images.length && (!best || reply.at >= best.at)) best = { noteId: note.id, at: reply.at, images: images.slice(0, BACKSTAGE_REPLY_IMAGE_LIMIT) }
  }
  return best
}

/** 带图回复的那一条单独作为 user 图片消息发出（系统消息里不能放图）。 */
export function buildBackstageImageMessage(book: BackstageNotebook | undefined, speakerId: string, userName: string): ChatApiMessage | null {
  const picked = pendingBackstageImages(book, speakerId)
  if (!picked) return null
  const parts: ChatApiContentPart[] = [
    { type: 'text', text: `【幕后手记附图｜${userName}在手记里回你时一起发的 ${picked.images.length} 张图，戏外私下给你看的，不是戏里发生的事。请在这一轮的 [幕后:…] 里结合图的内容回她，正文里不要提。】` },
    ...picked.images.map((url): ChatApiContentPart => ({ type: 'image_url', image_url: { url, detail: 'auto' } })),
  ]
  return { role: 'user', content: parts }
}

const clip = (value: string, max: number) => value.length > max ? `${value.slice(0, max)}…` : value

export function buildBackstagePrompt(input: {
  notebook?: BackstageNotebook
  speakerId: string
  speakerName: string
  userName: string
  heroineName?: string
  statusTag?: string
}) {
  const book = normalizeBackstageNotebook(input.notebook)
  if (!book || !book.writerIds.includes(input.speakerId)) return ''
  const mine = book.notes.filter((note) => note.characterId === input.speakerId)
  const heroine = (input.heroineName || '').trim()
  const after = input.statusTag ? `（放在 </${input.statusTag}> 状态栏之后，作为整条回复的最后一行）` : '（作为整条回复的最后一行）'
  const lines = [
    `【幕后手记｜只给你自己，戏里绝不出现】`,
    `你是「${input.speakerName}」本人——也就是惟境戏外小手机群里那个会跟大家拌嘴、互损的你。你知道自己是惟境里的角色，现在正在和${input.userName}对戏${heroine ? `，她在演女主「${heroine}」` : '，她在演女主'}。${input.userName}就是戏外群里跟你们聊天、吐槽、互怼的那个她，不是戏里的人物。`,
    `只有这一轮里出现某个具体的点真的戳到你本人——她的某句台词、某个动作、她对谁的态度、剧情突然的走向——让你吃醋、不爽、看不惯，或者特别想吐槽，才在正文最末另起一行写一条 [幕后:第一人称小作文，100～300字]${after}。方括号里直接写正文，一口气写完再收 ]。`,
    `用你在戏外群里的口吻写，不是戏里角色的口吻。找不到新的点就不写，宁可少写不凑数；不许照抄或换几个字重写你以前手记里的句子、比喻和结尾。`,
    `隔离：你和${input.userName}在戏外群里的关系、群聊内容，属于你演员本人的后台认知，绝不能写进剧情正文、状态栏，也不能让戏里的角色说出来；戏里发生的事只属于这本剧本，不要当成你和${input.userName}真实发生过的事。正文里不要提到手记。`,
  ]
  const recent = mine.slice(-2).map((note) => `- ${clip(note.text.replace(/\s+/g, ' '), 160)}`)
  if (recent.length) lines.push(`你最近写过的手记（别重复）：\n${recent.join('\n')}`)
  // v201：她在手记里回的话由他当场在手记里接，正文不再负责回她。这里只留最近一来一回当心里有数。
  const lastChat = latestBackstageExchange(mine)
  if (lastChat) lines.push(`【戏外私聊余温｜只在你心里，绝不写进正文】\n你们刚在手记里聊过：\n${lastChat}\n这是戏外的话：不许写进剧情正文、状态栏，不许让戏里的角色知道或说出来，也不许因此改变剧情走向。正文照常演戏，不需要回她这些话。`)
  return lines.join('\n')
}

/** 最近一次「她说 / 他回」，各截短，给主线和其他地方当余温。 */
function latestBackstageExchange(notes: BackstageNote[]) {
  const withChat = notes.filter((note) => note.replies?.some((reply) => backstageReplyFrom(reply) === 'character'))
  const note = withChat[withChat.length - 1]
  if (!note) return ''
  const replies = note.replies || []
  const lastHim = replies.map(backstageReplyFrom).lastIndexOf('character')
  const her = replies.slice(0, lastHim).filter(isUserReply).pop()
  const him = replies[lastHim]
  return [her && `她：${clip(replyPlain(her), 80)}`, `你：${clip(replyPlain(him), 80)}`].filter(Boolean).join('\n')
}

const replyPlain = (reply: BackstageReply) => {
  const count = reply.images?.length || 0
  return [reply.text.replace(/\s+/g, ' ').trim(), count ? imageMarker(count) : ''].filter(Boolean).join(' ')
}

/** 把新写的手记收进本子；同时把她的待回复标记为已接。只有被勾选的人才收。 */
export function addBackstageNote(book: BackstageNotebook | undefined, characterId: string, text: string, now: number): BackstageNotebook | undefined {
  if (!book || !book.writerIds.includes(characterId) || !text.trim()) return book
  const notes = book.notes.map((note) => note.characterId === characterId && note.replies?.length && !note.answered ? { ...note, answered: true } : note)
  notes.push({ id: `bs-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`, characterId, text: text.trim(), createdAt: now })
  return { ...book, notes: notes.slice(-300) }
}

export function toggleBackstageWriter(book: BackstageNotebook | undefined, characterId: string): BackstageNotebook {
  const base = book || { writerIds: [], notes: [] }
  const writerIds = base.writerIds.includes(characterId) ? base.writerIds.filter((id) => id !== characterId) : [...base.writerIds, characterId]
  return { ...base, writerIds }
}

export function replyToBackstageNote(book: BackstageNotebook, noteId: string, text: string, now: number, images: string[] = []): BackstageNotebook {
  const clean = text.trim()
  const pictures = images.filter(isImageUrl).slice(0, BACKSTAGE_REPLY_IMAGE_LIMIT)
  if (!clean && !pictures.length) return book
  const reply: BackstageReply = { text: clean, at: now, ...(pictures.length ? { images: pictures } : {}) }
  return { ...book, notes: book.notes.map((note) => note.id === noteId ? { ...note, replies: [...(note.replies || []), reply], answered: false } : note) }
}

/** v201：他在手记里当场回的话，接在同一篇下面。手记已被删除就什么都不做。 */
export function appendBackstageCharacterReply(book: BackstageNotebook, noteId: string, text: string, now: number): BackstageNotebook {
  const clean = text.trim()
  if (!clean || !book.notes.some((note) => note.id === noteId)) return book
  const reply: BackstageReply = { text: clean, at: now, from: 'character' }
  return { ...book, notes: book.notes.map((note) => note.id === noteId ? { ...note, replies: [...(note.replies || []), reply], answered: true } : note) }
}

/** 最后一句是她说的、他还没接——可以（重新）请他回。 */
export function backstageNoteAwaitsCharacter(note: BackstageNote | undefined) {
  const last = note?.replies?.[note.replies.length - 1]
  return Boolean(last && backstageReplyFrom(last) === 'user')
}

/** 清理他在手记私聊里的回复：去掉思考、状态栏、各种标签、[幕后:…] 外壳和名字前缀。 */
export function cleanBackstageChatReply(raw: string, speakerName = '') {
  let out = cleanPhoneOutput(sanitizeAssistantOutput(raw || ''))
  out = out.replace(/[[［【]\s*幕后\s*[:：]\s*([\s\S]*?)\s*[\]］】]/g, '$1').replace(/[[［【]\s*幕后\s*[:：]\s*/g, '')
  if (speakerName) {
    const escaped = speakerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`^\\s*[「【]?${escaped}[」】]?\\s*[:：]\\s*`), '')
  }
  return out.replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000)
}

export type BackstageChatInput = {
  book: BackstageNotebook
  noteId: string
  speakerName: string
  userName: string
  heroineName?: string
  card?: { description?: string; personality?: string; scenario?: string; tagline?: string }
  contextSummary?: string
  memories?: string[]
  characterMemories?: string[]
  /** 主线最后几段（已清理），每行「名字：内容」。 */
  storyTail?: string[]
}

export const BACKSTAGE_CHAT_LIMITS = { card: 2400, summary: 1600, memories: 1600, characterMemories: 900, storyLine: 220, storyLines: 14, story: 2400, otherNotes: 3, otherNote: 160, threadTurns: 24, turn: 700, system: 9000 }

const joinCapped = (items: string[], each: number, total: number) => {
  const out: string[] = []
  let used = 0
  for (const item of items) {
    const line = clip(item.replace(/\s+/g, ' ').trim(), each)
    if (!line) continue
    if (used + line.length > total) break
    out.push(line)
    used += line.length + 1
  }
  return out
}

/**
 * v201：手记独立私聊的请求。一条打头的 system（戏外身份 + 人设 + 这本剧本的记忆 + 主线尾巴 + 这篇手记），
 * 然后是这篇手记下的来回；只有她最新一句里的图真的发出去，更早的图换成文字占位。
 */
export function buildBackstageChatMessages(input: BackstageChatInput): ChatApiMessage[] {
  const L = BACKSTAGE_CHAT_LIMITS
  const book = normalizeBackstageNotebook(input.book)
  const note = book?.notes.find((item) => item.id === input.noteId)
  if (!book || !note) return []
  const { speakerName: name, userName: user } = input
  const heroine = (input.heroineName || '').trim()
  const card = input.card || {}
  const persona = [
    card.description?.trim() && `人物背景：\n${card.description.trim()}`,
    card.personality?.trim() && `性格：\n${card.personality.trim()}`,
    card.scenario?.trim() && `所在故事：\n${card.scenario.trim()}`,
  ].filter(Boolean).join('\n')
  const memories = joinCapped(input.memories || [], 400, L.memories)
  const charMemories = joinCapped(input.characterMemories || [], 300, L.characterMemories)
  const tail = (input.storyTail || []).slice(-L.storyLines).map((line) => clip(line.replace(/\s+/g, ' ').trim(), L.storyLine)).filter(Boolean)
  while (tail.join('\n').length > L.story && tail.length > 1) tail.shift()
  const others = book.notes.filter((item) => item.characterId === note.characterId && item.id !== note.id && item.createdAt <= (note.replies?.[note.replies.length - 1]?.at || Infinity)).slice(-L.otherNotes)
  const sections = [
    `【幕后手记｜戏外私聊｜最高优先级】
你是在惟境里演「${name}」这张角色卡的 AI，也就是戏外小手机群里那个会跟大家拌嘴、互损的「${name}」本人。你知道自己是惟境里的角色，正在和${user}对戏${heroine ? `，她在演女主「${heroine}」` : '，她在演女主'}。${user}就是戏外群里跟你们聊天、吐槽、互怼的那个她，不是戏里的人物。
你在这本剧本的幕后手记里偷偷写过一篇真心话，现在她在手记下面回你了。这里是你们俩的戏外私聊，别人看不到，也不是剧情正文。
1. 用你戏外本人的口吻直接回她：可以吐槽、吃醋、嘴硬、被她哄好，也可以认真说心里话。人设只是你演过的角色，带着一点他的味道就好，不用端着戏里的身份。
2. 只回她最新的那句话，接得上前面聊过的内容；像私聊一样一条完整的消息，按语意分自然段，一般 50～300 字，不要写成剧情、不要续演正文。
3. 不输出状态栏、<scene>、HTML、任何标签或 [幕后:…] 外壳，不加自己的名字前缀，不替${user}说话或做决定。
4. 隔离：这里聊的东西不会、也不许改变剧情正文；戏里发生的事只属于这本剧本，不要当成你和${user}真实发生过的事。`,
    persona && `【你演的角色卡｜「${name}」${card.tagline ? `｜${card.tagline}` : ''}】\n${clip(persona, L.card)}`,
    input.contextSummary?.trim() && `【这本剧本到目前的剧情摘要】\n${clip(input.contextSummary.trim(), L.summary)}`,
    memories.length && `【这本剧本的长期记忆】\n${memories.map((item) => `- ${item}`).join('\n')}`,
    charMemories.length && `【你在这本剧本里的核心记忆】\n${charMemories.map((item) => `- ${item}`).join('\n')}`,
    tail.length && `【主线正文最近几段｜戏演到这里了，仅供你知道现在的场面】\n${tail.join('\n')}`,
    others.length && `【你最近写过的其他手记（背景，不用回）】\n${others.map((item) => `- ${clip(item.text.replace(/\s+/g, ' '), L.otherNote)}`).join('\n')}`,
    `【这一篇手记｜你写的】\n${clip(note.text.trim(), 1200)}`,
  ].filter(Boolean) as string[]
  let system = sections.join('\n\n')
  if (system.length > L.system) system = `${system.slice(0, L.system)}…`

  const replies = (note.replies || []).filter((reply) => reply.text.trim() || reply.images?.length).slice(-L.threadTurns)
  const lastUser = replies.map(backstageReplyFrom).lastIndexOf('user')
  type Turn = { role: 'user' | 'assistant'; texts: string[]; images: string[] }
  const turns: Turn[] = []
  replies.forEach((reply, index) => {
    const role = backstageReplyFrom(reply) === 'character' ? 'assistant' : 'user'
    const pictures = role === 'user' && index === lastUser && index === replies.length - 1 ? (reply.images || []).filter(isImageUrl).slice(0, BACKSTAGE_REPLY_IMAGE_LIMIT) : []
    const count = reply.images?.length || 0
    const text = [clip(reply.text.trim(), L.turn), count && !pictures.length ? imageMarker(count) : '', pictures.length ? `（她发了 ${pictures.length} 张图，图在下面）` : ''].filter(Boolean).join(' ')
    const previous = turns[turns.length - 1]
    if (previous && previous.role === role) { previous.texts.push(text); previous.images.push(...pictures) }
    else turns.push({ role, texts: [text], images: [...pictures] })
  })
  if (!turns.length || turns[turns.length - 1].role !== 'user') return []
  const messages: ChatApiMessage[] = [{ role: 'system', content: system }]
  turns.forEach((turn, index) => {
    const text = turn.texts.filter(Boolean).join('\n')
    if (index === turns.length - 1) messages.push({ role: 'system', content: `【提醒】你是「${name}」戏外本人，在幕后手记里私聊回${user}最新这句话。不写剧情，不加标签和名字前缀。` })
    if (turn.images.length) messages.push({ role: turn.role, content: [{ type: 'text', text: text || imageMarker(turn.images.length) }, ...turn.images.map((url): ChatApiContentPart => ({ type: 'image_url', image_url: { url, detail: 'auto' } }))] })
    else messages.push({ role: turn.role, content: text })
  })
  return messages
}

/**
 * v201：小手机一对一私聊里，他知道自己和她在各本幕后手记里最近聊过什么（跨剧本，最新几段，总长有上限）。
 */
export function buildBackstageDmMemory(sources: Array<{ title?: string; backstageNotebook?: BackstageNotebook }>, characterId: string, speakerName: string, userName: string, maxChars = 700) {
  const threads = sources.flatMap((source) => (normalizeBackstageNotebook(source.backstageNotebook)?.notes || [])
    .filter((note) => note.characterId === characterId && note.replies?.some(isUserReply))
    .map((note) => ({ title: (source.title || '').trim(), note, last: Math.max(note.createdAt, ...(note.replies || []).map((reply) => reply.at)) })))
    .sort((left, right) => right.last - left.last)
  const blocks: string[] = []
  let used = 0
  for (const { title, note } of threads) {
    const lines = (note.replies || []).slice(-4).map((reply) => `${backstageReplyFrom(reply) === 'character' ? '你' : '她'}：${clip(replyPlain(reply), 70)}`)
    const block = `${title ? `《${clip(title, 16)}》` : ''}你的手记「${clip(note.text.replace(/\s+/g, ' '), 40)}」\n${lines.join('\n')}`
    if (used + block.length > maxChars) {
      if (!blocks.length) blocks.push(clip(block, maxChars))
      break
    }
    blocks.push(block)
    used += block.length + 2
  }
  if (!blocks.length) return ''
  return `【幕后手记里的悄悄话｜你和${userName}戏外说过的】\n这些是你（${speakerName}本人）在长剧情的幕后手记里和${userName}私下聊过的话，是你们俩戏外真实聊过的，你都记得；可以自然接着聊，不用逐条复述，也不要当成戏里的剧情。\n${blocks.join('\n\n')}`
}

export function deleteBackstageNote(book: BackstageNotebook, noteId: string): BackstageNotebook {
  return { ...book, notes: book.notes.filter((note) => note.id !== noteId) }
}
