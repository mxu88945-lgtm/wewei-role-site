import { describe, expect, it } from 'vitest'
import { messageTime, phoneTimeLabel, showPhoneTimeDivider } from './phoneTime'
import { cleanPhoneOutput, phoneFinalGuard, phonePromptHistory } from './phoneGroup'
import type { Message } from './conversationLifecycle'

const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).getTime()
const now = at(2026, 10, 15, 12, 8)

describe('phone time', () => {
  it('labels like WeChat', () => {
    expect(phoneTimeLabel(at(2026, 10, 15, 9, 5), now)).toBe('09:05')
    expect(phoneTimeLabel(at(2026, 10, 14, 22, 9), now)).toBe('昨天 22:09')
    expect(phoneTimeLabel(at(2026, 10, 1, 8, 0), now)).toBe('10月1日 08:00')
  })
  it('ignores tiny legacy ids and shows dividers after 5 minutes', () => {
    expect(messageTime({ id: 3 }, now)).toBeUndefined()
    expect(showPhoneTimeDivider(undefined, { id: now }, 5, now)).toBe(true)
    expect(showPhoneTimeDivider({ id: now - 60_000 }, { id: now }, 5, now)).toBe(false)
    expect(showPhoneTimeDivider({ id: now - 6 * 60_000 }, { id: now }, 5, now)).toBe(true)
  })
  it('stamps old messages for the model and tells it the real time last', () => {
    const messages: Message[] = [
      { id: at(2026, 10, 14, 22, 9), role: 'assistant', text: '都十点了快睡', characterId: 'a' },
      { id: at(2026, 10, 14, 22, 10), role: 'user', text: '不睡' },
      { id: at(2026, 10, 15, 12, 7), role: 'user', text: '本地时间？' },
    ]
    const history = phonePromptHistory(messages, 40, now)
    expect(history[0].text).toMatch(/^\[发送于 10月14日 星期三 22:09\] /)
    expect(history[1].text).toBe('不睡')
    expect(history[2].text).toMatch(/^\[发送于 10月15日 星期四 12:07\] 本地时间？/)
    expect(phoneFinalGuard('沈衍', '惟惟', new Date(now))).toContain('现在真实时间：10月15日 星期四 12:08（中午）')
    expect(cleanPhoneOutput('[发送于 10月15日 星期四 12:08] 吃饭没')).toBe('吃饭没')
  })
})
