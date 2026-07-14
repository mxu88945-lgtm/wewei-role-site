import { describe, expect, it } from 'vitest'
import { findMentionedParticipantIds, selectGroupSpeakerIds } from './groupReplyRouting'

describe('group reply routing', () => {
  const participantIds = ['male-lead', 'director']

  it.each(['natural', 'contextual', 'all', 'specified'] as const)('lets an explicit mention override %s mode', (mode) => {
    expect(selectGroupSpeakerIds({ participantIds, mentionedIds: ['director'], mode, text: '@旁白导演 推进会议' })).toEqual(['director'])
  })

  it('keeps participant order when several members are explicitly mentioned', () => {
    expect(selectGroupSpeakerIds({ participantIds, mentionedIds: ['director', 'male-lead'], mode: 'all', text: '@旁白导演 @裴成砚' })).toEqual(participantIds)
  })

  it('uses all participants only when all mode has no explicit mention', () => {
    expect(selectGroupSpeakerIds({ participantIds, mentionedIds: [], mode: 'all', text: '继续' })).toEqual(participantIds)
  })

  it('requires a mention in specified mode', () => {
    expect(selectGroupSpeakerIds({ participantIds, mentionedIds: [], mode: 'specified', text: '继续' })).toEqual([])
  })

  it('uses the longest complete name when one member name prefixes another', () => {
    const participants = [
      { id: 'male-lead', name: '裴成砚' },
      { id: 'director', name: '裴成砚剧场·旁白导演' },
    ]
    expect(findMentionedParticipantIds('@裴成砚剧场·旁白导演 推进到下一幕', participants)).toEqual(['director'])
    expect(findMentionedParticipantIds('@裴成砚 回答她', participants)).toEqual(['male-lead'])
  })

  it('supports several explicit mentions without prefix collisions', () => {
    const participants = [
      { id: 'male-lead', name: '裴成砚' },
      { id: 'director', name: '裴成砚剧场·旁白导演' },
    ]
    expect(findMentionedParticipantIds('@裴成砚剧场·旁白导演 先说，@裴成砚 再说', participants)).toEqual(['director', 'male-lead'])
  })
})
