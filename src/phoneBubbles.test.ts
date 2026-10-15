import { describe, expect, it } from 'vitest'
import { splitPhoneBubbles } from './phoneBubbles'

describe('splitPhoneBubbles', () => {
  it('splits lines and pulls actions out as gray notes', () => {
    expect(splitPhoneBubbles('账收了。\n（垂眸扫了眼入账通知）\n@周惟惟 回沙发去')).toEqual([
      { kind: 'say', text: '账收了。' },
      { kind: 'act', text: '垂眸扫了眼入账通知' },
      { kind: 'say', text: '@周惟惟 回沙发去' },
    ])
  })
  it('handles inline actions and long lines', () => {
    const out = splitPhoneBubbles('哈，叫得挺顺口啊。(把打火机砸在茶几上)给两百分就在这儿装什么长辈？老不死的真把自己当根葱了。')
    expect(out[0]).toEqual({ kind: 'say', text: '哈，叫得挺顺口啊。' })
    expect(out[1]).toEqual({ kind: 'act', text: '把打火机砸在茶几上' })
    expect(out.slice(2).every((item) => item.kind === 'say' && item.text.length <= 26)).toBe(true)
    expect(out.slice(2).map((item) => item.text).join('')).toBe('给两百分就在这儿装什么长辈？老不死的真把自己当根葱了。')
  })
})
