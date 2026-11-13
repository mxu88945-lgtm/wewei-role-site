import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Character } from './characterCard'
import { addPersonaGift, buildPersonaGiftPrompt, hashGiftColors, normalizePersonaGift, normalizePersonaGifts, parsePersonaGiftTag, personaGiftEvent, personaGiftRecordLine, removePersonaGift, safeGiftColors, stripPersonaGiftTag, PERSONA_GIFT_SHELF_MAX } from './personaGifts'
import { personaReplyText } from './personaWindowPresentation'
import { activeThread, emptyPersonaState, enablePersona, normalizePersonaState, personaIdFor } from './personaWindow'
import { getPersonaState, setPersonaState } from './personaWindowStore'
import { buildPersonaRequest, generatePersonaReply } from './personaWindowRuntime'

const card: Character = {
  id: 'yu', name: '虞山行', tagline: '', description: '寡言护短。', personality: '', scenario: '', greeting: '',
  alternateGreetings: [], mesExample: '', creatorNotes: '', systemPrompt: '', postHistoryInstructions: '', tags: [], creator: '', characterVersion: '', regexScripts: [],
}

describe('自制礼物标记 (v231)', () => {
  it('parses the tag with any bracket / colon / pipe and fills defaults', () => {
    const gift = parsePersonaGiftTag('拿着。\n[自制礼物:🐚|会发光的贝壳|海边捡的，留着等你|别弄丢]', 100)
    expect(gift).toMatchObject({ icon: '🐚', name: '会发光的贝壳', subtitle: '海边捡的，留着等你', note: '别弄丢', maker: 'role', createdAt: 100 })
    expect(gift?.colors).toEqual(hashGiftColors('会发光的贝壳'))
    expect(parsePersonaGiftTag('【自制礼物：🧣｜围巾】')).toMatchObject({ icon: '🧣', name: '围巾', subtitle: 'TA 亲手做的' })
    expect(parsePersonaGiftTag('［自制礼物:|小纸条|写给你的］')?.icon).toBe('🎁')
    expect(parsePersonaGiftTag('没有礼物')).toBeNull()
    expect(parsePersonaGiftTag('[自制礼物:🎁|]')).toBeNull()
  })

  it('takes only the first gift per reply', () => {
    expect(parsePersonaGiftTag('[自制礼物:🌼|A]\n[自制礼物:🌹|B]')?.name).toBe('A')
  })

  it('accepts legal hex colors only, falling back otherwise', () => {
    expect(parsePersonaGiftTag('[自制礼物:🎁|信|一封|附言|#FFE4E8,#dfa0aa]')?.colors).toEqual(['#ffe4e8', '#dfa0aa'])
    expect(parsePersonaGiftTag('[自制礼物:🎁|信|一封|附言|red,#dfa0aa]')?.colors).toEqual(hashGiftColors('信'))
    expect(parsePersonaGiftTag('[自制礼物:🎁|信|一封|附言|#fff,#000]')?.colors).toEqual(hashGiftColors('信'))
    expect(safeGiftColors(['#123456', '#abcdef'])).toEqual(['#123456', '#abcdef'])
    expect(safeGiftColors(['#123456'])).toBeNull()
    expect(safeGiftColors(['#123456', 'url(x)'])).toBeNull()
    expect(safeGiftColors('#123456;background:red,#abcdef')).toBeNull()
    expect(normalizePersonaGift({ name: '杯子', colors: ['javascript:', '#000000'] })?.colors).toEqual(hashGiftColors('杯子'))
  })

  it('never shows the tag in the prose, including half-written ones while streaming', () => {
    expect(stripPersonaGiftTag('拿着。\n[自制礼物:🐚|贝壳|海边|别弄丢]')).toBe('拿着。')
    expect(personaReplyText('拿着。\n【自制礼物：🐚｜贝壳】\n')).toBe('拿着。')
    expect(personaReplyText('等一下\n[自制礼物:🐚|贝')).toBe('等一下')
    expect(personaReplyText('等一下\n[自制')).toBe('等一下')
    expect(personaReplyText('坏标记\n[自制礼物:没有竖线]')).toBe('坏标记')
    expect(personaReplyText(`嗯。\n${personaGiftRecordLine({ name: '贝壳', maker: 'role' })}`)).toBe('嗯。')
    expect(personaReplyText('[记住:别的]')).toBe('')
  })
})

describe('自制礼物架 (v231)', () => {
  it('normalizes old / partial data backward-compatibly', () => {
    const gift = normalizePersonaGift({ name: '  旧礼物  ', createdAt: 'x' }, 5)
    expect(gift).toMatchObject({ name: '旧礼物', icon: '🎁', maker: 'role', createdAt: 5 })
    expect(gift?.colors).toHaveLength(2)
    expect(normalizePersonaGift({ name: '' })).toBeNull()
    expect(normalizePersonaGift(null)).toBeNull()
    expect(normalizePersonaGift({ name: '[坏]|名' })?.name).toBe('坏 名')
  })

  it('dedupes by name (newest wins), caps at 60 and removes by id', () => {
    const many = Array.from({ length: 70 }, (_, index) => ({ id: `g${index}`, name: `礼物${index}`, createdAt: index + 1 }))
    expect(normalizePersonaGifts(many)).toHaveLength(PERSONA_GIFT_SHELF_MAX)
    const shelf = addPersonaGift(normalizePersonaGifts([{ id: 'a', name: '贝壳', createdAt: 1 }]), normalizePersonaGift({ id: 'b', name: '贝壳', createdAt: 2 })!)
    expect(shelf.map((item) => item.id)).toEqual(['b'])
    expect(removePersonaGift(shelf, 'b')).toEqual([])
    expect(normalizePersonaGifts('nope')).toEqual([])
  })

  it('round-trips through persona state (message gift + shelf + switch)', () => {
    const base = enablePersona(emptyPersonaState(), 'yu')
    const raw = JSON.parse(JSON.stringify({ ...base, personas: base.personas.map((p) => ({ ...p, giftsEnabled: false, customGifts: [{ id: 'a', name: '贝壳', colors: ['bad', '#000000'] }], threads: [{ ...p.threads[0], messages: [{ id: 1, role: 'assistant', text: '', createdAt: 1, gift: { id: 'a', name: '贝壳' } }, { id: 2, role: 'user', text: 'hi', createdAt: 2, gift: { id: 'x', name: '不该有' } }] }] })) }))
    const persona = normalizePersonaState(raw).personas[0]
    expect(persona.giftsEnabled).toBe(false)
    expect(persona.customGifts?.[0].colors).toEqual(hashGiftColors('贝壳'))
    expect(persona.threads[0].messages[0].gift?.name).toBe('贝壳')
    expect(persona.threads[0].messages[1].gift).toBeUndefined()
    // 老数据没有这些字段时不加
    const plain = normalizePersonaState(JSON.parse(JSON.stringify(base))).personas[0]
    expect(plain.customGifts).toBeUndefined()
    expect(plain.giftsEnabled).toBeUndefined()
  })
})

describe('提示词位置 (v231)', () => {
  const deps = {
    character: card, user: { name: '周惟惟', description: '' }, api: { baseUrl: '', apiKey: '', modelName: '' }, memoryApi: { baseUrl: '', apiKey: '', modelName: '' },
    temperature: 1, topP: 1, maxTokens: 100, streaming: false, memoryLength: 40, pastLife: () => '',
  }
  it('puts the gift rule in the stable system prompt, identical across turns, and off when disabled', () => {
    const persona = enablePersona(emptyPersonaState(), 'yu').personas[0]
    const one = buildPersonaRequest(persona, [{ id: 1, role: 'user', text: '早', createdAt: 1 }], deps, activeThread(persona))
    const two = buildPersonaRequest(persona, [{ id: 1, role: 'user', text: '早', createdAt: 1 }, { id: 2, role: 'assistant', text: '嗯', createdAt: 2 }, { id: 3, role: 'user', text: '在干嘛', createdAt: 3 }], deps, activeThread(persona))
    expect(String(one[0].content)).toContain('[自制礼物:一个emoji|礼物名|一句描述|你的附言]')
    expect(one[0].content).toEqual(two[0].content)
    expect(String(two[two.length - 1].content)).not.toContain('自制礼物')
    const off = buildPersonaRequest({ ...persona, giftsEnabled: false }, [{ id: 1, role: 'user', text: '早', createdAt: 1 }], deps, activeThread(persona))
    expect(String(off[0].content)).not.toContain('自制礼物')
    expect(buildPersonaGiftPrompt([normalizePersonaGift({ name: '贝壳', icon: '🐚' })!])).toContain('🐚贝壳')
  })

  it('tells the model about a gift it gave earlier (without the raw tag)', () => {
    const persona = enablePersona(emptyPersonaState(), 'yu').personas[0]
    const gift = personaGiftEvent(normalizePersonaGift({ id: 'a', name: '贝壳', icon: '🐚', maker: 'role' })!, 'role-to-user', '', 2, true)
    const request = buildPersonaRequest(persona, [{ id: 1, role: 'user', text: '早', createdAt: 1 }, { id: 2, role: 'assistant', text: '拿着。', createdAt: 2, gift }, { id: 3, role: 'user', text: '谢谢', createdAt: 3 }], deps, activeThread(persona))
    const assistant = request.find((item) => item.role === 'assistant')
    expect(String(assistant?.content)).toContain('拿着。\n（应用记录：你送出了自制礼物「贝壳」）')
  })
})

describe('生成一条带礼物的回复 (v231)', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  it('strips the tag, attaches the card and saves it to the shelf', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '路上看到的。\n[自制礼物:🐚|会发光的贝壳|海边捡的|别弄丢|#e8f0f1,#7ea1a8]' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })))
    setPersonaState(() => enablePersona(emptyPersonaState(), 'yu'))
    await generatePersonaReply(personaIdFor('yu'), { ...{
      character: card, user: { name: '周惟惟', description: '' }, api: { baseUrl: 'https://relay.test/v1', apiKey: 'k', modelName: 'm' }, memoryApi: { baseUrl: '', apiKey: '', modelName: '' },
      temperature: 1, topP: 1, maxTokens: 100, streaming: false, memoryLength: 40, pastLife: () => '',
    } }, { text: '你在干嘛' })
    const persona = getPersonaState().personas[0]
    const reply = persona.threads[0].messages.find((item) => item.role === 'assistant')
    expect(reply?.text).toBe('路上看到的。')
    expect(reply?.gift).toMatchObject({ name: '会发光的贝壳', icon: '🐚', note: '别弄丢', colors: ['#e8f0f1', '#7ea1a8'] })
    expect(persona.customGifts?.map((item) => item.name)).toEqual(['会发光的贝壳'])
  })
})
