import { describe, expect, it } from 'vitest'
import type { Character } from './characterCard'
import { buildStatusFallback, getStatusProtocol, latestStatusContent } from './statusProtocol'

const character: Character = {
  id: 'yan',
  name: '晏承聿',
  tagline: '',
  description: '',
  personality: '',
  scenario: '',
  greeting: '<scene>时间：周五｜地点：酒店</scene>正文。<status>关系进展：阶段一｜晏承聿当前认知：她是合作对象｜公开责任：完成晚宴｜私人立场：维持现状｜五年前救命恩人：线索未知</status>',
  alternateGreetings: [],
  mesExample: '',
  creatorNotes: '',
  systemPrompt: '',
  postHistoryInstructions: '',
  tags: [],
  creator: '',
  characterVersion: '',
  regexScripts: [],
}

describe('status protocol', () => {
  it('reads the tag and exact field order from a character card', () => {
    expect(getStatusProtocol(character)).toEqual({
      tag: 'status',
      fields: ['关系进展', '晏承聿当前认知', '公开责任', '私人立场', '五年前救命恩人'],
    })
  })

  it('carries forward the last known fields when a model omits the bar', () => {
    const previous = '<status>关系进展：阶段二｜晏承聿当前认知：她已是重要合作者｜公开责任：保护项目签约｜私人立场：不再维持现状｜五年前救命恩人：仍未确认</status>'
    const fallback = buildStatusFallback(character, '惟惟', { previousStatusContent: previous })
    expect(fallback.content).toContain('关系进展：阶段二')
    expect(fallback.content).toContain('晏承聿当前认知：她已是重要合作者')
    expect(fallback.content).toContain('私人立场：不再维持现状')
    expect(fallback.content).toContain('五年前救命恩人：仍未确认')
  })

  it('replaces empty prior placeholders with concrete values from the card', () => {
    const fallback = buildStatusFallback(character, '惟惟', {
      previousStatusContent: '<status>关系进展：延续当前剧情｜晏承聿当前认知：以本轮正文明确内容为准｜公开责任：本轮未更新｜私人立场：本轮未更新｜五年前救命恩人：以本轮正文明确内容为准</status>',
      output: '他将晚宴流程表推到惟惟面前，明确由自己负责接下来的签约安排。',
    })
    expect(fallback.content).toContain('关系进展：阶段一')
    expect(fallback.content).toContain('晏承聿当前认知：她是合作对象')
    expect(fallback.content).toContain('公开责任：完成晚宴')
    expect(fallback.content).not.toMatch(/本轮未更新|以本轮正文明确内容为准|延续当前剧情/)
  })

  it('finds the newest status from the same actor history scan', () => {
    expect(latestStatusContent([
      { role: 'assistant', characterId: 'yan', text: '<status>关系进展：旧</status>' },
      { role: 'user', text: '继续。' },
      { role: 'assistant', characterId: 'other', text: '<status>关系进展：不应读取</status>' },
      { role: 'assistant', characterId: 'yan', text: '<status>关系进展：新</status>' },
    ], 'status', 'yan')).toBe('关系进展：新')
  })

  it('discovers bracket-labelled fields from a rich character panel', () => {
    const richCharacter = {
      ...character,
      greeting: '<gts_status>【当前心境】阶段一：冷漠偏见\n【好感／占有】好感 -15｜占有 20\n【现场局势】病房对峙\n【角色已知线索】坠楼疑点\n状态：等待回应\n关系：未婚夫妻\n待回应：等待白安禾回应</gts_status>',
    }
    expect(getStatusProtocol(richCharacter)).toEqual({
      tag: 'gts_status',
      fields: ['当前心境', '好感／占有', '现场局势', '角色已知线索', '状态', '关系', '待回应'],
    })
  })
})
