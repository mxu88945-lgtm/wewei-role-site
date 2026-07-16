import { describe, expect, it } from 'vitest'
import { buildCharacterWorkshopPrompt, characterFromWorkshopDraft, parseCharacterWorkshopDraft } from './characterWorkshop'

describe('character workshop', () => {
  it('parses fenced JSON and worldbook entries', () => {
    const draft = parseCharacterWorkshopDraft('```json\n{"name":"沈砚","tagline":"冷静调查员","description":"有自己的案件目标。","personality":"克制","scenario":"旧案重启","greeting":"门被敲响。","alternateGreetings":[],"mesExample":"","creatorNotes":"","systemPrompt":"不代演用户","postHistoryInstructions":"核对历史","tags":["慢热"],"worldbook":[{"title":"旧案","keywords":["旧案"],"content":"三年前未结案。"}]}\n```')
    expect(draft.name).toBe('沈砚')
    expect(draft.worldbook[0].keywords).toEqual(['旧案'])
  })

  it('builds a V3 character from a generated draft', () => {
    const draft = parseCharacterWorkshopDraft('{"name":"沈砚","description":"调查员","greeting":"你来了。","worldbook":[]}')
    const character = characterFromWorkshopDraft(draft)
    expect(character.cardSpec).toBe('chara_card_v3')
    expect(character.creator).toContain('AI 角色卡工坊')
  })

  it('includes user constraints in the prompt', () => {
    const prompt = buildCharacterWorkshopPrompt({ concept: '年下珠宝设计师', name: '', relationship: '海外旧识', tone: '明朗', pace: '极慢热', boundaries: '不代演用户' })
    expect(prompt).toContain('年下珠宝设计师')
    expect(prompt).toContain('极慢热')
  })
})
