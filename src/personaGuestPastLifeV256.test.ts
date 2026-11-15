import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { Character } from './characterCard'
import type { ChatApiMessage } from './chatApi'
import { emptyPersonaState, enablePersona, type PersonaWindow } from './personaWindow'
import { addGuest } from './personaGroup'
import { planPersonaRequest } from './personaWindowRuntime'

const card: Character = { id: 'yu', name: '虞山行', description: '{{char}}是剑客。', personality: '', scenario: '', firstMes: '', mesExample: '', systemPrompt: '', postHistoryInstructions: '', alternateGreetings: [], tags: [], creator: '', characterVersion: '', creatorNotes: '' } as unknown as Character
const xie: Character = { ...card, id: 'xie', name: '谢衍', description: '{{char}}是律师。' }
const story = `〔长剧情｜澳洲花园〕\n经过：\n谢衍和周惟惟在澳洲花园的雨夜吵过一架，后来他把那块旧表送给了她当信物。${'细节'.repeat(80)}`
const deps = (guestPastLife?: (id: string) => string) => ({ character: card, characters: [card, xie], user: { name: '周惟惟', description: '' }, api: { baseUrl: 'https://api.anthropic.com/v1', apiKey: 'k', modelName: 'claude-sonnet-4' }, memoryApi: { baseUrl: '', apiKey: '', modelName: '' }, temperature: 1, topP: 1, maxTokens: 100, streaming: false, memoryLength: 40, pastLife: () => '', guestPastLife })
const text = (messages: ChatApiMessage[]) => JSON.stringify(messages)

function withXie(): PersonaWindow {
  let persona = enablePersona(emptyPersonaState(), 'yu').personas[0]
  persona = addGuest(persona, persona.threads[0].id, { id: 'guest-x', source: 'card', characterId: 'xie', name: '谢衍' }, ['虞山行', '周惟惟'], 1).persona
  return persona
}
const ask = (q: string) => [{ id: 1, role: 'user' as const, text: q, createdAt: 1 }]

describe('v256 客人的前世记忆', () => {
  it('card guest with history gets a pointer in his card, and a recall snippet only when it comes up', () => {
    const persona = withXie()
    const casual = planPersonaRequest(persona, ask('今天好冷'), deps(() => story))
    expect(text(casual.messages)).toContain('前世记忆：谢衍和周惟惟')
    expect(text(casual.messages)).not.toContain('谢衍的前世记忆·按需召回')
    const recalled = planPersonaRequest(persona, ask('谢衍你还记得澳洲花园那个雨夜吗'), deps(() => story))
    expect(text(recalled.messages)).toContain('谢衍的前世记忆·按需召回')
    expect(text(recalled.messages)).toContain('旧表')
    expect(recalled.guestPastKeys.length).toBeGreaterThan(0)
  })

  it('no history or no hook means no pointer (old behaviour)', () => {
    const persona = withXie()
    expect(text(planPersonaRequest(persona, ask('你好'), deps(() => '')).messages)).not.toContain('前世记忆：谢衍')
    expect(text(planPersonaRequest(persona, ask('你好'), deps()).messages)).not.toContain('前世记忆：谢衍')
  })
})
