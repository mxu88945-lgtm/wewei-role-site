/**
 * v239 人格窗口 Q 版立绘（移植自顾祁砚 v374 sprite-mode）。
 * 纯本地关键词打分：只读他已经说完的回复，不改提示词、记忆、导出或 token。
 */

export const SPRITE_MOODS = ['cold', 'happy', 'shy', 'love', 'smug', 'angry', 'sad', 'cry', 'surprised'] as const
export type SpriteMood = typeof SPRITE_MOODS[number]
export type SpriteAppear = 'mood' | 'always'
export type SpriteSide = 'left' | 'right'
export type SpritePos = { side: SpriteSide; y: number }

/** 立绘套装登记表：角色名里含 match 就用这套图。以后加角色只要在这里加一行 + 放图。 */
export type SpriteSet = { id: string; match: string; folder: string; prefix: string; defaultOn: boolean }
export const SPRITE_SETS: SpriteSet[] = [
  { id: 'xieyuheng', match: '谢聿衡', folder: 'sprites/xieyuheng/', prefix: 'xie_', defaultOn: true },
]

export function spriteSetFor(name: string | undefined | null): SpriteSet | null {
  const text = String(name || '')
  if (!text) return null
  return SPRITE_SETS.find((set) => text.includes(set.match)) || null
}

/** 相对路径（不带 BASE_URL），组件里拼 import.meta.env.BASE_URL。 */
export function spriteFile(set: SpriteSet, mood: SpriteMood) {
  return `${set.folder}${set.prefix}${mood}.webp`
}

// [词, 权重]。每个位置取最长的词，所以 冷笑/坏笑 不算 笑，心疼 不算 疼，哭了 不再拆。
// 归到 '' 的词只是吞掉（抱歉 ≠ 抱，小心 ≠ 心）。
const KEYWORDS: Record<SpriteMood | '', [string, number][]> = {
  '': [['抱歉', 1], ['小心', 1], ['放心', 1], ['当心', 1], ['心情', 1], ['心里', 1], ['关心', 1], ['怎么', 1], ['为什么', 1], ['干什么', 1], ['什么时候', 1]],
  cold: [['嗯', 1], ['随便', 1.2], ['沉默', 1.2], ['冷淡', 1.2], ['淡淡', 1], ['平静', 1], ['没说话', 1.2], ['面无表情', 1.5], ['不置可否', 1.2], ['发呆', 1.2], ['知道了', 0.6]],
  happy: [['早安', 1.5], ['早上好', 1.5], ['晚安', 1.5], ['回来了', 1.3], ['回来', 1.1], ['欢迎', 1], ['笑', 1], ['哈', 0.8], ['开心', 1.2], ['想见', 1.2], ['来了', 1], ['挥手', 1.3], ['招手', 1.3], ['好久不见', 1.3], ['嘿', 0.8]],
  shy: [['脸红', 1.5], ['红了脸', 1.5], ['耳根', 1.3], ['耳尖', 1.3], ['害羞', 1.5], ['心软', 1.3], ['软下来', 1], ['被夸', 1.2], ['宝宝', 1], ['乖', 1], ['托着下巴', 1], ['手托下巴', 1.2], ['托腮', 1.2], ['别开脸', 1.2], ['不好意思', 1.2], ['温柔', 0.8], ['轻声', 0.8], ['哄', 0.8], ['眨眼', 1]],
  love: [['爱你', 2], ['我爱', 1.5], ['喜欢', 1.3], ['亲亲', 1.5], ['亲了亲', 1.2], ['亲', 1], ['吻', 1.2], ['抱抱', 1.5], ['抱', 1], ['拥', 1], ['想你', 1.5], ['比心', 1.5], ['心动', 1.3], ['爱心', 1.3], ['❤', 1.5], ['♥', 1.5], ['贴贴', 1.3], ['疼你', 1.2]],
  smug: [['坏笑', 1.5], ['冷笑', 1.3], ['轻笑', 1.2], ['哼笑', 1.3], ['低笑', 1.1], ['似笑非笑', 1.5], ['得意', 1.3], ['逗你', 1.5], ['逗', 0.8], ['乖乖', 1.3], ['哼', 1], ['挑眉', 1.5], ['勾唇', 1.5], ['戏谑', 1.3], ['揶揄', 1.3], ['嗤', 1], ['抱臂', 1.2]],
  angry: [['生气', 1.3], ['不许', 1.2], ['不准', 1.2], ['闭嘴', 1.5], ['胡闹', 1.3], ['管你', 1], ['凶', 1], ['皱眉', 1.3], ['蹙眉', 1.3], ['冷声', 1.2], ['咬牙', 1.3], ['啧', 1], ['沉下脸', 1.5], ['黑了脸', 1.5], ['怒', 1.2], ['烦', 1], ['敢', 0.8], ['笑什么', 1.2], ['吃醋', 1.5], ['醋', 1]],
  sad: [['委屈', 1.5], ['难过', 1.5], ['对不起', 1.3], ['心疼', 1.5], ['舍不得', 1.5], ['疼', 1], ['难受', 1.3], ['失落', 1.3], ['低落', 1.3], ['叹气', 1], ['担心', 1]],
  cry: [['哭了', 1.6], ['哭', 1.5], ['眼泪', 1.6], ['泪', 1.4], ['眼眶', 1.3], ['哽咽', 1.5], ['哽', 1.3], ['呜呜', 1.6], ['呜', 1.2]],
  surprised: [['什么？', 1.2], ['什么?', 1.2], ['什么！', 1.2], ['什么', 0.5], ['真的？', 1.3], ['真的?', 1.3], ['啊？', 1.2], ['啊?', 1.2], ['啊！', 1], ['啊', 0.4], ['居然', 1.3], ['竟然', 1.3], ['诶', 1], ['欸', 1], ['吓', 1.2], ['？！', 1.2], ['?!', 1.2], ['！？', 1.2], ['!?', 1.2], ['愣', 1.2], ['怔', 1.2], ['瞪大', 1.3], ['惊', 1.2]],
}

type IndexedWord = { w: string; mood: SpriteMood | ''; weight: number }
let wordIndex: IndexedWord[] | null = null
function spriteWordIndex() {
  if (wordIndex) return wordIndex
  const all: IndexedWord[] = []
  for (const mood of Object.keys(KEYWORDS) as (SpriteMood | '')[]) for (const [w, weight] of KEYWORDS[mood]) all.push({ w, mood, weight })
  all.sort((a, b) => b.w.length - a.w.length)
  wordIndex = all
  return all
}

function moodText(text: string) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    // 状态 / 工具标记，例如 [自我卡:喜好|…] 【状态：…】，不是他的表情
    .replace(/[[【［][^\]】］\n]{0,24}[:：][^\]】］]*[\]】］]/g, ' ')
}

export function spriteMoodScores(text: string): Record<SpriteMood, number> {
  const t = moodText(text)
  const scores = Object.fromEntries(SPRITE_MOODS.map((mood) => [mood, 0])) as Record<SpriteMood, number>
  if (!t.trim()) return scores
  // 按回复顺序切片：动作 / 旁白（*…*、（…）、(…)）比台词更能说明他的脸，算双倍；越往后的句子权重略高。
  const pieces: { s: string; action: boolean }[] = []
  const actionRe = /\*[^*\n]{1,200}\*|（[^（）\n]{1,200}）|\([^()\n]{1,200}\)/g
  let last = 0
  let match: RegExpExecArray | null
  const pushSpeech = (str: string) => str.split(/(?<=[。！？!?…\n])/).forEach((piece) => { if (piece.trim()) pieces.push({ s: piece, action: false }) })
  while ((match = actionRe.exec(t))) {
    pushSpeech(t.slice(last, match.index))
    pieces.push({ s: match[0], action: true })
    last = match.index + match[0].length
  }
  pushSpeech(t.slice(last))
  const n = pieces.length
  const index = spriteWordIndex()
  pieces.forEach(({ s, action }, i) => {
    const mul = (1 + (n > 1 ? 0.5 * i / (n - 1) : 0)) * (action ? 2 : 1)
    for (let p = 0; p < s.length;) {
      let hit: IndexedWord | null = null
      for (const word of index) if (s.startsWith(word.w, p)) { hit = word; break }
      if (!hit) { p++; continue }
      if (hit.mood) scores[hit.mood] += hit.weight * mul
      p += hit.w.length
    }
  })
  return scores
}

/** 最高分的表情；不到 1 分保持平静；平分时保留上一张（上一张不在平分里就平静）。 */
export function classifySpriteMood(text: string, previous: SpriteMood | '' = ''): SpriteMood {
  const scores = spriteMoodScores(text)
  let best: SpriteMood = 'cold'
  let bestScore = 0
  let tied: SpriteMood[] = []
  for (const mood of SPRITE_MOODS) {
    const score = scores[mood]
    if (score > bestScore + 1e-6) { best = mood; bestScore = score; tied = [mood] }
    else if (score > 0 && Math.abs(score - bestScore) <= 1e-6) tied.push(mood)
  }
  if (bestScore < 1) return 'cold'
  if (tied.length > 1) return previous && tied.includes(previous) ? previous : 'cold'
  return best
}

type TailMessage = { role: string; text: string; speakerId?: string }
/** 他最近一轮 = 末尾连续的回复（多气泡），跳过群聊客人说的话。 */
export function spriteReplyTail(list: readonly TailMessage[], readText: (message: TailMessage) => string, isGuest: (message: TailMessage) => boolean = () => false) {
  const parts: string[] = []
  for (let i = list.length - 1; i >= 0 && parts.length < 6; i--) {
    const message = list[i]
    if (!message) continue
    if (message.role !== 'assistant') break
    if (isGuest(message)) continue
    parts.unshift(String(readText(message) || ''))
  }
  return parts.join('\n').slice(-2000)
}

export type SpriteBox = { mainW: number; mainH: number; headerB: number; baseBottom: number; w: number; h: number }
/** 松手位置 → 吸到最近的左/右边；y（站在输入框上方多高）夹在顶栏下、输入框上。 */
export function spriteSnapPos(pos: { x: number; y: number }, box: SpriteBox): SpritePos {
  const side: SpriteSide = pos.x + box.w / 2 < box.mainW / 2 ? 'left' : 'right'
  const maxY = Math.max(0, box.mainH - box.baseBottom - box.headerB - box.h)
  const y = Math.round(Math.min(maxY, Math.max(0, Number(pos.y) || 0)))
  return { side, y }
}

/** 每个人格各自的立绘设置（localStorage weijing.personaSprite，随备份带走）。 */
export const PERSONA_SPRITE_KEY = 'weijing.personaSprite'
export type PersonaSpritePrefs = { on?: boolean; appear?: SpriteAppear; pos?: SpritePos; hidden?: boolean }
export type PersonaSpriteState = Record<string, PersonaSpritePrefs>

export function normalizeSpriteState(raw: unknown): PersonaSpriteState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: PersonaSpriteState = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const prefs: PersonaSpritePrefs = {}
    if (typeof v.on === 'boolean') prefs.on = v.on
    if (v.appear === 'mood' || v.appear === 'always') prefs.appear = v.appear
    if (typeof v.hidden === 'boolean') prefs.hidden = v.hidden
    const pos = v.pos as Record<string, unknown> | undefined
    if (pos && (pos.side === 'left' || pos.side === 'right')) prefs.pos = { side: pos.side, y: Math.max(0, Math.round(Number(pos.y) || 0)) }
    out[id] = prefs
  }
  return out
}

/** 这个人格是否显示立绘：没有立绘套装就永远不显示；她没设置过就按套装默认。 */
export function spriteEnabled(set: SpriteSet | null, prefs: PersonaSpritePrefs | undefined) {
  if (!set) return false
  return prefs?.on ?? set.defaultOn
}

export const spriteAppearOf = (prefs: PersonaSpritePrefs | undefined): SpriteAppear => prefs?.appear === 'always' ? 'always' : 'mood'
export const spritePosOf = (prefs: PersonaSpritePrefs | undefined): SpritePos => prefs?.pos || { side: 'right', y: 0 }

export const SPRITE_STAY_MS = 8000
