import { describe, expect, it } from 'vitest'
import { activeThread, createPersonaWindow, editPersonaMessage, type PersonaMessage, type PersonaWindowState } from './personaWindow'

const seed = (messages: PersonaMessage[], extra: Record<string, unknown> = {}): { state: PersonaWindowState; personaId: string; threadId: string } => {
  const persona = createPersonaWindow('c1', 1)
  const thread = { ...activeThread(persona), messages, ...extra }
  return { state: { version: 2, activeId: persona.id, personas: [{ ...persona, threads: [thread] }] }, personaId: persona.id, threadId: thread.id }
}
const gift = { id: 'g1', name: '花', direction: 'role-to-user' } as unknown as PersonaMessage['gift']

describe('editPersonaMessage (v247)', () => {
  it('replaces only the text and keeps gift, images and time', () => {
    const images = [{ id: 'i1', dataUrl: 'data:image/png;base64,AA' }] as PersonaMessage['images']
    const { state, personaId, threadId } = seed([
      { id: 1, role: 'user', text: '你好', createdAt: 10 },
      { id: 2, role: 'assistant', text: '旧的回复', createdAt: 20, gift, images, songPick: '晴天' },
    ])
    const next = editPersonaMessage(state, personaId, threadId, 2, '改写后的回复')
    const messages = activeThread(next.personas[0], threadId).messages
    expect(messages[1]).toEqual({ id: 2, role: 'assistant', text: '改写后的回复', createdAt: 20, gift, images, songPick: '晴天' })
    expect(messages[0]).toBe(activeThread(state.personas[0], threadId).messages[0])
  })
  it('is a no-op for unknown ids or unchanged text', () => {
    const { state, personaId, threadId } = seed([{ id: 1, role: 'assistant', text: 'a', createdAt: 1 }])
    expect(activeThread(editPersonaMessage(state, personaId, threadId, 9, 'b').personas[0]).messages[0].text).toBe('a')
    expect(activeThread(editPersonaMessage(state, personaId, threadId, 1, 'a').personas[0]).messages).toBe(activeThread(state.personas[0]).messages)
  })
  it('drops a continuity summary that covered the edited message', () => {
    const msgs: PersonaMessage[] = [{ id: 1, role: 'assistant', text: 'a', createdAt: 1 }, { id: 2, role: 'assistant', text: 'b', createdAt: 2 }]
    const { state, personaId, threadId } = seed(msgs, { contextSummary: '档案', compressedThroughId: 1 })
    expect(activeThread(editPersonaMessage(state, personaId, threadId, 2, 'c').personas[0]).contextSummary).toBe('档案')
    const edited = activeThread(editPersonaMessage(state, personaId, threadId, 1, 'z').personas[0])
    expect(edited.contextSummary).toBeUndefined()
    expect(edited.compressedThroughId).toBeUndefined()
  })
})
