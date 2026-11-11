/**
 * v198 剧情美化卡（所有角色通用）。
 * 模型在回复最后写一个 <film>…</film> 块；界面把它从正文里拿掉，在消息底部
 * 渲染成唱片机 + 胶片 + NPC 档案 + 心声的小卡片。块里缺行、没闭合都不会崩。
 * 所有正则都在函数内新建（局部实例），不共享 lastIndex。
 */

export type FilmDanger = '低' | '中' | '高' | ''

export interface FilmNpc {
  name: string
  role: string
  stance: string
  danger: FilmDanger
  desc: string
}

export interface FilmCardData {
  song?: { title: string; artist: string }
  sceneTitle: string
  sceneDesc: string
  en: string
  zh: string
  npcs: FilmNpc[]
  heart: string
  /** 块没有写完（没有 </film>）时为 false。 */
  closed: boolean
}

export interface FilmExtraction {
  /** 去掉 film 块之后的正文。 */
  body: string
  /** 解析出的卡片；没有块、块是空的、或流式中块还没写完时为 null。 */
  card: FilmCardData | null
  /** 流式输出中正在写 film 块（正文已隐藏未闭合部分）。 */
  pending: boolean
}

const OPEN_SRC = '<\\s*film\\b[^>]*>'
const CLOSE_SRC = '<\\s*\\/\\s*film\\s*>'

function tidy(value: string) {
  return value
    // 模型偶尔把块包在代码围栏里：块拿掉后剩下的空围栏也一起去掉。
    .replace(new RegExp('```[a-z]*[ \\t]*\\n?\\s*```', 'gi'), '')
    .replace(new RegExp('[ \\t]+\\n', 'g'), '\n')
    .replace(new RegExp('\\n{3,}', 'g'), '\n\n')
    .trim()
}

/** 去掉所有 film 块（含未闭合的尾巴和落单的 </film>），给发给模型的历史、记忆、导出用。 */
export function stripFilmBlocks(value: string) {
  if (!value || !new RegExp('<\\s*\\/?\\s*film\\b', 'i').test(value)) return value
  const stripped = value
    .replace(new RegExp(`${OPEN_SRC}[\\s\\S]*?${CLOSE_SRC}`, 'gi'), '')
    .replace(new RegExp(`${OPEN_SRC}[\\s\\S]*$`, 'i'), '')
    .replace(new RegExp(CLOSE_SRC, 'gi'), '')
  return tidy(stripped)
}

function splitFields(value: string) {
  return value.split(new RegExp('[｜|]')).map((part) => part.trim())
}

function normalizeDanger(value: string): FilmDanger {
  const v = value.trim().toLowerCase()
  if (!v) return ''
  if (new RegExp('^(?:高|high|极高|危|危险)').test(v)) return '高'
  if (new RegExp('^(?:中|mid|medium|一般)').test(v)) return '中'
  if (new RegExp('^(?:低|low|无|安全)').test(v)) return '低'
  if (v.includes('高')) return '高'
  if (v.includes('中')) return '中'
  if (v.includes('低')) return '低'
  return ''
}

function parseSong(value: string) {
  const clean = value.replace(new RegExp('[《》「」“”"]', 'g'), '').trim()
  if (!clean || new RegExp('^(?:无|没有|none|-|—)$', 'i').test(clean)) return undefined
  const parts = clean.split(new RegExp('\\s+[-–—]+\\s+|\\s*——\\s*|\\s*[/／]\\s*'))
  const title = (parts[0] || '').trim()
  const artist = parts.slice(1).join(' ').trim()
  return title ? { title: title.slice(0, 60), artist: artist.slice(0, 40) } : undefined
}

type FilmKey = 'song' | 'scene' | 'caption' | 'npc' | 'heart'

function keyOf(label: string): FilmKey | '' {
  const l = label.trim().toLowerCase()
  const table: Array<[string, FilmKey]> = [
    ['^(?:歌|歌曲|曲|音乐|bgm|song|music)$', 'song'],
    ['^(?:幕|场景|画面|scene)$', 'scene'],
    ['^(?:题|题记|点题|句|caption|quote)$', 'caption'],
    ['^(?:人|人物|npc|角色|档案)$', 'npc'],
    ['^(?:心声|心|内心|没说出口|heart|inner)$', 'heart'],
  ]
  for (const [pattern, key] of table) if (new RegExp(pattern, 'i').test(l)) return key
  return ''
}

/** 解析 film 块里面的内容（不含标签）。缺行就留空，不认识的行忽略。 */
export function parseFilmBody(inner: string, closed = true): FilmCardData | null {
  const card: FilmCardData = { sceneTitle: '', sceneDesc: '', en: '', zh: '', npcs: [], heart: '', closed }
  const lineRe = new RegExp('^\\s*(?:[-*•·]\\s*)?([^：:\\s]{1,8})\\s*[：:]\\s*(.*)$')
  for (const raw of inner.replace(new RegExp('\\r\\n?', 'g'), '\n').split('\n')) {
    const match = lineRe.exec(raw)
    if (!match) continue
    const key = keyOf(match[1])
    const value = match[2].trim()
    if (!key || !value) continue
    if (key === 'song') card.song = parseSong(value)
    else if (key === 'scene') {
      const [title, ...rest] = splitFields(value)
      card.sceneTitle = (title || '').slice(0, 40)
      card.sceneDesc = rest.join('，').slice(0, 120)
    } else if (key === 'caption') {
      const [en, ...rest] = splitFields(value)
      // 只给了一句中文也接受。
      if (rest.length) { card.en = (en || '').slice(0, 120); card.zh = rest.join('，').slice(0, 80) }
      else if (new RegExp('[\\u3400-\\u9fff]').test(en || '')) card.zh = (en || '').slice(0, 80)
      else card.en = (en || '').slice(0, 120)
    } else if (key === 'npc') {
      if (card.npcs.length >= 4) continue
      const [name, role = '', stance = '', danger = '', ...desc] = splitFields(value)
      if (!name) continue
      card.npcs.push({ name: name.slice(0, 16), role: role.slice(0, 24), stance: stance.slice(0, 24), danger: normalizeDanger(danger), desc: desc.join('，').slice(0, 120) })
    } else if (key === 'heart') card.heart = value.replace(new RegExp('^[「“"]|[」”"]$', 'g'), '').slice(0, 80)
  }
  const empty = !card.song && !card.sceneTitle && !card.sceneDesc && !card.en && !card.zh && !card.npcs.length && !card.heart
  return empty ? null : card
}

/**
 * 从一条助手消息里拿出 film 块。
 * - 闭合的块全部从正文移除，用最后一个渲染。
 * - 没闭合的块：流式时隐藏（pending），结束后按已写的部分尽量渲染。
 * - 流式时正文末尾半截的 "<fi" 也先藏起来，免得露出原始标签。
 */
export function extractFilmCard(text: string, options: { streaming?: boolean } = {}): FilmExtraction {
  const streaming = Boolean(options.streaming)
  if (!text) return { body: text, card: null, pending: false }
  let source = text
  if (streaming) source = source.replace(new RegExp('<\\s*\\/?\\s*(?:f(?:i(?:l(?:m)?)?)?)?$', 'i'), '')
  if (!new RegExp('<\\s*\\/?\\s*film\\b', 'i').test(source)) return { body: streaming ? source : text, card: null, pending: false }

  let lastInner: string | null = null
  const pairRe = new RegExp(`${OPEN_SRC}([\\s\\S]*?)${CLOSE_SRC}`, 'gi')
  let withoutPairs = source.replace(pairRe, (_match, inner: string) => { lastInner = inner; return '' })

  let pending = false
  let danglingInner: string | null = null
  const openRe = new RegExp(`${OPEN_SRC}([\\s\\S]*)$`, 'i')
  const dangling = openRe.exec(withoutPairs)
  if (dangling) {
    danglingInner = dangling[1]
    withoutPairs = withoutPairs.slice(0, dangling.index)
    if (streaming) pending = true
  }
  const body = tidy(withoutPairs.replace(new RegExp(CLOSE_SRC, 'gi'), ''))

  let card: FilmCardData | null = null
  if (danglingInner !== null && !streaming) card = parseFilmBody(danglingInner, false)
  if (!card && lastInner !== null) card = parseFilmBody(lastInner, true)
  return { body, card: pending ? null : card, pending }
}

/**
 * v204：给模型看的歌单（「他是可以看到歌单名字的」）：去扩展名、去重，最多 40 首、总长约 800 字以内。
 */
export function playlistForPrompt(names: readonly string[] | undefined, maxCount = 40, maxChars = 800): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let total = 0
  for (const raw of names || []) {
    const name = String(raw || '').replace(/\.(mp3|m4a|aac|flac|wav|ogg|opus|alac|aiff?|wma|webm|mp4)$/i, '').replace(/\s+/g, ' ').trim()
    if (!name || seen.has(name)) continue
    if (out.length >= maxCount || total + name.length + 3 > maxChars) break
    seen.add(name)
    out.push(name)
    total += name.length + 3
  }
  return out
}

/** 系统提示末尾的输出要求（开关开着时，单人剧情和普通群聊都加）。playlist：她歌单里的歌名（v204）。 */
export function filmCardInstruction(speakerName: string, userName: string, hasStatusBlock = false, playlist?: readonly string[]) {
  const songs = playlistForPrompt(playlist)
  const songRule = songs.length
    ? `- 「歌」：${userName}的歌单里有这些歌：${songs.map((name) => `《${name}》`).join('')}。优先从这份歌单里挑一首最贴这一幕氛围的，歌名照歌单里的写法原样写；只有歌单里实在没有合适的，才可以写别的真实歌曲，或者整行省略。不要编造不存在的歌。`
    : '- 「歌」可选：有适合这一幕氛围的真实歌曲就写，没有就整行省略，不要编造不存在的歌。'
  return `【剧情美化卡｜每次回复都要输出】
写完本轮正文${hasStatusBlock ? '和状态栏' : ''}之后，在整条回复的最后另起一行，输出且只输出一个 <film> 块，格式固定如下（每行一个字段，字段内用全角竖线｜分隔）：
<film>
歌：歌名 - 歌手
幕：这一幕的标题（4—10 字）｜一句画面描述（20 字内）
题：一句简短英文｜一句中文点题（12 字内）
人：名字｜身份｜立场｜危险度（低/中/高）｜一句描述（30 字内）
心声：${speakerName}没说出口的一句话
</film>
规则：
${songRule}
- 「人」写 0—4 行，只写这一幕在场或与这一幕直接相关的人物；可以不写${userName}，也可以写${speakerName}本人。一行一个人。
- 「心声」是${speakerName}此刻心里想却没有说出口的话，一句，第一人称，不要旁白腔。
- <film> 块只能放在全文最末尾，必须写出 </film> 闭合；绝不能写进正文中间，正文里也不要提到这个块或复述其中内容。不要加代码围栏、不要加其他标签。`
}

/**
 * v200 唱片机条显示什么：
 * - 正在放的不是卡里的歌（歌单里没匹配到 / 卡里没写歌）→ 显示真正在放的歌名，下面是当前歌词；
 *   卡里的歌名变成一行小灰字「X点的：歌名」。
 * - 卡里的歌匹配到了且正在放 → 卡里的歌名，下面是当前歌词（没歌词显示歌手）。
 * - 都没在放 → 卡里的歌名 + 歌手（或你上次放的歌 / 一起听歌）。
 */
export function filmGramoText(input: {
  song?: { title: string; artist: string } | null
  matchedName?: string | null
  nowName?: string
  nowPlaying?: boolean
  lyricLine?: string
  speakerName: string
}): { title: string; sub: string; requested: string; playingHere: boolean } {
  const { song, matchedName, nowName, nowPlaying, speakerName } = input
  const lyric = (input.lyricLine || '').trim()
  const playingOther = Boolean(nowPlaying && nowName && (!matchedName || nowName !== matchedName))
  if (playingOther) {
    return { title: nowName!, sub: lyric || '你的歌单', requested: song?.title ? `${speakerName}点的：${song.title}` : '', playingHere: true }
  }
  if (song?.title) {
    const playingHere = Boolean(nowPlaying && matchedName && nowName === matchedName)
    return { title: song.title, sub: (playingHere && lyric) || song.artist, requested: '', playingHere }
  }
  if (nowName) return { title: nowName, sub: '你的歌单', requested: '', playingHere: false }
  return { title: '一起听歌', sub: '点播放导入歌', requested: '', playingHere: false }
}

/**
 * v204：剧情卡上要不要显示「点播放 ▶ 听《X》」。
 * - 自动切歌被拦下（blockedId 就是这首）且没在放 → 显示（原 v202 行为）。
 * - 最新一条助手消息的卡：点的歌匹配到了、没在放、这张卡出现后既没放过也没被她点过 → 显示
 *   （ripe：卡出现后等自动切歌那几秒，免得一闪）。
 * 她点过播放或这首放过之后不再催；之后她自己换歌，卡上只显示小字「X点的：…」。
 */
export function filmPlayNudge(input: {
  matchedId?: string | null
  playingHere: boolean
  blockedId?: string
  isLatest?: boolean
  settled?: boolean
  ripe?: boolean
}): boolean {
  const { matchedId, playingHere, blockedId, isLatest, settled, ripe } = input
  if (!matchedId || playingHere) return false
  if (blockedId && blockedId === matchedId) return true
  return Boolean(isLatest && ripe && !settled)
}
