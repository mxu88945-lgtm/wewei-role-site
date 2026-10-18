import type { ChatImage } from './chatImages'
import type { PointsState } from './phonePoints'
import { addPoints, dayKey } from './phonePoints'
import { durableGet, durableSet } from './persistentStore'

export const PHONE_DIARY_KEY = 'weijing.phoneDiary'
export const PHONE_DIARY_EVENT = 'weijing-phone-diary'
export const DIARY_UNLOCK_COST = 5

export type DiaryEntry = {
  id: string
  title: string
  body: string
  images?: ChatImage[]
  createdAt: number
  updatedAt: number
  unlockedBy: string[]
}

export type OnlineMood = { characterId: string; text: string; day: string; updatedAt: number }
export type PhoneDiaryState = { entries: DiaryEntry[]; moods: Record<string, OnlineMood> }
export const EMPTY_PHONE_DIARY: PhoneDiaryState = { entries: [], moods: {} }
let diaryCache: PhoneDiaryState = EMPTY_PHONE_DIARY

const normalizeDiary = (stored: Partial<PhoneDiaryState> | null | undefined): PhoneDiaryState => ({
  entries: Array.isArray(stored?.entries) ? stored.entries : [],
  moods: stored?.moods && typeof stored.moods === 'object' ? stored.moods : {},
})

export function readPhoneDiary(): PhoneDiaryState {
  try {
    const stored = JSON.parse(localStorage.getItem(PHONE_DIARY_KEY) || 'null') as Partial<PhoneDiaryState> | null
    if (stored) diaryCache = normalizeDiary(stored)
  } catch { /* use the in-memory/durable copy */ }
  return diaryCache
}

/** Loads the image-capable IndexedDB copy and migrates the earlier localStorage version once. */
export async function hydratePhoneDiary() {
  let legacy: PhoneDiaryState | undefined
  try {
    const raw = localStorage.getItem(PHONE_DIARY_KEY)
    if (raw) legacy = normalizeDiary(JSON.parse(raw) as Partial<PhoneDiaryState>)
  } catch { /* ignore an unreadable legacy copy */ }
  const stored = await durableGet<PhoneDiaryState>(PHONE_DIARY_KEY).catch(() => undefined)
  diaryCache = stored ? normalizeDiary(stored) : legacy || diaryCache
  if (!stored && legacy) await durableSet(PHONE_DIARY_KEY, diaryCache)
  if (legacy) { try { localStorage.removeItem(PHONE_DIARY_KEY) } catch { /* durable copy is authoritative */ } }
  window.dispatchEvent(new Event(PHONE_DIARY_EVENT))
  return diaryCache
}

export function writePhoneDiary(state: PhoneDiaryState) {
  diaryCache = { entries: state.entries.slice(0, 300), moods: state.moods }
  void durableSet(PHONE_DIARY_KEY, diaryCache)
  window.dispatchEvent(new Event(PHONE_DIARY_EVENT))
}

export const currentMood = (state: PhoneDiaryState, characterId: string, at = Date.now()) => {
  const mood = state.moods[characterId]
  return mood?.day === dayKey(at) ? mood : undefined
}

export function setOnlineMood(state: PhoneDiaryState, characterId: string, text: string, at = Date.now()): PhoneDiaryState {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 32)
  if (!clean) return state
  return { ...state, moods: { ...state.moods, [characterId]: { characterId, text: clean, day: dayKey(at), updatedAt: at } } }
}

const clip = (value: string, max: number) => value.length > max ? `${value.slice(0, max)}…` : value

/** Only this speaker's purchased diary bodies are included. Locked entries expose title/date, never body. */
export function buildPhoneDiaryNote(state: PhoneDiaryState, points: PointsState, speaker: { id: string; name: string }, people: Array<{ id: string; name: string }>, userName: string, at = Date.now()) {
  const locked = state.entries.filter((entry) => !entry.unlockedBy.includes(speaker.id)).slice(0, 8)
  const unlocked = state.entries.filter((entry) => entry.unlockedBy.includes(speaker.id)).slice(0, 6)
  const moods = people.flatMap((person) => {
    const mood = currentMood(state, person.id, at)
    return mood ? [`${person.name}：${mood.text}`] : []
  })
  const ownMood = currentMood(state, speaker.id, at)
  return `【在线心情与${userName}的私人日记】
${moods.length ? `今天的在线心情：${moods.join('；')}。` : '今天暂时还没人写在线心情。'}
${ownMood ? `你今天的在线心情是「${ownMood.text}」，今天不用重复修改。` : '你今天还没写在线心情。愿意设置时，在本次正常回复最后另起一行写【在线心情：一句自定义心情】，最多 20 字；系统会保存并展示。不要为了设心情硬写。'}
${locked.length ? `你还没解锁的私人日记（只能看到标题）：\n${locked.map((entry) => `- ${entry.id}｜《${clip(entry.title, 24)}》`).join('\n')}\n你有 ${points.balances[speaker.id] || 0} 积分。真想看某篇时，在正常回复最后写【解锁日记：日记ID】，每篇会从你个人积分扣 ${DIARY_UNLOCK_COST} 分；积分不足就别装阔。解锁本轮只完成购买，下次说话才会看到正文。` : '目前没有你尚未解锁的日记。'}
${unlocked.length ? `你已付费解锁、可以知道的日记正文（只属于你的阅读权限）：\n${unlocked.map((entry) => `《${clip(entry.title, 30)}》${entry.images?.length ? `（配图 ${entry.images.length} 张；最新一篇的图片会作为视觉参考附给你）` : ''}\n${clip(entry.body, 600) || '（无文字）'}`).join('\n\n')}` : '你还没有解锁过日记正文。'}
日记是${userName}的私人文字。未解锁正文绝不猜测、编造或声称偷看过；也不要把你解锁到的正文原样转发给别人。`
}

/** Only the newest pictured diary this speaker personally unlocked can be attached to the model. */
export function unlockedDiaryImageContext(state: PhoneDiaryState, speakerId: string, max = 4) {
  const entry = state.entries.find((item) => item.unlockedBy.includes(speakerId) && item.images?.length)
  return entry?.images?.length ? { title: entry.title, images: entry.images.slice(0, max) } : undefined
}

const MOOD_TAG = /[【[]\s*在线心情\s*[：:]\s*([^】\]]{1,40})[】\]]/g
const UNLOCK_TAG = /[【[]\s*解锁日记\s*[：:]\s*([^】\]]{1,80})[】\]]/g

export function applyPhoneDiaryTags(state: PhoneDiaryState, points: PointsState, speakerId: string, text: string, at = Date.now()) {
  let nextState = state
  let nextPoints = points
  let changed = false
  let output = text.replace(MOOD_TAG, (_all, raw: string) => {
    const mood = raw.replace(/\s+/g, ' ').trim().slice(0, 32)
    if (!mood) return ''
    nextState = setOnlineMood(nextState, speakerId, mood, at)
    changed = true
    return `💭 在线心情：${mood}`
  })
  output = output.replace(UNLOCK_TAG, (_all, raw: string) => {
    const key = raw.trim()
    const index = nextState.entries.findIndex((entry) => entry.id === key || entry.title === key || `《${entry.title}》` === key)
    if (index < 0) return '🔒 解锁失败：没找到这篇日记'
    const entry = nextState.entries[index]
    if (entry.unlockedBy.includes(speakerId)) return `🔓 已经解锁过《${entry.title}》`
    const balance = nextPoints.balances[speakerId] || 0
    if (balance < DIARY_UNLOCK_COST) return `🔒 想看《${entry.title}》，但积分不够（${balance}/${DIARY_UNLOCK_COST}）`
    nextPoints = addPoints(nextPoints, speakerId, -DIARY_UNLOCK_COST, `解锁私人日记：《${entry.title}》`, at)
    const entries = [...nextState.entries]
    entries[index] = { ...entry, unlockedBy: [...entry.unlockedBy, speakerId] }
    nextState = { ...nextState, entries }
    changed = true
    return `🔓 花 ${DIARY_UNLOCK_COST} 积分解锁了《${entry.title}》`
  })
  return { state: nextState, points: nextPoints, text: output.replace(/\n{3,}/g, '\n\n').trim(), changed }
}

export function parseDailyMoods(raw: string) {
  const match = raw.replace(/```(?:json)?/g, '').match(/\{[\s\S]*\}/)
  if (!match) return []
  try {
    const value = JSON.parse(match[0]) as { moods?: unknown }
    if (!Array.isArray(value.moods)) return []
    return value.moods.flatMap((item) => {
      const mood = item as { id?: unknown; text?: unknown }
      return typeof mood.id === 'string' && typeof mood.text === 'string' && mood.text.trim()
        ? [{ id: mood.id, text: mood.text.replace(/\s+/g, ' ').trim().slice(0, 32) }]
        : []
    })
  } catch { return [] }
}
