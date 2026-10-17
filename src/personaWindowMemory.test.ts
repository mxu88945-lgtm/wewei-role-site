import { describe, expect, it } from 'vitest'
import { createPersonaWindow, mergePersonaMemories, normalizePersonaState, type PersonaMessage, type PersonaThread } from './personaWindow'
import { buildPersonaMemoryContext, canLockPersonaMemory, commitPersonaRecallLedger, personaContinuitySourceUnchanged, personaContinuityTranscript, personaMemoryNearDuplicate, personaMemorySaves, personaRecallQuery, personaRecallTimeScore, personaRecentHistory, readPersonaOriginal, searchPersonaHistory } from './personaWindowMemory'
import { personaReplyText } from './personaWindowPresentation'

const names = { char: '虞山行', user: '惟惟' }
const now = new Date(2026, 9, 17, 12).getTime()
const say = (id: number, role: 'user' | 'assistant', text: string, createdAt = now - 10000): PersonaMessage => ({ id, role, text, createdAt })
const make = () => {
  const persona = createPersonaWindow('yu', now)
  const old: PersonaThread = { ...persona.threads[0], id: 'old', title: '去年窗口', updatedAt: now - 86400000, messages: [say(1, 'user', '茉莉花茶的约定：\n下次一起去山间喝茶。'), say(2, 'assistant', '好，我记得这个约定。')] }
  const active: PersonaThread = { ...persona.threads[0], id: 'current', title: '现在窗口', messages: [say(1, 'user', '茉莉花茶的约定还记得吗？')] }
  persona.threads = [old, active]; persona.activeThreadId = active.id
  return { persona, old, active }
}
const context = (persona: ReturnType<typeof make>['persona'], active: PersonaThread) => buildPersonaMemoryContext(persona, active, active.messages, personaRecentHistory(active.messages, active, 2), names, now)

describe('顾祁砚式原文召回，适配独立人格 (v139)', () => {
  it('recalls archived raw turns with neighborhood, source ID and multiline wording, not summaries as verbatim evidence', () => {
    const { persona, old, active } = make()
    old.contextSummary = '这份摘要不是原文。'; old.compressedThroughId = 2
    const before = JSON.stringify(persona)
    const result = context(persona, active)
    expect(result.text).toContain('茉莉花茶的约定：\n下次一起去山间喝茶。')
    expect(result.text).toContain('好，我记得这个约定。')
    expect(result.text).toContain('去年窗口')
    expect(result.audit.sources.some((source) => source.threadId === 'old' && source.messageId === 1)).toBe(true)
    expect(JSON.stringify(persona)).toBe(before)
  })

  it('search and direct original reads obey the exact same persona/thread scope', () => {
    const { persona, active } = make()
    expect(searchPersonaHistory(persona, active, '茉莉花茶', names, now).sources.length).toBeGreaterThan(0)
    expect(readPersonaOriginal(persona, active, 'another-persona|1|0', names).sources).toEqual([])
    const only = { ...persona, recallScope: 'thread' as const }
    expect(searchPersonaHistory(only, active, '茉莉花茶', names, now).sources).toEqual([])
    expect(readPersonaOriginal(only, active, 'old|1|0', names).sources).toEqual([])
    expect(context(only, active).audit.sources).toEqual([])
  })

  it('aliases find long originals and the excerpt stays centered on the matching alias', () => {
    const { persona, old, active } = make()
    persona.memoryAliases = '小米|米米|小鹦鹉'
    old.messages = [say(1, 'user', `${'前段。'.repeat(1800)}米米完整原话的关键细节。\n${'🙂末尾段。'.repeat(1400)}`)]
    active.messages[0].text = '小米'
    const result = context(persona, active)
    expect(result.text).toContain('米米完整原话的关键细节')
    expect(result.text).toContain('原文过长')
    expect(result.text.length).toBeLessThanOrEqual(6400)
    expect(result.audit.sources).toHaveLength(1)
    expect(result.text).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u)
  })

  it('short acknowledgements do not revive unrelated history; ambiguous followups use only user context', () => {
    const { persona, active } = make()
    for (const ack of ['好呀', '嗯嗯', '收到', '谢谢啦']) {
      active.messages[0].text = ack
      expect(context(persona, active).audit.sources).toEqual([])
    }
    const query = personaRecallQuery([say(1, 'user', '茉莉花茶的约定'), say(2, 'assistant', '完全无关的孔雀'), say(3, 'user', '那后来呢')])
    expect(query).toContain('茉莉花茶')
    expect(query).not.toContain('孔雀')
  })

  it('planning and previews never consume cooldown; committed recall cools four turns, explicit questions bypass it', () => {
    const { persona, active } = make()
    active.messages[0].text = '茉莉花茶'
    const first = context(persona, active)
    expect(context(persona, active).keys).toEqual(first.keys)
    const committed = commitPersonaRecallLedger(active, first.keys, first.turn)
    expect(context(persona, committed).audit.sources).toEqual([])
    committed.messages = [...committed.messages, say(2, 'user', '还记得茉莉花茶吗？')]
    expect(context(persona, committed).audit.sources.length).toBeGreaterThan(0)
    expect(active.recallLedger).toBeUndefined()
  })

  it('automatic recall can be disabled while deliberate model search remains available', () => {
    const { persona, active } = make()
    persona.recallEnabled = false
    expect(context(persona, active).audit.sources).toEqual([])
    expect(searchPersonaHistory(persona, active, '茉莉花茶', names, now).sources.length).toBeGreaterThan(0)
  })

  it('reads exact Unicode pages with validated source IDs and offsets', () => {
    const { persona, old, active } = make()
    const original = '🙂茶'.repeat(4000)
    old.messages = [say(1, 'user', original)]
    const first = readPersonaOriginal(persona, active, 'old|1|0', names)
    const second = readPersonaOriginal(persona, active, 'old|1|6000', names)
    expect(first.text).toContain(Array.from(original).slice(0, 6000).join(''))
    expect(first.text).toContain('[旧文:old|1|6000]')
    expect(second.text).toContain(Array.from(original).slice(6000).join(''))
    expect(second.text).toContain('已读取至末尾')
    for (const ref of ['missing|1|0', 'old|2|0', 'old|1|-1', 'old|1|NaN', 'old|1|0|extra']) expect(readPersonaOriginal(persona, active, ref, names).sources).toEqual([])
  })

  it('date queries rank the requested local calendar day instead of a different day', () => {
    const at = new Date(2026, 6, 29, 8, 30).getTime()
    expect(personaRecallTimeScore('2026年7月29号早上', at, now)).toBe(6)
    expect(personaRecallTimeScore('2026年7月28号早上', at, now)).toBe(0)
    expect(personaRecallTimeScore('2026年2月31号', at, now)).toBe(0)
  })

  it('recent life reports expire after 36h and never turn assistant fantasies into user facts', () => {
    const { persona, old, active } = make()
    old.messages = [say(1, 'user', '今天午饭吃了面条。', now - 24 * 3600000), say(2, 'user', '今天吃了旧面包。', now - 40 * 3600000), say(3, 'assistant', '她正在吃虚构大餐。'), say(4, 'user', '准备出门，等会回家。', now - 1000)]
    active.messages[0].text = '嗨'
    const recent = context(persona, active).audit.lanes.find((lane) => lane.key === 'recent')!.preview
    expect(recent).toContain('面条')
    expect(recent).toContain('准备出门')
    expect(recent).toContain('计划不等于已经完成')
    expect(recent).not.toMatch(/旧面包|虚构大餐/)
  })

  it('shared budget protects locked anchors and receipts count only evidence that actually fit', () => {
    const { persona, old, active } = make()
    persona.memories = Array.from({ length: 40 }, (_, index) => ({ id: String(index), title: `记忆${index}`, content: `${index}茶的约定。${'长期事实'.repeat(80)}`, pinned: index < 10, locked: index === 0, createdAt: index }))
    old.messages = Array.from({ length: 10 }, (_, index) => say(index + 1, 'user', `茉莉花茶${index}${'原话'.repeat(1000)}`))
    const result = context(persona, active)
    expect(result.text.length).toBeLessThanOrEqual(6400)
    expect(result.audit.used).toBe(result.text.length)
    expect(result.text).toContain('用户亲手锁定')
    const lane = result.audit.lanes.find((item) => item.key === 'original')!
    expect(lane.selected).toBe(result.audit.sources.length)
    for (const source of result.audit.sources) expect(lane.preview + result.text).toContain(`编号 ${source.threadId}|${source.messageId}`)
    expect(result.audit.sources.length).toBeLessThanOrEqual(3)
  })

  it('ordinary unrelated memories stay out, derived clues stay separate, negations and numeric changes are not deduped', () => {
    const { persona, active } = make()
    persona.memories = [
      { id: 'a', title: '确认', content: '茉莉花茶是她最喜欢的茶。', createdAt: 1 },
      { id: 'b', title: '提炼', content: '她说茉莉花茶令她安心。', createdAt: 2, autoGenerated: true },
      { id: 'c', title: '无关', content: '她不爱下雨天。', createdAt: 3 },
    ]
    const result = context(persona, active)
    expect(result.text).toContain('用户确认的长期事实')
    expect(result.text).toContain('模型提炼线索')
    expect(result.text).not.toContain('不爱下雨天')
    expect(personaMemoryNearDuplicate('她喜欢咖啡', ['她不喜欢咖啡'])).toBe(false)
    expect(personaMemoryNearDuplicate('她养9只鸟', ['她养8只鸟'])).toBe(false)
    expect(personaMemoryNearDuplicate('她每天都喜欢喝茉莉花茶。', ['她每天都喜欢喝茉莉花茶'])).toBe(true)
    expect(canLockPersonaMemory(Array.from({ length: 13 }, (_, i) => ({ id: String(i), title: '锚', content: '身份', createdAt: 1, locked: true })))).toBe(false)
  })

  it('reply memory markers have provenance, remain unconfirmed, and never leak on screen', () => {
    const raw = '我记下了。[记忆:她养九只玄凤]'
    const saves = personaMemorySaves(raw, 'w', [1, 2], now)
    expect(saves[0]).toMatchObject({ content: '她养九只玄凤', autoGenerated: true, sourceThreadId: 'w', sourceMessageIds: [1, 2] })
    expect(personaReplyText(raw)).toBe('我记下了。')
    for (const tail of ['[', '[记', '[记忆:', '[搜索:茶', '[旧文:w|1']) expect(personaReplyText(`正文${tail}`)).toBe('正文')
  })

  it('maintains a UTF-8 batch budget while keeping every boundary ID and refuses changed summary sources', () => {
    const { active } = make()
    const batch = Array.from({ length: 144 }, (_, index) => say(index + 1, index % 2 ? 'assistant' : 'user', `开始${index}${'🙂中间中文'.repeat(200)}结尾${index}`))
    const transcript = personaContinuityTranscript(batch, names)
    expect(new TextEncoder().encode(transcript).length).toBeLessThanOrEqual(24000)
    for (const message of batch) expect(transcript).toContain(`[${message.id}]`)
    expect(transcript).toContain('结尾143')
    const started = { ...active, messages: batch }
    expect(personaContinuitySourceUnchanged({ ...started, messages: [...batch, say(145, 'user', '后来的新话')] }, started, batch)).toBe(true)
    expect(personaContinuitySourceUnchanged({ ...started, messages: batch.filter((message) => message.id !== 30) }, started, batch)).toBe(false)
    expect(personaContinuitySourceUnchanged({ ...started, contextSummary: '另一份摘要' }, started, batch)).toBe(false)
    const restored = normalizePersonaState({ personas: [{ ...make().persona, threads: [{ ...started, recallLedger: { valid: 1, invalid: 'x' } }] }] })
    expect(restored.personas[0].threads[0].recallLedger).toEqual({ valid: 1 })
  })

  it('new automatic saves never evict old library rows or overwrite a locked model-derived anchor', () => {
    const existing = Array.from({ length: 310 }, (_, index) => ({ id: String(index), title: `手写${index}`, content: `用户长期记忆${index}`, createdAt: 1 }))
    const merged = mergePersonaMemories(existing, [{ id: 'new', title: '新线索', content: '新提炼的偏好', createdAt: 2, autoGenerated: true }])
    expect(merged).toHaveLength(311)
    expect(merged[0]).toEqual(existing[0])
    const locked = { id: 'locked', title: '她的称呼约定', content: '她喜欢惟惟这个称呼', createdAt: 1, autoGenerated: true, locked: true }
    expect(mergePersonaMemories([locked], [{ ...locked, id: 'other', content: '模型推翻原约定', locked: false, createdAt: 2 }])[0].content).toBe(locked.content)
    expect(personaMemoryNearDuplicate('她养了九只玄凤已经很多年了', ['她养了八只玄凤已经很多年了'])).toBe(false)
  })

  it('keeps saved provenance through restore and stops using an unconfirmed clue when its source disappears', () => {
    const { persona, old, active } = make()
    persona.memories = [{ id: 'derived', title: '茶的线索', content: '她喝茉莉花茶', createdAt: 1, autoGenerated: true, sourceThreadId: old.id, sourceMessageIds: [1, 2] }]
    persona.recallEnabled = false
    const restored = normalizePersonaState({ personas: [JSON.parse(JSON.stringify(persona))] }).personas[0]
    expect(restored.memories[0].sourceMessageIds).toEqual([1, 2])
    expect(context(restored, restored.threads[1]).text).toContain('她喝茉莉花茶')
    restored.threads[0].messages = []
    expect(context(restored, restored.threads[1]).text).not.toContain('她喝茉莉花茶')
    expect(restored.memories).toHaveLength(1)
    restored.memories[0].autoGenerated = false
    expect(context(restored, active).text).toContain('她喝茉莉花茶')
  })
})
