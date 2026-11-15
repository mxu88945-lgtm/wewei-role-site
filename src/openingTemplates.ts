// v244：开场白美化模板（内置、可换色）。
// 模板只负责“开场白上方”的互动页面；真正的开场白正文仍是可编辑纯文本，渲染在模板下方。
// renderOpeningTemplate 是纯函数：所有文字都转义，所有颜色都走 CSS 变量，色值只接受合法 hex。
import type { Character } from './characterCard'

export type OpeningTemplateId = 'y2k-pink'

export type OpeningTemplateTheme = {
  primary: string
  secondary: string
  accent: string
  paper: string
  ink: string
  bg: string
}

export type OpeningTemplateChat = { time: string; text: string }
export type OpeningTemplateSong = { title: string; artist: string }
export type OpeningTemplatePost = { time: string; text: string; likes: number; comment: string }
export type OpeningTemplateFriendGroup = { name: string; count: string }

export type OpeningTemplateData = {
  /** 称呼对方用的代词：他 / 她 / TA */
  pronoun: string
  letter: string
  englishName: string
  age: string
  personality: string
  intro: string
  signature: string
  notice: string
  mood: string
  chats: OpeningTemplateChat[]
  songs: OpeningTemplateSong[]
  musicDiary: string
  posts: OpeningTemplatePost[]
  albumCaption: string
  friendGroups: OpeningTemplateFriendGroup[]
  friendTags: string[]
}

export type OpeningTemplate = {
  id: OpeningTemplateId
  theme: OpeningTemplateTheme
  data: OpeningTemplateData
}

export const OPENING_TEMPLATE_OPTIONS: Array<{ id: OpeningTemplateId; label: string }> = [
  { id: 'y2k-pink', label: '千禧粉 QQ空间' },
]

export const OPENING_THEME_KEYS = ['primary', 'secondary', 'accent', 'paper', 'ink', 'bg'] as const
export const OPENING_THEME_LABELS: Record<keyof OpeningTemplateTheme, string> = {
  primary: '主色', secondary: '辅色', accent: '点缀', paper: '纸面', ink: '文字', bg: '底色',
}

export const OPENING_THEME_PRESETS: Array<{ id: string; label: string; theme: OpeningTemplateTheme }> = [
  { id: 'y2k-pink', label: '千禧粉', theme: { primary: '#ff5fa2', secondary: '#b9a3ff', accent: '#ffe27a', paper: '#fff5fa', ink: '#5b2949', bg: '#ffd9ec' } },
  { id: 'lilac-grey', label: '紫灰', theme: { primary: '#8d7aa6', secondary: '#b7b1c6', accent: '#ece1f2', paper: '#f7f4f9', ink: '#3e3747', bg: '#dcd6e4' } },
  { id: 'mist-blue', label: '雾蓝', theme: { primary: '#6b90b6', secondary: '#a8c0d6', accent: '#f1e5b8', paper: '#f3f7fb', ink: '#2e4256', bg: '#d5e2ed' } },
  { id: 'milk-tea', label: '奶茶', theme: { primary: '#b2805f', secondary: '#d6bea5', accent: '#f4e0bb', paper: '#fcf7f0', ink: '#59402f', bg: '#ecdcc8' } },
]

export const DEFAULT_OPENING_THEME: OpeningTemplateTheme = { ...OPENING_THEME_PRESETS[0].theme }

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value.trim())
}

/** 规范化为小写 #rrggbb；不合法返回 null。 */
export function normalizeHexColor(value: unknown): string | null {
  if (!isValidHexColor(value)) return null
  const raw = value.trim().toLowerCase()
  return raw.length === 4 ? `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}` : raw
}

/** 每个颜色单独校验，不合法的回落到 fallback（默认千禧粉）。 */
export function normalizeOpeningTheme(value: unknown, fallback: OpeningTemplateTheme = DEFAULT_OPENING_THEME): OpeningTemplateTheme {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const theme = { ...fallback }
  for (const key of OPENING_THEME_KEYS) theme[key] = normalizeHexColor(source[key]) || fallback[key]
  return theme
}

const str = (value: unknown, max = 600) => typeof value === 'string' ? value.trim().slice(0, max) : typeof value === 'number' ? String(value) : ''
const list = <T>(value: unknown, max: number, map: (item: unknown) => T | null): T[] => Array.isArray(value)
  ? value.map(map).filter((item): item is T => item !== null).slice(0, max)
  : []
const obj = (item: unknown) => (item && typeof item === 'object' ? item : {}) as Record<string, unknown>

export function createDefaultOpeningData(): OpeningTemplateData {
  return {
    pronoun: '他', letter: '', englishName: '', age: '', personality: '', intro: '', signature: '', notice: '', mood: '',
    chats: [], songs: [], musicDiary: '', posts: [], albumCaption: '', friendGroups: [], friendTags: [],
  }
}

export function normalizeOpeningData(value: unknown): OpeningTemplateData {
  const source = obj(value)
  const pronoun = str(source.pronoun, 4)
  return {
    pronoun: ['他', '她', 'TA', '它'].includes(pronoun) ? pronoun : '他',
    letter: str(source.letter, 800),
    englishName: str(source.englishName, 60),
    age: str(source.age, 20),
    personality: str(source.personality, 80),
    intro: str(source.intro, 500),
    signature: str(source.signature, 60),
    notice: str(source.notice, 300),
    mood: str(source.mood, 200),
    chats: list(source.chats, 2, (item) => {
      const entry = obj(item); const text = str(entry.text, 160)
      return text ? { time: str(entry.time, 12), text } : null
    }),
    songs: list(source.songs, 5, (item) => {
      const entry = typeof item === 'string' ? { title: item } : obj(item); const title = str(entry.title, 40)
      return title ? { title, artist: str(entry.artist, 30) } : null
    }),
    musicDiary: str(source.musicDiary, 300),
    posts: list(source.posts, 3, (item) => {
      const entry = obj(item); const text = str(entry.text, 200)
      const likes = Math.max(0, Math.min(9999, Math.round(Number(entry.likes) || 0)))
      return text ? { time: str(entry.time, 20), text, likes, comment: str(entry.comment, 80) } : null
    }),
    albumCaption: str(source.albumCaption, 80),
    friendGroups: list(source.friendGroups, 4, (item) => {
      const entry = obj(item); const name = str(entry.name, 16)
      return name ? { name, count: str(entry.count, 10) } : null
    }),
    friendTags: list(source.friendTags, 6, (item) => { const tag = str(item, 8); return tag || null }),
  }
}

/** 旧卡没有这个字段 → undefined，渲染与导出都完全不变。 */
export function normalizeOpeningTemplate(value: unknown): OpeningTemplate | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  if (source.id !== 'y2k-pink') return undefined
  return { id: 'y2k-pink', theme: normalizeOpeningTheme(source.theme), data: normalizeOpeningData(source.data) }
}

export function createOpeningTemplate(id: OpeningTemplateId = 'y2k-pink'): OpeningTemplate {
  return { id, theme: { ...DEFAULT_OPENING_THEME }, data: createDefaultOpeningData() }
}

// ---------------------------------------------------------------------------
// 工坊助手 / AI 填写用的局部改动
// ---------------------------------------------------------------------------

export type OpeningTemplatePatch = {
  /** 'none' 表示移除模板 */
  id?: OpeningTemplateId | 'none'
  theme?: Partial<OpeningTemplateTheme>
  data?: Partial<OpeningTemplateData>
}

/** 解析模型给的改动；颜色逐个校验，不合法的直接丢弃（invalidColors 里列出）。 */
export function parseOpeningTemplatePatch(value: unknown): { patch: OpeningTemplatePatch | undefined; invalidColors: string[] } {
  const invalidColors: string[] = []
  if (!value || typeof value !== 'object') return { patch: undefined, invalidColors }
  const source = value as Record<string, unknown>
  const patch: OpeningTemplatePatch = {}
  if (source.id === 'none' || source.id === null) patch.id = 'none'
  else if (source.id === 'y2k-pink') patch.id = 'y2k-pink'
  if (source.theme && typeof source.theme === 'object') {
    const theme: Partial<OpeningTemplateTheme> = {}
    for (const key of OPENING_THEME_KEYS) {
      const raw = (source.theme as Record<string, unknown>)[key]
      if (raw === undefined) continue
      const color = normalizeHexColor(raw)
      if (color) theme[key] = color
      else invalidColors.push(`${key}=${String(raw).slice(0, 20)}`)
    }
    if (Object.keys(theme).length) patch.theme = theme
  }
  if (source.data && typeof source.data === 'object') {
    const raw = source.data as Record<string, unknown>
    const normalized = normalizeOpeningData(raw)
    const data: Partial<OpeningTemplateData> = {}
    for (const key of Object.keys(normalized) as Array<keyof OpeningTemplateData>) {
      if (key in raw) (data as Record<string, unknown>)[key] = normalized[key]
    }
    if (Object.keys(data).length) patch.data = data
  }
  return { patch: Object.keys(patch).length ? patch : undefined, invalidColors }
}

export function applyOpeningTemplatePatch(current: OpeningTemplate | undefined, patch: OpeningTemplatePatch): OpeningTemplate | undefined {
  if (patch.id === 'none') return undefined
  const base = current || (patch.id || patch.theme || patch.data ? createOpeningTemplate() : undefined)
  if (!base) return undefined
  return normalizeOpeningTemplate({
    id: 'y2k-pink',
    theme: { ...base.theme, ...(patch.theme || {}) },
    data: { ...base.data, ...(patch.data || {}) },
  })
}

// ---------------------------------------------------------------------------
// 编辑框里的“一行一条”格式
// ---------------------------------------------------------------------------

const splitLines = (value: string) => value.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean)
const cells = (line: string) => line.split(/\s*[|｜]\s*/)

export const openingLines = {
  chats: {
    format: (items: OpeningTemplateChat[]) => items.map((item) => `${item.time}｜${item.text}`).join('\n'),
    parse: (value: string): OpeningTemplateChat[] => splitLines(value).slice(0, 2).map((line) => {
      const parts = cells(line)
      return parts.length > 1 ? { time: parts[0], text: parts.slice(1).join('｜') } : { time: '', text: parts[0] }
    }),
  },
  songs: {
    format: (items: OpeningTemplateSong[]) => items.map((item) => item.artist ? `${item.title}｜${item.artist}` : item.title).join('\n'),
    parse: (value: string): OpeningTemplateSong[] => splitLines(value).slice(0, 5).map((line) => {
      const parts = cells(line)
      return { title: parts[0], artist: parts.slice(1).join(' ') }
    }),
  },
  posts: {
    format: (items: OpeningTemplatePost[]) => items.map((item) => [item.time, item.text, String(item.likes), item.comment].join('｜')).join('\n'),
    parse: (value: string): OpeningTemplatePost[] => splitLines(value).slice(0, 3).map((line) => {
      const parts = cells(line)
      if (parts.length === 1) return { time: '', text: parts[0], likes: 0, comment: '' }
      return { time: parts[0], text: parts[1] || '', likes: Math.max(0, Math.round(Number(parts[2]) || 0)), comment: parts.slice(3).join('｜') }
    }).filter((item) => item.text),
  },
  friendGroups: {
    format: (items: OpeningTemplateFriendGroup[]) => items.map((item) => item.count ? `${item.name}｜${item.count}` : item.name).join('\n'),
    parse: (value: string): OpeningTemplateFriendGroup[] => splitLines(value).slice(0, 4).map((line) => {
      const parts = cells(line)
      return { name: parts[0], count: parts.slice(1).join(' ') }
    }),
  },
  tags: {
    format: (items: string[]) => items.join('，'),
    parse: (value: string) => value.split(/[,，、\s]+/).map((item) => item.trim()).filter(Boolean).slice(0, 6),
  },
}

// ---------------------------------------------------------------------------
// AI 按人物填写
// ---------------------------------------------------------------------------

const clip = (value: string | undefined, max: number) => {
  const text = (value || '').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function buildOpeningTemplateFillPrompt(card: Pick<Character, 'name' | 'description' | 'personality' | 'scenario' | 'greeting'> & { tagline?: string }) {
  return `你是惟境的开场美化文案助手。要为角色“${card.name}”填写一个千禧年代 QQ空间风格的开场页面：一封信、人物档案、两条QQ消息、歌单、三条说说、好友印象。页面显示在开场白上方，开场白正文不要改、不要复述。

写作要求：
1. 全部用 ${card.name} 自己的口吻和视角写，贴合人设与开场局面；语气自然、有千禧年代的轻微中二和怀旧感，但不油腻。
2. 只写 ${card.name} 一方，绝对不替{{user}}说话、行动、表态或回复；称呼对方统一写 {{user}}。不要擅自确认恋爱关系，不剧透角色此时不知道的事。
3. 简短：信 3—5 句；每条消息不超过 30 字；每条说说不超过 40 字；好友印象 4—6 个，每个 2—4 字。
4. 歌名可以是真实老歌，也可以是角色私藏的歌名；不要编造歌词。
5. comment 是“某位好友：一句话”的格式，好友名用角色世界里的人或网名，不能是{{user}}。

角色资料：
- 姓名：${card.name}
- 简介：${clip(card.tagline, 80) || '无'}
- 描述：${clip(card.description, 1800)}
- 性格：${clip(card.personality, 1000) || '无'}
- 场景：${clip(card.scenario, 800) || '无'}
- 开场白（只用来对齐局面）：${clip(card.greeting, 800)}

只输出一个 JSON 对象，不要代码围栏和解释：
{"pronoun":"他 或 她 或 TA","letter":"写给{{user}}的信","englishName":"英文名或英文副标题","age":"年龄","personality":"性格四字或一句","intro":"两三句人物简介","signature":"QQ签名","notice":"空间公告","mood":"今日心情","chats":[{"time":"20:06","text":"..."},{"time":"20:08","text":"..."}],"songs":[{"title":"歌名","artist":"歌手"}],"musicDiary":"音乐日记一两句","posts":[{"time":"08.16 22:13","text":"说说","likes":12,"comment":"好友名：评论"}],"albumCaption":"相册一句话","friendGroups":[{"name":"分组名","count":"3/12"}],"friendTags":["印象1","印象2"]}
songs 正好 5 首，posts 正好 3 条，chats 1—2 条，friendGroups 3—4 个。`
}

export function parseOpeningTemplateFill(raw: string): OpeningTemplateData {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型没有返回可识别的模板内容，请重试或换一个模型。')
  let value: unknown
  try { value = JSON.parse(cleaned.slice(start, end + 1)) } catch { throw new Error('模型返回的模板内容不完整，请重试。') }
  const data = normalizeOpeningData(value)
  if (!data.letter && !data.intro && !data.posts.length) throw new Error('模型返回的模板内容是空的，请重试。')
  return data
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

/** 只有主聊天第一条角色开场白、且卡片启用了模板时才渲染。 */
export function openingTemplateHtmlFor(character: Pick<Character, 'name' | 'avatar' | 'openingTemplate'>, userName: string, options: { opening: boolean; role: 'user' | 'assistant' }) {
  if (!options.opening || options.role !== 'assistant') return ''
  const template = normalizeOpeningTemplate(character.openingTemplate)
  return template ? renderOpeningTemplate(template, character, userName) : ''
}

export function escapeOpeningHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 只允许 data:image 和 https 图片，其他（javascript:、blob: 等）一律不用。 */
export function safeOpeningImage(value: unknown) {
  if (typeof value !== 'string') return ''
  const url = value.trim()
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(url)) return url
  if (/^https:\/\/[^\s"'<>()\\]+$/i.test(url)) return url
  return ''
}

const DEFAULT_TEXT = {
  letter: '有些话，打字太快，说出口又太慢。\n所以写成一封信，放在你会看见的地方。\n拆开它，故事就开始了。',
  intro: '在这里写下人物的样子、来处和此刻的心事。',
  notice: '欢迎光临，脚印留下，悄悄话也可以。',
  mood: '今天也在等一条消息。',
  musicDiary: '有些歌只在某个夜晚好听。',
  albumCaption: '某个没说出口的下午。',
}

export function renderOpeningTemplate(template: OpeningTemplate, card: Pick<Character, 'name' | 'avatar'>, userName = '你', options: { reducedMotion?: boolean } = {}) {
  const theme = normalizeOpeningTheme(template.theme)
  const data = normalizeOpeningData(template.data)
  const macro = (value: string) => value.split('{{user}}').join(userName || '你').split('{{char}}').join(card.name)
  const t = (value: string) => escapeOpeningHtml(macro(value))
  const multiline = (value: string) => t(value).replace(/\n/g, '<br>')
  const name = escapeOpeningHtml(card.name || '未命名')
  const user = escapeOpeningHtml(userName || '你')
  const he = escapeOpeningHtml(data.pronoun)
  const avatar = safeOpeningImage(card.avatar)
  const avatarImg = (className: string) => avatar
    ? `<img class="${className}" src="${escapeOpeningHtml(avatar)}" alt="">`
    : `<div class="${className} op-noimg">${name.slice(0, 1) || '✧'}</div>`

  const chats = data.chats.length ? data.chats : [{ time: '20:06', text: '在吗？' }]
  const songs = data.songs.length ? data.songs : [{ title: '未命名的歌', artist: '' }]
  const posts = data.posts.length ? data.posts : [{ time: '', text: DEFAULT_TEXT.mood, likes: 0, comment: '' }]
  const vars = OPENING_THEME_KEYS.map((key) => `--op-${key}:${theme[key]}`).join(';')

  const css = `
:root{${vars}}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:transparent}
body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:var(--op-ink);font-size:14px;line-height:1.7;-webkit-text-size-adjust:100%}
.op{max-width:440px;margin:0 auto;padding:14px 10px 18px;border-radius:18px;background:var(--op-bg);background-image:radial-gradient(color-mix(in srgb,var(--op-paper) 55%,transparent) 1.2px,transparent 1.3px);background-size:14px 14px;overflow:hidden}
.op-kicker{font:600 10px/1.4 Georgia,serif;letter-spacing:.32em;text-transform:uppercase;color:var(--op-primary);text-align:center;margin:2px 0 10px}
.op-win{background:var(--op-paper);border:1.5px solid var(--op-ink);border-radius:8px;box-shadow:3px 3px 0 color-mix(in srgb,var(--op-ink) 75%,transparent);margin:0 0 14px;overflow:hidden}
.op-bar{display:flex;align-items:center;gap:6px;padding:4px 8px;background:linear-gradient(90deg,var(--op-primary),var(--op-secondary));color:var(--op-paper);font:700 10.5px/1.6 'Courier New',monospace;letter-spacing:.08em;border-bottom:1.5px solid var(--op-ink)}
.op-bar b{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.op-dots{display:flex;gap:4px}.op-dots i{width:8px;height:8px;border-radius:50%;background:var(--op-paper);border:1px solid var(--op-ink)}
.op-body{padding:12px 14px}
button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.op-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border:1.5px solid var(--op-ink);border-radius:999px;background:var(--op-primary);color:var(--op-paper);font-weight:700;font-size:13px;box-shadow:2px 2px 0 var(--op-ink)}
.op-btn:active{transform:translate(1px,1px);box-shadow:1px 1px 0 var(--op-ink)}
.op-center{text-align:center}
.op-tip{font-size:11px;color:color-mix(in srgb,var(--op-ink) 60%,transparent);text-align:center;margin:8px 0 0}
/* 1 信封 */
.op-env{position:relative;display:block;width:100%;max-width:330px;margin:4px auto 0;padding:0;border:0;background:none;aspect-ratio:1.45/1}
.op-env-back{position:absolute;inset:18% 0 0;border:1.5px solid var(--op-ink);border-radius:6px;background:color-mix(in srgb,var(--op-primary) 30%,var(--op-paper))}
.op-env-flap{position:absolute;left:0;right:0;top:18%;height:52%;clip-path:polygon(0 0,100% 0,50% 100%);background:color-mix(in srgb,var(--op-primary) 55%,var(--op-paper));transform-origin:top;transition:transform .5s ease}
.op-env-seal{position:absolute;left:50%;top:58%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:var(--op-primary);border:1.5px solid var(--op-ink);color:var(--op-paper);display:flex;align-items:center;justify-content:center;font-size:16px;transition:opacity .3s}
.op-env-label{position:absolute;left:0;right:0;bottom:12%;font:italic 13px Georgia,serif;color:var(--op-ink)}
.op.is-open .op-env-flap{transform:scaleY(-.32)}
.op.is-open .op-env-seal{opacity:0}
.op.is-read .op-env{display:none}
.op.is-in [data-act=enter]{display:none}
.op.is-in .op-letter .op-center{display:none}
.op-letter{display:none;margin:12px 4px 0;padding:14px 16px 12px;border:1.5px solid var(--op-ink);border-radius:4px;background:var(--op-paper);background-image:repeating-linear-gradient(transparent 0 25px,color-mix(in srgb,var(--op-secondary) 45%,transparent) 25px 26px);line-height:26px;animation:op-rise .45s ease both}
.op.is-open .op-letter{display:block}
.op-letter small{font:italic 12px Georgia,serif;color:color-mix(in srgb,var(--op-ink) 65%,transparent)}
.op-letter h3{margin:0 0 2px;font-size:15px;color:var(--op-primary)}
.op-letter p{margin:0;word-break:break-word}
.op-letter .op-sign{text-align:right;font:italic 12px Georgia,serif;margin-top:6px}
.op-letter .op-center{margin-top:12px;line-height:1.7}
.op-rest{display:none}
.op.is-in .op-rest{display:block;animation:op-rise .45s ease both}
/* 2 档案 */
.op-profile{display:grid;grid-template-columns:1fr 112px;gap:12px;align-items:start}
.op-profile h2{margin:0;font-size:22px;line-height:1.25;word-break:break-word}
.op-en{font:italic 14px Georgia,serif;color:var(--op-primary);margin:2px 0 8px;word-break:break-word}
.op-meta{margin:0;padding:0;list-style:none;font-size:12.5px}
.op-meta li{padding:2px 0;border-bottom:1px dashed color-mix(in srgb,var(--op-ink) 25%,transparent);word-break:break-word}
.op-meta span{color:var(--op-primary);font-weight:700;margin-right:4px}
.op-photo{width:112px;height:140px;object-fit:cover;border:1.5px solid var(--op-ink);border-radius:4px;background:var(--op-secondary);display:block;transform:rotate(2deg);box-shadow:3px 3px 0 var(--op-primary)}
.op-noimg{display:flex;align-items:center;justify-content:center;font-size:28px;color:var(--op-paper)}
.op-intro{grid-column:1/-1;margin:2px 0 0;font-size:13px;word-break:break-word}
/* 3 播放器 + 消息 */
.op-player{display:flex;gap:12px;align-items:center}
.op-eq{flex:1;height:46px;display:flex;align-items:flex-end;gap:3px;padding:6px;border:1.5px solid var(--op-ink);border-radius:6px;background:var(--op-ink)}
.op-eq i{flex:1;height:30%;border-radius:2px 2px 0 0;background:linear-gradient(to top,var(--op-primary),var(--op-accent));animation:op-eq 1s ease-in-out infinite alternate;animation-play-state:paused}
.op.is-playing .op-eq i{animation-play-state:running}
.op-eq i:nth-child(2n){animation-duration:.7s}.op-eq i:nth-child(3n){animation-duration:1.25s}.op-eq i:nth-child(4n){animation-duration:.85s}
.op-play{width:44px;height:44px;flex:none;border-radius:50%;border:1.5px solid var(--op-ink);background:var(--op-accent);font-size:15px;box-shadow:2px 2px 0 var(--op-ink)}
.op-now{font-size:12px;margin:8px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.op-qq-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.op-qq-head .op-ava{width:34px;height:34px;border-radius:6px;object-fit:cover;border:1.5px solid var(--op-ink);background:var(--op-secondary);font-size:15px}
.op-qq-head b{display:block;font-size:13px;line-height:1.3}
.op-qq-head small{font-size:11px;color:color-mix(in srgb,var(--op-ink) 60%,transparent)}
.op-bubble{margin:0 0 8px 42px;padding:7px 11px;border:1.5px solid var(--op-ink);border-radius:4px 14px 14px 14px;background:color-mix(in srgb,var(--op-primary) 16%,var(--op-paper));font-size:13px;word-break:break-word}
.op-bubble time{display:block;font-size:10px;color:color-mix(in srgb,var(--op-ink) 55%,transparent);line-height:1.4}
.op-song{display:flex;align-items:center;gap:10px;margin:0 0 4px 42px;padding:7px 10px;border:1.5px dashed var(--op-ink);border-radius:8px;background:var(--op-paper)}
.op-song span{width:30px;height:30px;flex:none;border-radius:6px;background:linear-gradient(135deg,var(--op-primary),var(--op-secondary));color:var(--op-paper);display:flex;align-items:center;justify-content:center}
.op-song b{display:block;font-size:12.5px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.op-song small{font-size:10.5px;color:color-mix(in srgb,var(--op-ink) 60%,transparent)}
.op-song div{min-width:0}
/* 4 QQ空间 */
.op-zone{display:none}
.op.is-zone .op-zone{display:block;animation:op-rise .35s ease both}
.op.is-zone .op-zone-open{display:none}
.op-close{border:1.5px solid var(--op-ink);border-radius:4px;background:var(--op-paper);color:var(--op-ink);font:700 10px/1.5 'Courier New',monospace;padding:1px 7px}
.op-zone-title{margin:0;padding:14px 12px 10px;background:linear-gradient(120deg,color-mix(in srgb,var(--op-primary) 35%,var(--op-paper)),color-mix(in srgb,var(--op-secondary) 45%,var(--op-paper)));border-bottom:1.5px solid var(--op-ink)}
.op-zone-title strong{display:block;font:italic 700 21px/1.2 Georgia,serif;color:var(--op-ink);word-break:break-word}
.op-zone-title small{font-size:11px}
.op-tabs{display:flex;overflow-x:auto;border-bottom:1.5px solid var(--op-ink);background:var(--op-paper);scrollbar-width:none}
.op-tabs::-webkit-scrollbar{display:none}
.op-tabs button{flex:1 0 auto;padding:7px 12px;border:0;border-right:1px solid color-mix(in srgb,var(--op-ink) 25%,transparent);background:none;font-size:12.5px;white-space:nowrap}
.op-tabs button[aria-selected=true]{background:var(--op-primary);color:var(--op-paper);font-weight:700}
.op-pane{display:none;padding:12px}
.op-pane.is-on{display:block}
.op-box{margin:0 0 10px;padding:9px 11px;border:1.5px solid var(--op-ink);border-radius:6px;background:color-mix(in srgb,var(--op-accent) 35%,var(--op-paper));word-break:break-word}
.op-box.alt{background:color-mix(in srgb,var(--op-secondary) 28%,var(--op-paper))}
.op-box h4{margin:0 0 3px;font-size:12.5px;color:var(--op-primary)}
.op-box p{margin:0;font-size:13px}
.op-me{display:flex;gap:10px;align-items:center;margin-bottom:10px}
.op-me .op-ava{width:52px;height:52px;border-radius:8px;object-fit:cover;border:1.5px solid var(--op-ink);background:var(--op-secondary);font-size:20px}
.op-me b{display:block}.op-me small{font-size:11.5px;word-break:break-word}
.op-post{margin:0 0 10px;padding:9px 11px;border:1.5px solid var(--op-ink);border-radius:6px;background:var(--op-paper)}
.op-post header{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:color-mix(in srgb,var(--op-ink) 60%,transparent)}
.op-post header b{color:var(--op-primary)}
.op-post p{margin:4px 0;font-size:13px;word-break:break-word}
.op-post footer{font-size:11px;display:flex;gap:12px;align-items:center}
.op-like{border:0;background:none;padding:0;font-size:11px}
.op-like em{font-style:normal}
.op-like.is-on{color:var(--op-primary);font-weight:700}
.op-cmt{margin-top:6px;padding:5px 8px;border-radius:4px;background:color-mix(in srgb,var(--op-secondary) 25%,var(--op-paper));font-size:11.5px;word-break:break-word}
.op-album{display:grid;grid-template-columns:1.4fr 1fr;gap:8px}
.op-album .op-big{width:100%;aspect-ratio:3/4;object-fit:cover;border:1.5px solid var(--op-ink);border-radius:4px;background:var(--op-secondary);font-size:36px}
.op-lock{display:grid;gap:8px}
.op-lock div{border:1.5px dashed var(--op-ink);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;text-align:center;padding:6px;background:color-mix(in srgb,var(--op-primary) 12%,var(--op-paper));color:color-mix(in srgb,var(--op-ink) 70%,transparent)}
.op-cap{grid-column:1/-1;font-size:12px;margin:0}
.op-songs{margin:0 0 10px;padding:0;list-style:none;counter-reset:s}
.op-songs li{display:flex;gap:8px;padding:5px 2px;border-bottom:1px dashed color-mix(in srgb,var(--op-ink) 25%,transparent);font-size:13px;counter-increment:s;min-width:0}
.op-songs li:before{content:counter(s,decimal-leading-zero);font:700 11px/1.9 'Courier New',monospace;color:var(--op-primary)}
.op-songs li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.op-songs li small{color:color-mix(in srgb,var(--op-ink) 55%,transparent);white-space:nowrap}
.op-groups{margin:0;padding:0;list-style:none;font-size:13px}
.op-groups li{display:flex;justify-content:space-between;padding:3px 0}
.op-tags{display:flex;flex-wrap:wrap;gap:6px}
.op-tags span{padding:2px 9px;border:1.5px solid var(--op-ink);border-radius:999px;background:var(--op-paper);font-size:12px}
.op-tags span:nth-child(3n+1){background:color-mix(in srgb,var(--op-primary) 25%,var(--op-paper))}
.op-tags span:nth-child(3n+2){background:color-mix(in srgb,var(--op-accent) 55%,var(--op-paper))}
.op-tags span:nth-child(3n){background:color-mix(in srgb,var(--op-secondary) 40%,var(--op-paper))}
.op-end{text-align:center;font:600 10px/1.4 Georgia,serif;letter-spacing:.3em;color:var(--op-primary);margin:4px 0 0}
@keyframes op-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes op-eq{from{height:18%}to{height:96%}}
@media (prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}.op-eq i{height:55%}}
${options.reducedMotion ? '*,*:before,*:after{animation:none!important;transition:none!important}' : ''}
@media (max-width:340px){.op-profile{grid-template-columns:1fr 92px}.op-photo{width:92px;height:118px}}
`

  const bars = Array.from({ length: 14 }, () => '<i></i>').join('')
  const tabs: Array<[string, string]> = [['home', '首页'], ['posts', '说说'], ['album', '相册'], ['songs', '歌单'], ['friends', '好友']]

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>
<div class="op" id="op">
<div class="op-kicker">✧ a letter · from 2000 ✧</div>
<section class="op-win">
<div class="op-bar"><span class="op-dots"><i></i><i></i></span><b>♡ letter_for_${user}.txt</b></div>
<div class="op-body">
<button type="button" class="op-env" data-act="open" aria-label="拆开信封"><span class="op-env-back"></span><span class="op-env-flap"></span><span class="op-env-seal">♡</span><span class="op-env-label">To my dearest</span></button>
<div class="op-tip op-env-tip">点一下信封 · 拆开这封信</div>
<div class="op-letter" aria-live="polite">
<small>To my dearest,</small>
<h3>亲爱的${user}：</h3>
<p>${multiline(data.letter || DEFAULT_TEXT.letter)}</p>
<div class="op-sign">— ${name}</div>
<div class="op-center"><button type="button" class="op-btn" data-act="enter">进入故事 ↘</button></div>
</div>
</div>
</section>
<div class="op-rest">
<section class="op-win">
<div class="op-bar"><span class="op-dots"><i></i><i></i></span><b>01 / CHARACTER FILE</b></div>
<div class="op-body op-profile">
<div>
<h2>${name}</h2>
<div class="op-en">${t(data.englishName || 'Your Name')}</div>
<ul class="op-meta">
${data.age ? `<li><span>年龄</span>${t(data.age)}</li>` : ''}
${data.personality ? `<li><span>性格</span>${t(data.personality)}</li>` : ''}
${data.signature ? `<li><span>签名</span>${t(data.signature)}</li>` : ''}
</ul>
</div>
${avatarImg('op-photo')}
<p class="op-intro">${multiline(data.intro || DEFAULT_TEXT.intro)}</p>
</div>
</section>
<section class="op-win">
<div class="op-bar"><span class="op-dots"><i></i><i></i></span><b>02 / MINI PLAYER · QQ MESSAGE</b></div>
<div class="op-body">
<div class="op-player"><div class="op-eq" aria-hidden="true">${bars}</div><button type="button" class="op-play" data-act="play" aria-label="播放/暂停">▶</button></div>
<div class="op-now">♪ ${t(songs[0].title)}${songs[0].artist ? ` · ${t(songs[0].artist)}` : ''}</div>
<div style="height:12px"></div>
<div class="op-qq-head">${avatarImg('op-ava')}<div><b>${name} ♡</b><small>在线 · ${chats.length} 条新消息</small></div></div>
${chats.map((chat) => `<div class="op-bubble">${chat.time ? `<time>${t(chat.time)}</time>` : ''}${t(chat.text)}</div>`).join('')}
<div class="op-song"><span>♫</span><div><b>${t(songs[0].title)}</b><small>${songs[0].artist ? t(songs[0].artist) : '私人歌单'} · 分享给你</small></div></div>
<div class="op-center op-zone-open" style="margin-top:14px"><button type="button" class="op-btn" data-act="zone">进入${he}的QQ空间 ↗</button></div>
</div>
</section>
<section class="op-win op-zone">
<div class="op-bar"><span class="op-dots"><i></i><i></i></span><b>MY QQ SPACE · 2000</b><button type="button" class="op-close" data-act="close">× CLOSE</button></div>
<div class="op-zone-title"><strong>${name}'s little world</strong><small>欢迎来到${he}的小空间 ♡</small></div>
<div class="op-tabs" role="tablist">${tabs.map(([id, label], index) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${index === 0}">${label}</button>`).join('')}</div>
<div class="op-pane is-on" data-pane="home">
<div class="op-me">${avatarImg('op-ava')}<div><b>${name}</b><small>签名：${t(data.signature || DEFAULT_TEXT.mood)}</small></div></div>
<div class="op-box"><h4>◆ 主人公告</h4><p>${multiline(data.notice || DEFAULT_TEXT.notice)}</p></div>
<div class="op-box alt"><h4>♡ 今日心情</h4><p>${multiline(data.mood || DEFAULT_TEXT.mood)}</p></div>
</div>
<div class="op-pane" data-pane="posts">
${posts.map((post) => `<article class="op-post"><header><b>${name}</b><span>${t(post.time)}</span></header><p>${multiline(post.text)}</p><footer><button type="button" class="op-like" data-act="like" data-n="${post.likes}">♡ <em>${post.likes}</em> 人觉得很赞</button><span>评论 ${post.comment ? 1 : 0}</span></footer>${post.comment ? `<div class="op-cmt">${t(post.comment)}</div>` : ''}</article>`).join('')}
</div>
<div class="op-pane" data-pane="album">
<div class="op-album">${avatarImg('op-big')}<div class="op-lock"><div>✧ 私密相册<br>仅主人可见</div><div>照片 02<br>还没洗出来</div></div><p class="op-cap">照片 01：${t(data.albumCaption || DEFAULT_TEXT.albumCaption)}</p></div>
</div>
<div class="op-pane" data-pane="songs">
<ol class="op-songs">${songs.map((song) => `<li><span>${t(song.title)}</span>${song.artist ? `<small>${t(song.artist)}</small>` : ''}</li>`).join('')}</ol>
<div class="op-box"><h4>✎ 音乐日记</h4><p>${multiline(data.musicDiary || DEFAULT_TEXT.musicDiary)}</p></div>
</div>
<div class="op-pane" data-pane="friends">
<div class="op-box alt"><h4>◆ 好友分组</h4><ul class="op-groups">${(data.friendGroups.length ? data.friendGroups : [{ name: '我的好友', count: '' }, { name: '特别的人', count: '1/1' }]).map((group) => `<li><span>${t(group.name)}</span><span>${t(group.count)}</span></li>`).join('')}</ul></div>
<div class="op-box"><h4>✿ 好友印象</h4><div class="op-tags">${(data.friendTags.length ? data.friendTags : ['神秘', '嘴硬']).map((tag) => `<span>${t(tag)}</span>`).join('')}</div></div>
</div>
</section>
<div class="op-end">— the story begins below —</div>
</div>
</div>
<script>(()=>{const root=document.getElementById('op');root.addEventListener('click',(e)=>{const el=e.target.closest('[data-act],[data-tab]');if(!el)return;if(el.dataset.tab){root.querySelectorAll('[data-tab]').forEach((b)=>b.setAttribute('aria-selected',String(b===el)));root.querySelectorAll('[data-pane]').forEach((p)=>p.classList.toggle('is-on',p.dataset.pane===el.dataset.tab));return}const act=el.dataset.act;if(act==='open'){if(root.classList.contains('is-open'))return;root.classList.add('is-open');const tip=root.querySelector('.op-env-tip');if(tip)tip.remove();const calm=matchMedia('(prefers-reduced-motion: reduce)').matches;setTimeout(()=>root.classList.add('is-read'),calm?0:520)}else if(act==='enter'){root.classList.add('is-in')}else if(act==='play'){const on=root.classList.toggle('is-playing');el.textContent=on?'❚❚':'▶'}else if(act==='zone'){root.classList.add('is-zone')}else if(act==='close'){root.classList.remove('is-zone')}else if(act==='like'){const on=el.classList.toggle('is-on');const n=Number(el.dataset.n)||0;const em=el.querySelector('em');if(em)em.textContent=String(on?n+1:n);el.firstChild.textContent=on?'♥ ':'♡ '}})})();</script>
</body></html>`
  return html
}
