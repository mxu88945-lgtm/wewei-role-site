import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Character } from './characterCard'
import {
  buildPersonaGiftPrompt, extractPersonaAssistantGift, findCatalogGift, giftCardLabel, giftTiles, hashGiftColors, makePersonaGift, normalizePersonaGift,
  normalizePersonaGiftEvent, personaGiftEvent, personaGiftHistory, personaGiftMemoryLine, personaGiftPromptText, stripPersonaGiftTag,
  PERSONA_GIFT_CATALOG, PERSONA_GIFT_CATEGORIES, PERSONA_GIFT_REQUEST_TEXT,
} from './personaGifts'
import { PHONE_GIFT_CATALOG } from './phoneGifts'
import { personaReplyText } from './personaWindowPresentation'
import { activeThread, emptyPersonaState, enablePersona, normalizePersonaState, personaIdFor } from './personaWindow'
import { personaContinuityTranscript } from './personaWindowMemory'
import { getPersonaState, setPersonaState } from './personaWindowStore'
import { buildPersonaRequest, generatePersonaReply } from './personaWindowRuntime'

const card: Character = {
  id: 'yu', name: '虞山行', tagline: '', description: '寡言护短。', personality: '', scenario: '', greeting: '',
  alternateGreetings: [], mesExample: '', creatorNotes: '', systemPrompt: '', postHistoryInstructions: '', tags: [], creator: '', characterVersion: '', regexScripts: [],
}
const baseDeps = {
  character: card, user: { name: '周惟惟', description: '' }, api: { baseUrl: '', apiKey: '', modelName: '' }, memoryApi: { baseUrl: '', apiKey: '', modelName: '' },
  temperature: 1, topP: 1, maxTokens: 100, streaming: false, memoryLength: 40, pastLife: () => '',
}

describe('礼物图鉴 (v233)', () => {
  it('has the same 20 gifts and categories as 顾祁砚, reusing the phone catalog entries', () => {
    expect(PERSONA_GIFT_CATALOG).toHaveLength(20)
    expect(PERSONA_GIFT_CATEGORIES.map((item) => item.label)).toEqual(['全部', '自制', '吃的', '花束', '日常', '珍藏', '约会', '手作'])
    for (const item of PERSONA_GIFT_CATALOG) {
      const phone = PHONE_GIFT_CATALOG.find((entry) => entry.id === item.id)!
      expect(item).toMatchObject({ name: phone.name, icon: phone.icon, colors: phone.colors })
    }
    expect(findCatalogGift('album')?.id).toBe('photo-book')
    expect(findCatalogGift('深红玫瑰')?.id).toBe('rose')
    expect(findCatalogGift('nope')).toBeUndefined()
  })

  it('grid: all = shelf + catalog, custom = shelf, else by category', () => {
    const mine = [makePersonaGift({ name: '贝壳', maker: 'user' }, 1)!]
    expect(giftTiles('all', mine)).toHaveLength(21)
    expect(giftTiles('custom', mine)).toEqual(mine)
    expect(giftTiles('flowers', mine).map((item) => item.id)).toEqual(['daisy', 'tulip', 'rose'])
  })

  it('makes her own gift with a legal color (or falls back)', () => {
    const gift = makePersonaGift({ icon: '🐚🐚🐚', name: '会发光的贝壳', subtitle: '海边捡的', colors: ['#e8f0f1', '#7ea1a8'] }, 5)!
    expect(gift).toMatchObject({ icon: '🐚🐚', name: '会发光的贝壳', maker: 'user', colors: ['#e8f0f1', '#7ea1a8'], createdAt: 5 })
    expect(makePersonaGift({ name: '信', colors: ['red', '#000000'] })!.colors).toEqual(hashGiftColors('信'))
    expect(makePersonaGift({ name: '  ' })).toBeNull()
  })
})

describe('礼物往来数据 (v233)', () => {
  it('keeps v231 role gifts working (legacy → role-to-user, handmade, made)', () => {
    const legacy = normalizePersonaGiftEvent({ id: 'made-1', name: '贝壳', icon: '🐚', colors: ['#ffffff', '#000000'], createdAt: 3, maker: 'role', note: '别丢' }, 'assistant')
    expect(legacy).toMatchObject({ giftId: 'made-1', direction: 'role-to-user', custom: true, maker: 'role', made: true, note: '别丢' })
    // her messages only take explicit user-to-role
    expect(normalizePersonaGiftEvent({ name: 'x' }, 'user')).toBeNull()
    expect(normalizePersonaGiftEvent({ name: 'x', direction: 'role-to-user' }, 'user')).toBeNull()
    const mine = normalizePersonaGiftEvent({ giftId: 'rose', direction: 'user-to-role', custom: false, colors: ['javascript:', '#000'], createdAt: 9 }, 'user')
    expect(mine).toMatchObject({ name: '深红玫瑰', icon: '🌹', custom: false, colors: findCatalogGift('rose')!.colors })
  })

  it('round-trips user gift messages through persona state', () => {
    const base = enablePersona(emptyPersonaState(), 'yu')
    const gift = personaGiftEvent(findCatalogGift('coffee')!, 'user-to-role', '少熬夜', 10)
    const raw = JSON.parse(JSON.stringify({ ...base, personas: base.personas.map((p) => ({ ...p, threads: [{ ...p.threads[0], messages: [{ id: 1, role: 'user', text: '', createdAt: 10, gift }] }] })) }))
    const message = normalizePersonaState(raw).personas[0].threads[0].messages[0]
    expect(message.gift).toEqual(gift)
  })

  it('card label says 亲手做给 only when the sender made it', () => {
    const shelfGift = makePersonaGift({ name: '贝壳', maker: 'role' })!
    expect(giftCardLabel(personaGiftEvent(shelfGift, 'role-to-user'), '虞山行', '周惟惟')).toBe('虞山行 亲手做给 周惟惟')
    expect(giftCardLabel(personaGiftEvent(shelfGift, 'user-to-role'), '周惟惟', '虞山行')).toBe('周惟惟 送给 虞山行')
    expect(giftCardLabel(personaGiftEvent(findCatalogGift('rose')!, 'user-to-role'), '周惟惟', '虞山行')).toBe('周惟惟 送给 虞山行')
  })

  it('history spans all threads, sorted, with the current thread taking precedence', () => {
    const a = personaGiftEvent(findCatalogGift('rose')!, 'user-to-role', '', 2)
    const b = personaGiftEvent(findCatalogGift('note')!, 'role-to-user', '', 1)
    const threads = [{ id: 't1', messages: [{ role: 'user', gift: a }] }, { id: 't2', messages: [{ role: 'assistant', gift: b }] }]
    expect(personaGiftHistory(threads).map((item) => item.name)).toEqual(['手写便签', '深红玫瑰'])
    expect(personaGiftHistory(threads, { id: 't1', messages: [] }).map((item) => item.name)).toEqual(['手写便签'])
  })
})

describe('TA 送礼标记 (v233)', () => {
  const shelf = [makePersonaGift({ name: '会发光的贝壳', icon: '🐚', maker: 'user' }, 1)!]
  it('parses [送礼:ID|附言] from the catalog or the shelf, by id or name', () => {
    expect(extractPersonaAssistantGift('拿着。\n[送礼:rose|不是顺手]', shelf, 5)).toMatchObject({ made: null, gift: { giftId: 'rose', name: '深红玫瑰', note: '不是顺手', direction: 'role-to-user', custom: false, createdAt: 5 } })
    expect(extractPersonaAssistantGift('【送礼：手写便签】', shelf).gift?.giftId).toBe('note')
    expect(extractPersonaAssistantGift('[送礼:会发光的贝壳|还你]', shelf).gift).toMatchObject({ giftId: shelf[0].id, custom: true, maker: 'user', note: '还你' })
    expect(extractPersonaAssistantGift('[送礼:不存在的东西|x]', shelf).gift).toBeNull()
  })

  it('[自制礼物] still works, wins, and is the one to put on the shelf; one per turn', () => {
    const result = extractPersonaAssistantGift('[送礼:rose]\n[自制礼物:🧣|围巾|织了很久|戴上]', shelf, 7)
    expect(result.made).toMatchObject({ name: '围巾', maker: 'role' })
    expect(result.gift).toMatchObject({ name: '围巾', made: true, custom: true, maker: 'role', giftId: result.made!.id, note: '戴上' })
    expect(extractPersonaAssistantGift('[送礼:rose]\n[送礼:note]', shelf).gift?.giftId).toBe('rose')
  })

  it('never shows the tags in prose, while streaming, or the event text if echoed', () => {
    expect(stripPersonaGiftTag('拿着。\n[送礼:rose|不是顺手]')).toBe('拿着。')
    expect(personaReplyText('拿着。\n【送礼：rose｜不是顺手】')).toBe('拿着。')
    expect(personaReplyText('拿着。\n[送礼:不存在]')).toBe('拿着。')
    expect(personaReplyText('等一下\n[送礼:ro')).toBe('等一下')
    expect(personaReplyText('等一下\n[送')).toBe('等一下')
    expect(personaReplyText('🎁 礼物事件｜周惟惟送给虞山行「深红玫瑰」（不是顺手）\n附言：嗯\n收到了。')).toBe('收到了。')
    expect(personaReplyText('嗯。\n（应用记录：你送出了礼物「深红玫瑰」）')).toBe('嗯。')
  })
})

describe('提示词 (v233)', () => {
  it('her gift goes to the model as 🎁 礼物事件 text; his as an app record', () => {
    const persona = enablePersona(emptyPersonaState(), 'yu').personas[0]
    const mine = personaGiftEvent(findCatalogGift('coffee')!, 'user-to-role', '少熬夜', 1)
    const his = personaGiftEvent(findCatalogGift('rose')!, 'role-to-user', '', 2)
    const request = buildPersonaRequest(persona, [{ id: 1, role: 'user', text: '', createdAt: 1, gift: mine }, { id: 2, role: 'assistant', text: '……谢了。', createdAt: 2, gift: his }, { id: 3, role: 'user', text: '喜欢吗', createdAt: 3 }], baseDeps, activeThread(persona))
    const user = request.find((item) => item.role === 'user')
    expect(String(user?.content)).toContain('🎁 礼物事件｜周惟惟送给虞山行「手冲咖啡」（给还不肯休息的人）\n附言：少熬夜')
    expect(String(request.find((item) => item.role === 'assistant')?.content)).toContain('（应用记录：你送出了礼物「深红玫瑰」）')
  })

  it('lives in the first system, stable across turns, changes only when gifts change', () => {
    const persona = enablePersona(emptyPersonaState(), 'yu').personas[0]
    const one = buildPersonaRequest(persona, [{ id: 1, role: 'user', text: '早', createdAt: 1 }], baseDeps, activeThread(persona))
    const two = buildPersonaRequest(persona, [{ id: 1, role: 'user', text: '早', createdAt: 1 }, { id: 2, role: 'assistant', text: '嗯', createdAt: 2 }, { id: 3, role: 'user', text: '在干嘛', createdAt: 3 }], baseDeps, activeThread(persona))
    expect(String(one[0].content)).toContain('[送礼:礼物ID|你的附言]')
    expect(String(one[0].content)).toContain('rose=深红玫瑰')
    expect(String(one[0].content)).toContain('周惟惟可以把礼物卡送给你')
    expect(one[0].content).toEqual(two[0].content)
    expect(String(two[two.length - 1].content)).not.toContain('送礼')
    const withShelf = { ...persona, customGifts: [makePersonaGift({ name: '贝壳', icon: '🐚', maker: 'user' }, 1)!] }
    expect(String(buildPersonaRequest(withShelf, [{ id: 1, role: 'user', text: '早', createdAt: 1 }], baseDeps, activeThread(persona))[0].content)).toContain('🐚贝壳（周惟惟做的）')
  })

  it('off: no sending instructions, but she can still give and history stays', () => {
    const prompt = buildPersonaGiftPrompt([], [personaGiftEvent(findCatalogGift('rose')!, 'user-to-role', '给你', new Date(2026, 10, 13).getTime())], { enabled: false })
    expect(prompt).not.toContain('[送礼')
    expect(prompt).not.toContain('自制礼物')
    expect(prompt).toContain('2026-11-13：{{user}}送你🌹「深红玫瑰」，附言“给你”')
  })

  it('summaries / recall see a plain gift line with no tag', () => {
    const gift = personaGiftEvent(findCatalogGift('rose')!, 'role-to-user', '特意的', 1)
    const transcript = personaContinuityTranscript([{ id: 1, role: 'assistant', text: '拿着。\n[送礼:rose|特意的]', createdAt: 1, gift }], { char: '虞山行', user: '周惟惟' })
    expect(transcript).toBe(`[1] 虞山行：拿着。\n${personaGiftMemoryLine(gift)}`)
    expect(transcript).not.toContain('[送礼')
    expect(personaGiftPromptText(personaGiftEvent(makePersonaGift({ name: '贝壳', maker: 'user' })!, 'user-to-role'), '周惟惟', '虞山行')).toContain('周惟惟亲手做的')
  })
})

describe('生成 (v233)', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  const live = { ...baseDeps, api: { baseUrl: 'https://relay.test/v1', apiKey: 'k', modelName: 'm' } }
  const reply = (content: string) => vi.fn(async (_url: unknown, init?: RequestInit) => { void init; return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } }) })

  it('her gift becomes a user message with the card, and the model gets the event text', async () => {
    const fetchMock = reply('……谢了。')
    vi.stubGlobal('fetch', fetchMock)
    setPersonaState(() => enablePersona(emptyPersonaState(), 'yu'))
    const gift = personaGiftEvent(findCatalogGift('scarf')!, 'user-to-role', '别冻着', 100)
    await generatePersonaReply(personaIdFor('yu'), live, { gift })
    const messages = getPersonaState().personas[0].threads[0].messages
    expect(messages[0]).toMatchObject({ role: 'user', text: '', gift: { giftId: 'scarf', note: '别冻着' } })
    expect(messages[1].text).toBe('……谢了。')
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(JSON.stringify(body.messages)).toContain('🎁 礼物事件｜周惟惟送给虞山行「米色围巾」')
  })

  it('[送礼] from the catalog attaches a card without touching the shelf; regenerating keeps the shelf', async () => {
    vi.stubGlobal('fetch', reply('给你。\n[送礼:daisy|晒过太阳的]'))
    setPersonaState(() => enablePersona(emptyPersonaState(), 'yu'))
    await generatePersonaReply(personaIdFor('yu'), live, { text: PERSONA_GIFT_REQUEST_TEXT })
    let persona = getPersonaState().personas[0]
    const answer = persona.threads[0].messages.find((item) => item.role === 'assistant')
    expect(answer?.text).toBe('给你。')
    expect(answer?.gift).toMatchObject({ giftId: 'daisy', note: '晒过太阳的', direction: 'role-to-user' })
    expect(persona.customGifts).toBeUndefined()
    // 自制的那份在重新生成时收回
    vi.stubGlobal('fetch', reply('[自制礼物:🧣|围巾|织的|戴上]'))
    await generatePersonaReply(personaIdFor('yu'), live, { regenerate: true })
    persona = getPersonaState().personas[0]
    expect(persona.customGifts?.map((item) => item.name)).toEqual(['围巾'])
    vi.stubGlobal('fetch', reply('算了。'))
    await generatePersonaReply(personaIdFor('yu'), live, { regenerate: true })
    expect(getPersonaState().personas[0].customGifts || []).toEqual([])
  })

  it('switch off: tags are hidden but no gift is given', async () => {
    vi.stubGlobal('fetch', reply('给你。\n[送礼:daisy]'))
    setPersonaState(() => { const state = enablePersona(emptyPersonaState(), 'yu'); return { ...state, personas: state.personas.map((p) => ({ ...p, giftsEnabled: false })) } })
    await generatePersonaReply(personaIdFor('yu'), live, { text: '在吗' })
    const answer = getPersonaState().personas[0].threads[0].messages.find((item) => item.role === 'assistant')
    expect(answer?.text).toBe('给你。')
    expect(answer?.gift).toBeUndefined()
  })
})

describe('兼容 (v233)', () => {
  it('normalizePersonaGift unchanged for v231 shelves', () => {
    expect(normalizePersonaGift({ name: '旧' }, 1)).toMatchObject({ maker: 'role', subtitle: 'TA 亲手做的' })
  })
})
