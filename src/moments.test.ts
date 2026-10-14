import { describe, expect, it } from 'vitest'
import type { Conversation } from './conversationLifecycle'
import { USER_AUTHOR, buildCommentPrompt, communityMemberIds, excerptFromMessage, findMentionIds, momentAudienceIds, parseReaction, sortMoments, splitPostImage, type Moment } from './moments'

const group = (id: string, ids: string[]) => ({ id, kind: 'group', characterId: ids[0], participantIds: ids, title: id, messages: [], createdAt: 0, updatedAt: 0, phone: { bindings: {} } }) as Conversation
const convs = [group('g1', ['xie', 'fu']), group('g2', ['fu', 'shen', 'yu']), { id: 'solo', characterId: 'pei', title: 'x', messages: [], createdAt: 0, updatedAt: 0 } as Conversation]
const moment = (extra: Partial<Moment> = {}): Moment => ({ id: 'm', authorId: 'fu', text: '今晚天气不错。', createdAt: 1, visibility: { kind: 'all' }, likes: [], comments: [], ...extra })

describe('moments', () => {
  it('community is only phone-group members', () => {
    expect(communityMemberIds(convs).sort()).toEqual(['fu', 'shen', 'xie', 'yu'])
  })

  it('visibility limits who can see and comment', () => {
    expect(momentAudienceIds(moment(), convs).sort()).toEqual(['fu', 'shen', 'xie', 'yu'])
    expect(momentAudienceIds(moment({ visibility: { kind: 'group', groupId: 'g1' } }), convs).sort()).toEqual(['fu', 'xie'])
    expect(momentAudienceIds(moment({ authorId: USER_AUTHOR, visibility: { kind: 'members', memberIds: ['shen'] } }), convs)).toEqual(['shen'])
  })

  it('pinned first, then newest', () => {
    expect(sortMoments([moment({ id: 'a', createdAt: 1 }), moment({ id: 'b', createdAt: 3 }), moment({ id: 'c', createdAt: 2, pinned: true })]).map((item) => item.id)).toEqual(['c', 'b', 'a'])
  })

  it('parses a reaction storm even inside code fences', () => {
    const parsed = parseReaction('```json\n{"likes":["虞山行"],"comments":[{"author":"虞山行","reply_to":"","text":"建议管理员核查，该用户疑似炫耀减刑进度。"},{"author":"傅承砚","reply_to":"谢聿衡","text":"你不是在玄关坐着吗？"},{"author":"x","text":""}]}\n```')
    expect(parsed.likes).toEqual(['虞山行'])
    expect(parsed.comments).toHaveLength(2)
    expect(parsed.comments[1]).toEqual({ author: '傅承砚', replyTo: '谢聿衡', text: '你不是在玄关坐着吗？' })
    expect(parseReaction('不是 JSON')).toEqual({ likes: [], comments: [] })
  })

  it('only sends the current post, its thread and a few recent lines', () => {
    const names: Record<string, string> = { fu: '傅承砚', xie: '谢聿衡', user: '惟惟' }
    const prompt = buildCommentPrompt({ moment: moment({ comments: [{ id: 'c', authorId: 'xie', text: '举报。', createdAt: 2 }] }), nameOf: (id) => names[id] || id, briefs: ['【傅承砚】…'], candidateNames: ['傅承砚', '谢聿衡'], mentionedNames: ['谢聿衡'], userName: '惟惟', recent: ['沈衍：在加班'], trigger: '刚发出来' })
    const text = prompt.map((item) => item.content).join('\n')
    expect(text).toContain('今晚天气不错')
    expect(text).toContain('谢聿衡：举报。')
    expect(text).toContain('被 @ 的 谢聿衡 必须回复')
    expect(text).toContain('沈衍：在加班')
  })

  it('splits a described photo and finds @ mentions', () => {
    expect(splitPostImage('今晚天气不错。\n[图片] 星空')).toEqual({ text: '今晚天气不错。', image: '星空' })
    expect(findMentionIds('@谢聿衡 你出来', [{ id: 'xie', name: '谢聿衡' }, { id: 'fu', name: '傅承砚' }])).toEqual(['xie'])
  })

  it('story excerpts drop status panels and tags', () => {
    expect(excerptFromMessage('<scene>夜</scene>他关上门。<gts_status>心情：差</gts_status>')).toBe('夜 他关上门。')
  })
})
