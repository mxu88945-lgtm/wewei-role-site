/**
 * 戏外许愿池：她在小商店答应过的愿望 + 角色自己续写的许愿池世界观。
 * 写进角色卡世界书（常驻条目），所以正经跑剧情时也带着；她可以在角色卡 → 世界书里改、删、关掉。
 */
import type { Character, WorldBookEntry } from './characterCard'

export const WISH_POOL_TITLE = '戏外许愿池'
const MAX_CHARS = 3000
const POOL_TAG = /[【[]\s*许愿池\s*[：:]\s*([^】\]]{1,160})[】\]]/g

const header = (name: string, userName: string) =>
  `【${WISH_POOL_TITLE}】这是${name}和${userName}戏外独有的许愿池：她答应过的愿望，和${name}自己续写的许愿池设定。跑剧情时${name}记得这些，可以自然提起、等待兑现、珍惜，但不能替${userName}做决定，也不要每条都提。`

export function wishPoolEntry(character: Character) {
  return (character.characterBook?.entries || []).find((entry) => entry.comment === WISH_POOL_TITLE)
}

export function wishPoolLines(character: Character) {
  const entry = wishPoolEntry(character)
  if (!entry) return []
  return entry.content.split('\n').slice(1).map((line) => line.trim()).filter(Boolean)
}

const stamp = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }

/** 往这张卡的许愿池追加一行；没有就新建常驻世界书条目。超长时挤掉最早的续写设定，答应过的愿望优先保留。 */
export function addWishPoolLine(character: Character, line: string, userName: string, at = Date.now()): Character {
  const clean = line.replace(/\s+/g, ' ').trim()
  if (!clean) return character
  const lines = [...wishPoolLines(character), `${stamp(at)} ${clean}`]
  while (lines.length > 1 && [header(character.name, userName), ...lines].join('\n').length > MAX_CHARS) {
    const drop = lines.findIndex((item) => item.includes('续写：'))
    lines.splice(drop >= 0 ? drop : 0, 1)
  }
  const content = [header(character.name, userName), ...lines].join('\n')
  const book = character.characterBook || { name: `${character.name}的世界书`, entries: [] }
  const existing = wishPoolEntry(character)
  const entries: WorldBookEntry[] = existing
    ? book.entries.map((entry) => entry === existing ? { ...entry, content } : entry)
    : [...book.entries, { id: Math.max(0, ...book.entries.map((entry) => Number(entry.id) || 0)) + 1, keys: [], secondary_keys: [], comment: WISH_POOL_TITLE, content, constant: true, selective: false, insertion_order: 90, enabled: true, position: 'after_char', use_regex: false, extensions: { position: 1, depth: 4, probability: 100, useProbability: true } }]
  return { ...character, characterBook: { ...book, entries } }
}

/** 小商店里她点了「答应」时写进去的那一行。 */
export function grantedWishLine(order: { itemName: string; note?: string; condition?: string; gift?: boolean }, userName: string) {
  return `${userName}${order.gift ? '送了' : '答应了'}：${order.itemName}${order.note ? `「${order.note}」` : ''}${order.condition ? `（条件：${order.condition}）` : ''}`
}

/** 角色回复里的【许愿池：…】标签：取出续写内容，换成看得见的小票。 */
export function takeWishPoolTags(text: string) {
  const lines: string[] = []
  const rest = text.replace(POOL_TAG, (_, body: string) => { lines.push(body.trim()); return '' }).replace(/\n{3,}/g, '\n\n').trim()
  return { lines, text: lines.length ? `${rest}\n${lines.map((line) => `🫙 写进戏外许愿池：${line}`).join('\n')}` : text }
}

/** 小手机里给模型看的许愿池提示。 */
export function wishPoolNote(character: Character, userName: string) {
  const lines = wishPoolLines(character)
  return `【${WISH_POOL_TITLE}】${lines.length ? `你和${userName}的许愿池里现在有：${lines.slice(-12).join('；')}。` : `你的许愿池还是空的，她答应你的愿望会自动放进来。`}想给许愿池添一条你自己的设定（比如池子长什么样、你偷偷埋下的约定），在消息最后单独一行写【许愿池：内容】，偶尔写，别每条都写，也不能写成她已经答应的事。`
}
