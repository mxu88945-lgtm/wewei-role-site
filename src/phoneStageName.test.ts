import { describe, expect, it } from 'vitest'
import { fixStageMentions, phoneStageNameNote } from './phoneStageName'

describe('phone stage names', () => {
  it('rewrites @stage-name to the current user name', () => {
    expect(fixStageMentions('@苏禾 听着呢，＠苏禾你别管', ['周惟惟', '苏禾'], '周惟惟')).toBe('@周惟惟 听着呢，@周惟惟你别管')
    expect(fixStageMentions('苏禾那场戏', ['周惟惟', '苏禾'], '周惟惟')).toBe('苏禾那场戏')
  })
  it('notes stage names only when there are others', () => {
    expect(phoneStageNameNote(['周惟惟'], '周惟惟')).toBe('')
    expect(phoneStageNameNote(['周惟惟', '苏禾'], '周惟惟')).toContain('一律用「周惟惟」')
  })
})
