import { describe, expect, it } from 'vitest'
import { activeCharacterMemory, characterMemoryEntryFromConversation, characterMemoryPrompt } from './characterMemory'
import { createCharacterMemoryEntry, type Character } from './characterCard'
import { buildChatPrompt } from './promptBuilder'

const character: Character = {
  id: 'memory-test',
  name: '裴成砚',
  tagline: '测试角色',
  description: '',
  personality: '',
  scenario: '',
  greeting: '三年前事故真相：待查。',
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

describe('角色私有长期记忆', () => {
  it('只激活启用的固定记忆，并保留已确认状态', () => {
    const solved = createCharacterMemoryEntry({
      id: 'solved-accident',
      title: '三年前事故真相已经查明',
      category: 'truth',
      status: 'confirmed',
      content: '裴成砚已经查明，事故并非江黎姿造成；他已掌握证据并完成核实。',
      createdAt: 2,
    })
    const disabled = createCharacterMemoryEntry({ id: 'disabled', content: '不应注入', enabled: false, createdAt: 1 })
    const next = { ...character, characterMemory: [disabled, solved] }

    expect(activeCharacterMemory(next).map((entry) => entry.id)).toEqual(['solved-accident'])
    const prompt = characterMemoryPrompt(next)
    expect(prompt).toContain('三年前事故真相已经查明')
    expect(prompt).toContain('已确认')
    expect(prompt).not.toContain('不应注入')
    expect(prompt).toContain('角色卡开场白或旧状态栏')
  })

  it('在角色 prompt 的最后再次校准旧的“待查”状态', () => {
    const next = {
      ...character,
      characterMemory: [createCharacterMemoryEntry({
        title: '事故真相已完成核实',
        category: 'truth',
        status: 'completed',
        content: '三年前事故的责任链已经查清，调查任务已完成。',
      })],
    }
    const result = buildChatPrompt({
      character: next,
      user: { name: '惟惟', description: '' },
      messages: [{ role: 'assistant', text: '旧状态：三年前事故真相（待查）。' }],
      preset: '',
      globalWorldbook: '',
      memory: { entries: [], injectPosition: 'none', injectPrompt: '{{memories}}' },
      memoryLength: 20,
    })
    const all = result.map((message) => message.content).join('\n')

    expect(all).toContain('事故真相已完成核实')
    expect(all).toContain('调查任务已完成')
    expect(all).toContain('不要因为旧开场白、旧状态栏、历史分支或滚动摘要')
  })

  it('从对话记忆固定时保留来源并生成可编辑的角色记忆', () => {
    const entry = characterMemoryEntryFromConversation({
      id: 'conversation-memory-1',
      title: '已经完成的调查',
      content: '调查已经完成，证据已归档。',
      createdAt: 123,
    })

    expect(entry.title).toBe('已经完成的调查')
    expect(entry.status).toBe('confirmed')
    expect(entry.sourceMemoryId).toBe('conversation-memory-1')
    expect(entry.createdAt).toBe(123)
    expect(entry.enabled).toBe(true)
  })
})
