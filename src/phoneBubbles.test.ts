import { describe, expect, it } from 'vitest'
import { capPhoneBubbles, splitPhoneBubbles } from './phoneBubbles'

describe('splitPhoneBubbles', () => {
  it('splits lines and pulls actions out as gray notes', () => {
    expect(splitPhoneBubbles('账收了。\n（垂眸扫了眼入账通知）\n@周惟惟 回沙发去')).toEqual([
      { kind: 'say', text: '账收了。' },
      { kind: 'act', text: '垂眸扫了眼入账通知' },
      { kind: 'say', text: '@周惟惟 回沙发去' },
    ])
  })
})

describe('capPhoneBubbles', () => {
  it('merges the shortest neighbours until within the cap, keeping all text', () => {
    const bubbles = splitPhoneBubbles('嗯。\n好。\n今晚我去接你。\n别乱跑。\n听见没有？\n回话。')
    const capped = capPhoneBubbles(bubbles, 3)
    expect(capped.filter((item) => item.kind === 'say')).toHaveLength(3)
    expect(capped.map((item) => item.text).join('')).toBe(bubbles.map((item) => item.text).join(''))
  })
  it('leaves short replies alone', () => {
    const bubbles = splitPhoneBubbles('嗯。\n知道了。')
    expect(capPhoneBubbles(bubbles, 4)).toEqual(bubbles)
  })
  it('folds actions back in when they block merging', () => {
    const capped = capPhoneBubbles(splitPhoneBubbles('一。（笑）二。（停）三。'), 1)
    expect(capped.filter((item) => item.kind === 'say')).toHaveLength(1)
  })
})
