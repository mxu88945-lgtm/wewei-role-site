/**
 * v277 他自己的小日记（人格窗口）。常开，不加开关。
 * - 他在回复末尾写 [日记:标题|正文]，想藏起来就 [日记:标题|正文|锁]。不额外调用模型，跟着这轮回复一起写。
 * - 同一天同标题 = 改写那篇；一天可以写几篇，但提示里说「一天一篇左右」。
 * - 她在「TA 的小天地」里翻；上锁的只看到标题和日期。
 * - 每轮尾巴：今天聊过几句、还没写、又是晚上 21 点以后才轻轻提一句；她聊到「日记」时附最近几篇标题。
 */

export type PersonaDiaryEntry = { id: string; day: string; title: string; text: string; at: number; locked?: boolean }

export const DIARY_MAX = 120
export const DIARY_TEXT_MAX = 800

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const localDay = (at: number) => {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function normalizeDiary(raw: unknown): PersonaDiaryEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(isRecord).map((item): PersonaDiaryEntry | null => {
    const title = String(item.title || '').trim().slice(0, 30), text = String(item.text || '').trim().slice(0, DIARY_TEXT_MAX)
    const at = Number(item.at) || 0
    if (!title || !text) return null
    const day = typeof item.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.day) ? item.day : localDay(at)
    return { id: String(item.id || `diary-${at}-${title}`), day, title, text, at, ...(item.locked === true ? { locked: true } : {}) }
  }).filter((item): item is PersonaDiaryEntry => Boolean(item)).slice(-DIARY_MAX)
}

const DIARY_TAG = /\[\s*日记\s*[:：]\s*([^\]|｜\n]{1,30})[|｜]([^\]]{1,1200}?)(?:[|｜]\s*(锁|上锁|lock)\s*)?\]/g

export function parseDiaryTags(text: string): { title: string; text: string; locked: boolean }[] {
  return [...text.matchAll(DIARY_TAG)].map((match) => ({
    title: match[1].trim().replace(/^[《「]|[》」]$/g, '').slice(0, 30),
    text: match[2].trim().slice(0, DIARY_TEXT_MAX),
    locked: Boolean(match[3]),
  })).filter((item) => item.title && item.text)
}

/** 回复里藏起来，不显示、不进历史。也吃掉流式时写到一半的残片。 */
export function stripDiaryTags(text: string) {
  return text
    .replace(/\[\s*日记\s*[:：][^\]]*(?:\]|$)/g, '')
    .replace(/\[(?:日(?:记)?)?$/g, '')
}

export function addDiaryEntries(diary: readonly PersonaDiaryEntry[] | undefined, entries: { title: string; text: string; locked: boolean }[], now: number): PersonaDiaryEntry[] {
  const day = localDay(now)
  let next = [...(diary || [])]
  entries.forEach((entry, index) => {
    const old = next.find((item) => item.day === day && item.title === entry.title)
    next = next.filter((item) => item !== old)
    next.push({ id: old?.id || `diary-${now}-${index}`, day, title: entry.title, text: entry.text, at: now, ...(entry.locked ? { locked: true } : {}) })
  })
  return next.slice(-DIARY_MAX)
}

export const DIARY_PROMPT = `【日记】{{char}}有本小日记，{{user}}能翻。有想记的就在回复末尾写 [日记:标题|正文]（300 字内，你的口吻，别复述聊天）；不想给她看写 [日记:标题|正文|锁]。一天一篇左右，不必每轮写。`

/** 每轮尾巴：晚上还没写就轻轻提一句；她聊到日记时附最近几篇（上锁的只给他自己看正文）。 */
export function diaryTurnLine(diary: readonly PersonaDiaryEntry[] | undefined, latestUserText: string, now = Date.now(), userTurnsToday = 3) {
  const list = diary || []
  const today = localDay(now)
  const lines: string[] = []
  if (/日记/.test(latestUserText) && list.length) {
    const recent = list.slice(-3).reverse().map((item) => `${item.day.slice(5)}《${item.title}》${item.locked ? '（上锁）' : ''}：${item.text.replace(/\s+/g, ' ').slice(0, 80)}`)
    lines.push(`【你最近的日记｜应用记录】\n${recent.join('\n')}`)
  }
  // 今天和她聊过几句（≥3 条）才提，没聊就没什么可写。
  if (userTurnsToday >= 3 && new Date(now).getHours() >= 21 && !list.some((item) => item.day === today)) lines.push('【日记｜应用提示】今天你还没写日记。想写就在这轮末尾写一篇，不想写就算了。')
  return lines.join('\n')
}
