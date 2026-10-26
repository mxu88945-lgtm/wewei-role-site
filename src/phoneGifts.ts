/**
 * 小手机礼物图鉴。和“整改小商店”完全分开：商店卖角色可申请的权限，
 * 礼物是用户与某个角色之间的心意记录，只按角色 id 归档。
 */
export const PHONE_GIFTS_KEY = 'weijing.phoneGifts'
export const PHONE_GIFTS_EVENT = 'weijing-phone-gifts'

export type PhoneGiftCategory = 'food' | 'flowers' | 'accessory' | 'daily' | 'experience' | 'handmade'

export type PhoneGiftItem = {
  id: string
  name: string
  subtitle: string
  icon: string
  category: PhoneGiftCategory
  heart: number
  colors: [string, string]
  diy?: boolean
}

export type PhoneGiftRecord = {
  id: string
  characterId: string
  giftId: string
  giftName: string
  giftIcon: string
  category: PhoneGiftCategory
  heart: number
  note?: string
  reaction?: string
  createdAt: number
  diy?: boolean
}

export type PhoneGiftState = { records: PhoneGiftRecord[] }

export const PHONE_GIFT_CATEGORIES: Array<{ id: 'all' | PhoneGiftCategory; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'food', label: '食物' },
  { id: 'flowers', label: '花束' },
  { id: 'accessory', label: '饰品' },
  { id: 'daily', label: '日常' },
  { id: 'experience', label: '体验' },
  { id: 'handmade', label: '手作' },
]

const gift = (id: string, name: string, subtitle: string, icon: string, category: PhoneGiftCategory, heart: number, colors: [string, string]): PhoneGiftItem => ({ id, name, subtitle, icon, category, heart, colors })

/** 原创轻量目录；静态目录升级不需要迁移已送出的历史记录。 */
export const PHONE_GIFT_CATALOG: PhoneGiftItem[] = [
  gift('warm-soup', '深夜热汤', '留一盏灯，也留一口热的', '🍲', 'food', 8, ['#fff2da', '#f3c98b']),
  gift('boba', '焦糖奶茶', '加双份珍珠，今天不讲道理', '🧋', 'food', 12, ['#f8e6d6', '#c99873']),
  gift('coffee', '手冲咖啡', '给还不肯休息的人', '☕️', 'food', 18, ['#ead9c8', '#aa7c5d']),
  gift('cake', '莓果小蛋糕', '奶油不多，偏心很多', '🍰', 'food', 28, ['#ffe5e8', '#f2a6b5']),
  gift('dinner', '烛光晚餐', '今晚只留一张对面的椅子', '🍷', 'food', 88, ['#f8e7df', '#b98072']),

  gift('daisy', '一把小雏菊', '像刚晒过太阳', '🌼', 'flowers', 15, ['#fff8cf', '#e8c85d']),
  gift('tulip', '奶油郁金香', '十一枝，刚好抱满怀', '🌷', 'flowers', 36, ['#fff1e1', '#eeb48d']),
  gift('rose', '深红玫瑰', '不是顺手，是特意', '🌹', 'flowers', 52, ['#f5d8dc', '#bb5966']),
  gift('blue-flower', '蓝色绣球', '把今天的坏情绪都包起来', '🪻', 'flowers', 66, ['#e3e9ff', '#889ad9']),

  gift('hairpin', '珍珠发夹', '看见时就觉得适合你', '🪞', 'accessory', 24, ['#fff8ec', '#d8c6a7']),
  gift('bracelet', '双结手绳', '一边系你，一边系我', '🧶', 'accessory', 48, ['#f7e5df', '#c98578']),
  gift('watch', '银色腕表', '想占住你每一分钟', '⌚️', 'accessory', 120, ['#e9edf2', '#9ca8b4']),
  gift('ring', '素圈戒指', '没有钻，也不是随便戴戴', '💍', 'accessory', 188, ['#f2efe9', '#b8aa98']),

  gift('hand-warmer', '口袋暖手宝', '冷的时候握紧一点', '🔥', 'daily', 20, ['#fff0df', '#ee9a65']),
  gift('mug', '刻字马克杯', '杯底藏着只有你知道的话', '🥛', 'daily', 35, ['#edf4f2', '#9dbdb5']),
  gift('pillow', '月亮抱枕', '不在的时候拿它垫着', '🌙', 'daily', 42, ['#e9e6f7', '#aaa1cd']),
  gift('scarf', '米色围巾', '绕两圈，别让风钻进去', '🧣', 'daily', 58, ['#f3eadb', '#c4a985']),
  gift('perfume', '木质香水', '尾调像雨后的旧书房', '🧴', 'daily', 108, ['#f3e5d2', '#a9825f']),

  gift('movie', '双人电影票', '最后一排，不许迟到', '🎞️', 'experience', 30, ['#e5e8ed', '#8995a6']),
  gift('night-drive', '夜间兜风', '不设目的地，开累了再回家', '🚘', 'experience', 60, ['#dfe5eb', '#65788c']),
  gift('aquarium', '水族馆约会', '去看蓝光落在你脸上', '🐋', 'experience', 75, ['#dff3f6', '#70adbd']),
  gift('weekend', '周末小旅行', '只带一只行李箱就走', '🧳', 'experience', 128, ['#e9f0df', '#91aa73']),

  gift('note', '手写便签', '字不漂亮，心意是真的', '📝', 'handmade', 10, ['#fff5dc', '#d8b873']),
  gift('origami', '折纸飞鸟', '折痕里藏了一句没说出口的话', '🕊️', 'handmade', 18, ['#e8f0f2', '#8db0b8']),
  gift('photo-book', '手作相册', '把零碎时刻一本本留下', '📔', 'handmade', 45, ['#f2e6dd', '#b48f77']),
  gift('letter', '火漆长信', '不适合在聊天框里草草说完', '💌', 'handmade', 55, ['#f5e1df', '#ba706c']),
]

const safeText = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''

export function normalizePhoneGiftState(value: unknown): PhoneGiftState {
  if (!value || typeof value !== 'object' || !Array.isArray((value as PhoneGiftState).records)) return { records: [] }
  const records = (value as PhoneGiftState).records.flatMap((raw): PhoneGiftRecord[] => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Partial<PhoneGiftRecord>
    const characterId = safeText(item.characterId, 160)
    const giftName = safeText(item.giftName, 40)
    const giftIcon = safeText(item.giftIcon, 8) || '🎁'
    if (!characterId || !giftName || !Number.isFinite(item.createdAt)) return []
    const categories: PhoneGiftCategory[] = ['food', 'flowers', 'accessory', 'daily', 'experience', 'handmade']
    const category = categories.includes(item.category as PhoneGiftCategory) ? item.category as PhoneGiftCategory : 'handmade'
    return [{
      id: safeText(item.id, 160) || `gift-${item.createdAt}`,
      characterId,
      giftId: safeText(item.giftId, 120) || 'legacy-gift',
      giftName,
      giftIcon,
      category,
      heart: Math.max(1, Math.min(999, Math.round(Number(item.heart) || 1))),
      note: safeText(item.note, 240) || undefined,
      reaction: safeText(item.reaction, 600) || undefined,
      createdAt: Number(item.createdAt),
      diy: Boolean(item.diy) || undefined,
    }]
  })
  return { records: records.slice(-500) }
}

export function readPhoneGifts(storage: Storage = localStorage): PhoneGiftState {
  try { return normalizePhoneGiftState(JSON.parse(storage.getItem(PHONE_GIFTS_KEY) || 'null')) } catch { return { records: [] } }
}

export function writePhoneGifts(state: PhoneGiftState, storage: Storage = localStorage) {
  storage.setItem(PHONE_GIFTS_KEY, JSON.stringify(normalizePhoneGiftState(state)))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PHONE_GIFTS_EVENT))
}

export function makeDiyGift(name: string, note: string, icon = '🎁'): PhoneGiftItem {
  const title = safeText(name, 24) || '亲手做的礼物'
  return {
    id: `diy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: title,
    subtitle: safeText(note, 40) || '只此一份',
    icon: safeText(icon, 8) || '🎁',
    category: 'handmade',
    heart: 36,
    colors: ['#fff0e2', '#d99e78'],
    diy: true,
  }
}

export function addPhoneGift(state: PhoneGiftState, characterId: string, item: PhoneGiftItem, note: string, at = Date.now()): { state: PhoneGiftState; record: PhoneGiftRecord } {
  const record: PhoneGiftRecord = {
    id: `gift-${at}-${Math.random().toString(36).slice(2, 7)}`,
    characterId,
    giftId: item.id,
    giftName: item.name,
    giftIcon: item.icon,
    category: item.category,
    heart: item.heart,
    note: safeText(note, 240) || undefined,
    createdAt: at,
    diy: item.diy || undefined,
  }
  return { record, state: { records: [...state.records, record].slice(-500) } }
}

export function setPhoneGiftReaction(state: PhoneGiftState, recordId: string, reaction: string): PhoneGiftState {
  const clean = safeText(reaction.replace(/<[^>]+>/g, ' '), 600)
  return { records: state.records.map((item) => item.id === recordId ? { ...item, reaction: clean || undefined } : item) }
}

export const phoneGiftsFor = (state: PhoneGiftState, characterId: string) => state.records.filter((item) => item.characterId === characterId).sort((a, b) => b.createdAt - a.createdAt)

export function phoneGiftMessage(userName: string, characterName: string, item: PhoneGiftItem, note: string) {
  return `🎁 礼物｜${userName}送给${characterName}「${item.name}」\n${item.subtitle}${note.trim() ? `\n附言：${note.trim().slice(0, 240)}` : ''}`
}

export function phoneGiftReactionPrompt(userName: string, item: PhoneGiftItem, note: string, publicGroup = false) {
  return `${userName}刚刚主动送给你一份礼物「${item.name}」（${item.subtitle}）${note.trim() ? `，附言是“${note.trim().slice(0, 240)}”` : ''}。这是刚发生的真实小手机事件。先按你的人设自然接住礼物并回应她，可以嘴硬、惊喜、吃醋或认真，但不要像客服报商品信息，不要替她补动作或心理；1—4 条像真人${publicGroup ? '群聊' : '私聊'}的消息。${publicGroup ? '礼物是当着群友的面公开送给你的，其他人都看得见；你可以在意他们的目光，但本轮只说你自己的话。' : ''}`
}

export function buildPhoneGiftMemoryNote(state: PhoneGiftState, characterId: string, userName: string, max = 8) {
  const rows = phoneGiftsFor(state, characterId).slice(0, max)
  if (!rows.length) return ''
  return `【你和${userName}的礼物记录｜只属于你】\n${rows.map((item) => `- ${new Date(item.createdAt).toLocaleDateString('zh-CN')}：${userName}送你${item.giftIcon}${item.giftName}${item.note ? `，附言“${item.note}”` : ''}`).join('\n')}\n这些是已经发生的共同经历。当前话题相关时可以自然记起，别逐条复述、别提“记录/系统/注入”。`
}
