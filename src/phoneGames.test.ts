import { describe, expect, it } from 'vitest'
import { buildPhoneGameNote, nextPhoneGame, phoneGameSpeakers, phoneGameText, type PhoneGameRound } from './phoneGames'

const players = [{ id: 'user', name: '惟惟' }, { id: 'a', name: '甲' }, { id: 'b', name: '乙' }]
describe('phone group games', () => {
  it('deals all 54 cards without duplication, ranks jokers highest and never mutates players', () => {
    const many = Array.from({ length: 54 }, (_, i) => ({ id: `p${i}`, name: `玩家${i}` }))
    const round = nextPhoneGame({ kind: 'poker', players: many, random: () => 0 })
    expect(round.cards).toHaveLength(54)
    expect(new Set(round.cards?.map((card) => card.label)).size).toBe(54)
    expect(round.cards?.find((card) => card.label === '大王')?.rank).toBe(16)
    expect(round.winnerIds).toEqual(['p53'])
    expect(many[0]).toEqual({ id: 'p0', name: '玩家0' })
  })
  it('allows equal ranks to tie regardless of suit', () => {
    let call = 0
    const random = () => ++call === 3 ? 12 / 53 : 0
    const round = nextPhoneGame({ kind: 'poker', players: players.slice(1), random })
    expect(round.cards?.map((card) => card.label)).toEqual(['♣2', '♦2'])
    expect(round.winnerIds).toEqual(['a', 'b'])
    expect(phoneGameText(round)).toContain('甲、乙')
  })
  it('uses the selected truth/dare pool and avoids repeats until exhausted', () => {
    let previous: PhoneGameRound | undefined
    const seen = new Set<string>()
    for (let i = 0; i < 12; i++) {
      previous = nextPhoneGame({ kind: 'truth', players, truthMode: 'truth', previous, random: () => 0, now: i })
      expect(previous.task).toMatch(/^真心话：/)
      expect(seen.has(previous.taskId!)).toBe(false)
      seen.add(previous.taskId!)
    }
    const again = nextPhoneGame({ kind: 'truth', players, previous, random: () => 0 })
    expect(again.number).toBe(13)
    expect(again.taskId).toBe('truth-0')
    expect(nextPhoneGame({ kind: 'truth', players, truthMode: 'dare', random: () => 0 }).task).toMatch(/^大冒险：/)
  })
  it('accepts custom tasks and excludes them from the no-repeat builtin pool', () => {
    const round = nextPhoneGame({ kind: 'draw', players, customTask: '  给我起个昵称  ', random: () => .5 })
    expect(round.task).toBe('给我起个昵称')
    expect(round.usedTaskIds).toEqual([])
    expect(round.targetId).toBe('a')
    expect(phoneGameSpeakers(round, ['a', 'b', 'outsider'])).toEqual(['a'])
    expect(buildPhoneGameNote(round, 'a', '惟惟')).toContain('本轮抽中你')
  })
  it('does not speak for the user, summon outsiders, or send games into DMs', () => {
    const round = nextPhoneGame({ kind: 'draw', players, random: () => 0 })
    expect(round.targetId).toBe('user')
    expect(buildPhoneGameNote(round, 'a', '惟惟')).toContain('等她自己回答')
    expect(buildPhoneGameNote(round, 'a', '惟惟')).toContain('不要在私聊里继续')
    expect(phoneGameSpeakers(round, ['b', 'outsider'])).toEqual(['b'])
    const poker = nextPhoneGame({ kind: 'poker', players, random: () => 0 })
    expect(phoneGameSpeakers(poker, ['a', 'outsider'])).toEqual(['a'])
    expect(buildPhoneGameNote(undefined, 'a', '惟惟')).toBe('')
  })
  it('deduplicates participants, rejects invalid counts, and persists exact draws through JSON', () => {
    expect(() => nextPhoneGame({ kind: 'draw', players: [players[0], players[0]] })).toThrow('2—54')
    expect(() => nextPhoneGame({ kind: 'poker', players: Array.from({ length: 55 }, (_, i) => ({ id: String(i), name: String(i) })) })).toThrow()
    const round = nextPhoneGame({ kind: 'poker', players: [...players, players[0]] })
    const saved = JSON.parse(JSON.stringify(round))
    expect(saved.players).toHaveLength(3)
    expect(phoneGameText(saved)).toBe(phoneGameText(round))
    const next = nextPhoneGame({ kind: 'poker', players, previous: saved })
    expect(next.number).toBe(2)
    expect(saved).toEqual(round)
  })
})
