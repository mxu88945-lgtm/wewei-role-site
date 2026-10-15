import { describe, expect, it } from 'vitest'
import { parsePhoneForumShare, phoneModeRules, phoneStreamPreview, stripPhoneForumShareTag } from './phoneGroup'
import { findForumThread, forumShareText, type ForumThread } from './forum'

const thread = (id: string, title: string, updatedAt: number, floors: ForumThread['floors'] = []): ForumThread => ({ id, board: '八卦', title, authorId: 'a', body: '正文内容', createdAt: 1, updatedAt, floors, likes: [] })

describe('character forum forwarding', () => {
  it('parses the tag with and without a floor', () => {
    expect(parsePhoneForumShare('看看这个\n【转发论坛：段冥洲深夜私聊实录】')).toEqual({ text: '看看这个', key: '段冥洲深夜私聊实录', floor: 1 })
    expect(parsePhoneForumShare('证据\n【转发论坛：《深夜私聊》：5楼】')).toEqual({ text: '证据', key: '《深夜私聊》', floor: 5 })
    expect(parsePhoneForumShare('没有标签')).toBeNull()
    expect(stripPhoneForumShareTag('嗯\n【转发论坛：随便】')).toBe('嗯')
  })
  it('finds the thread by title keyword, newest first on ties', () => {
    const threads = [thread('1', '段冥洲深夜私聊实录', 5), thread('2', '谁又锁了造物主手机', 9), thread('3', '段冥洲深夜私聊实录（续）', 8)]
    expect(findForumThread(threads, '《段冥洲深夜私聊实录》')?.id).toBe('1')
    expect(findForumThread(threads, '深夜私聊')?.id).toBe('3')
    expect(findForumThread(threads, '完全无关')).toBeUndefined()
  })
  it('builds the same share card as the user share', () => {
    const t = thread('1', '标题', 1, [{ id: 'f', authorId: 'b', text: '二楼说的话', createdAt: 2 }])
    expect(forumShareText(t, 2, (id) => id.toUpperCase())).toBe('【分享论坛楼层】《标题》2楼 B：二楼说的话')
    expect(forumShareText(t, 1, (id) => id.toUpperCase())).toContain('【分享论坛帖子】《标题》（八卦·A）')
  })
  it('advertises the right only when allowed and hides the tag while streaming', () => {
    expect(phoneModeRules('沈衍', ['沈衍'], '惟惟')).toContain('【转发论坛')
    expect(phoneModeRules('沈衍', ['沈衍'], '惟惟', { allowForumShare: false })).not.toContain('【转发论坛')
    expect(phoneStreamPreview('你自己看。\n【转发论坛：深')).not.toContain('转发论坛')
  })
})
