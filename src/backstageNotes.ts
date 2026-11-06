/**
 * 幕后手记（v181）：长剧情里，被她勾选的角色可以在正文最末写一条 [幕后:…]，
 * 以「戏外小手机群里那个本人」的口吻私下吐槽这一轮。每个角色各一本，互不可见；
 * 她回复某一篇后，下一轮只有那个角色会接她的话。
 */
export type BackstageNote = {
  id: string
  characterId: string
  text: string
  createdAt: number
  /** 她在手记里回的话（可以多条）。 */
  replies?: { text: string; at: number }[]
  /** 角色已经在后续手记里接过她最新一条回复。 */
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

const clip = (value: string, max: number) => value.length > max ? `${value.slice(0, max)}…` : value

export function buildBackstagePrompt(input: {
  notebook?: BackstageNotebook
  speakerId: string
  speakerName: string
  userName: string
  heroineName?: string
  statusTag?: string
}) {
  const book = input.notebook
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
  const pending = mine.filter((note) => !note.answered && note.replies?.length).slice(-2)
  if (pending.length) {
    const quoted = pending.map((note) => `你写过：「${clip(note.text.replace(/\s+/g, ' '), 120)}」\n她回你：「${clip((note.replies || []).map((reply) => reply.text).join(' / '), 300)}」`).join('\n\n')
    lines.push(`【她在幕后手记里回你了｜戏外私下的话】\n${quoted}\n这一轮必须在最末写一条 [幕后:…] 回她（不受“要有新的点”的限制），第一句就直接接她这句话，用你本人的口吻，可以继续吐槽、吃醋、嘴硬或者被她哄好。正文照常演戏，不要在戏里提到这些。`)
  }
  return lines.join('\n')
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

export function replyToBackstageNote(book: BackstageNotebook, noteId: string, text: string, now: number): BackstageNotebook {
  const clean = text.trim()
  if (!clean) return book
  return { ...book, notes: book.notes.map((note) => note.id === noteId ? { ...note, replies: [...(note.replies || []), { text: clean, at: now }], answered: false } : note) }
}

export function deleteBackstageNote(book: BackstageNotebook, noteId: string): BackstageNotebook {
  return { ...book, notes: book.notes.filter((note) => note.id !== noteId) }
}
