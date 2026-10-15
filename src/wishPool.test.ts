import { describe, expect, it } from 'vitest'
import { addWishPoolLine, grantedWishLine, takeWishPoolTags, wishPoolEntry, wishPoolLines } from './wishPool'
import type { Character } from './characterCard'

const base = { id: 'c1', name: '顾荒', characterBook: { name: 'b', entries: [] } } as unknown as Character

describe('wish pool', () => {
  it('creates a constant worldbook entry and appends lines', () => {
    let card = addWishPoolLine(base, grantedWishLine({ itemName: '许愿瓶', note: '周末一起看海' }, '惟惟'), '惟惟', new Date(2026, 9, 15).getTime())
    card = addWishPoolLine(card, '续写：池底有一枚她的发卡', '惟惟')
    const entry = wishPoolEntry(card)!
    expect(entry.constant).toBe(true)
    expect(entry.enabled).toBe(true)
    expect(wishPoolLines(card)).toHaveLength(2)
    expect(wishPoolLines(card)[0]).toContain('惟惟答应了：许愿瓶「周末一起看海」')
    expect(card.characterBook!.entries).toHaveLength(1)
  })
  it('works on a card with no worldbook', () => {
    const card = addWishPoolLine({ ...base, characterBook: undefined }, 'x', '惟惟')
    expect(wishPoolLines(card)).toHaveLength(1)
  })
  it('parses pool tags from replies', () => {
    const out = takeWishPoolTags('好。\n【许愿池：池边种了一棵玉兰】')
    expect(out.lines).toEqual(['池边种了一棵玉兰'])
    expect(out.text).toContain('🫙 写进戏外许愿池：池边种了一棵玉兰')
    expect(out.text).not.toContain('【许愿池')
  })
})
