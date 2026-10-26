import { describe, expect, it } from 'vitest'
import { addPhoneGift, buildPhoneGiftMemoryNote, makeDiyGift, normalizePhoneGiftState, phoneGiftMessage, phoneGiftsFor, setPhoneGiftReaction, PHONE_GIFT_CATALOG } from './phoneGifts'

describe('phone gifts', () => {
  it('keeps gift history isolated by character id', () => {
    const first = addPhoneGift({ records: [] }, 'a', PHONE_GIFT_CATALOG[0], '给 A', 10)
    const second = addPhoneGift(first.state, 'b', PHONE_GIFT_CATALOG[1], '给 B', 20)
    expect(phoneGiftsFor(second.state, 'a').map((item) => item.note)).toEqual(['给 A'])
    expect(phoneGiftsFor(second.state, 'b').map((item) => item.note)).toEqual(['给 B'])
  })

  it('creates a bounded DIY item', () => {
    const item = makeDiyGift('很长很长的礼物名字'.repeat(8), '亲手做的', '🪵')
    expect(item.name.length).toBeLessThanOrEqual(24)
    expect(item.diy).toBe(true)
    expect(item.category).toBe('handmade')
  })

  it('stores a cleaned reaction on the matching record only', () => {
    const added = addPhoneGift({ records: [] }, 'a', PHONE_GIFT_CATALOG[0], '', 10)
    const next = setPhoneGiftReaction(added.state, added.record.id, '<b>喜欢</b>')
    expect(next.records[0].reaction).toBe('喜欢')
  })

  it('rejects malformed persisted rows', () => {
    expect(normalizePhoneGiftState({ records: [{ id: 'bad' }] }).records).toEqual([])
  })

  it('renders a visible gift message without hidden protocol tags', () => {
    const text = phoneGiftMessage('惟惟', '顾祁砚', PHONE_GIFT_CATALOG[0], '趁热喝')
    expect(text).toContain('🎁 礼物')
    expect(text).toContain('趁热喝')
    expect(text).not.toContain('[')
  })

  it('injects only the target character recent history', () => {
    const a = addPhoneGift({ records: [] }, 'a', PHONE_GIFT_CATALOG[0], 'A 的', 10)
    const b = addPhoneGift(a.state, 'b', PHONE_GIFT_CATALOG[1], 'B 的', 20)
    const note = buildPhoneGiftMemoryNote(b.state, 'a', '惟惟')
    expect(note).toContain('A 的')
    expect(note).not.toContain('B 的')
  })
})
