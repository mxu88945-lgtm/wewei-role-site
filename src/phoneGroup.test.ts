import { describe, expect, it } from 'vitest'
import { normalizeStoredCharacter } from './characterCard'
import type { Conversation } from './conversationLifecycle'
import { buildPhoneArchive, buildPhoneGroupBackground, buildGroupDmPeek, phoneBindingCandidates, phoneCharacter, phoneModeRules } from './phoneGroup'

const xie = normalizeStoredCharacter({ id: 'xie', name: '谢聿衡', description: '临江谢氏掌权人，婚内出轨。', personality: '自负冷硬。', scenario: '婚姻破裂。', greeting: '<scene>夜</scene>你来了', systemPrompt: '永不出戏', beautificationProtocol: '<gts_status>', characterBook: { name: 'b', entries: [{ id: 1, keys: ['栖澜公馆'], content: '谢家的顶层复式。', comment: '栖澜公馆', enabled: true }] } as never })
const gu = normalizeStoredCharacter({ id: 'gu', name: '顾祁砚', description: '另一个故事的男主。' })
const chat = (id: string, characterId: string, extra: Partial<Conversation> = {}) => ({ id, characterId, title: id, messages: [{ id: 1, role: 'assistant', text: '<scene>夜</scene>你回来了' }, { id: 2, role: 'user', text: '嗯' }], createdAt: 0, updatedAt: 1, ...extra }) as Conversation

describe('group speaker private DM continuity', () => {
  const dm = (id: string, characterId: string, text: string, extra: Partial<Conversation> = {}) => chat(id, characterId, { kind: 'group', participantIds: [characterId], phone: { dm: true, bindings: {} }, messages: [{ id: 1, role: 'user', text }, { id: 2, role: 'assistant', characterId, text: '我记住了。' }], ...extra })

  it('injects only the speaking member’s own DM; every other member receives their own private context', () => {
    const conversations = [dm('xie-dm', 'xie', '私下答应给你留位置'), dm('gu-dm', 'gu', '明天陪我看电影'), chat('public', 'xie', { participantIds: ['xie', 'gu'], phone: { bindings: {} }, messages: [{ id: 1, role: 'user', text: '群里的公开消息' }] })]
    const xiePeek = buildGroupDmPeek(conversations, 'xie', '谢聿衡', '惟惟')
    expect(xiePeek).toContain('惟惟：私下答应给你留位置')
    expect(xiePeek).toContain('谢聿衡：我记住了。')
    expect(xiePeek).not.toContain('明天陪我看电影')
    expect(xiePeek).not.toContain('群里的公开消息')
    expect(buildGroupDmPeek(conversations, 'gu', '顾祁砚', '惟惟')).toContain('明天陪我看电影')
    expect(buildGroupDmPeek(conversations, 'gu', '顾祁砚', '惟惟')).not.toContain('私下答应给你留位置')
    expect(buildGroupDmPeek(conversations, 'new', '新人', '惟惟')).toBe('')
  })

  it('uses the latest own DM and retains valid earlier summary', () => {
    const conversations = [dm('old', 'xie', '旧窗口的私聊', { updatedAt: 1 }), dm('current', 'xie', '最新私聊', { updatedAt: 2, contextSummary: '约好不公开旧事', historyRevision: 3, contextSummaryRevision: 3 }), dm('not-private', 'xie', '混入别人的私聊', { updatedAt: 3, participantIds: ['xie', 'gu'] })]
    const peek = buildGroupDmPeek(conversations, 'xie', '谢聿衡', '惟惟')
    expect(peek).toContain('最新私聊')
    expect(peek).toContain('约好不公开旧事')
    expect(peek).not.toContain('旧窗口的私聊')
    expect(peek).not.toContain('混入别人的私聊')
    expect(conversations[0].messages[0].text).toBe('旧窗口的私聊')
  })

  it('does not carry failed notices, model analysis, other speakers or obsolete summaries into a group turn', () => {
    const source = dm('current', 'xie', '私聊原话', { historyRevision: 2, contextSummaryRevision: 1, contextSummary: '已回滚的旧结论', messages: [
      { id: 1, role: 'user', text: '私聊原话' },
      { id: 2, role: 'assistant', characterId: 'xie', text: '<think>内部推理。</think>我的回复。' },
      { id: 3, role: 'assistant', text: '连接失败', phoneNotice: true },
      { id: 4, role: 'assistant', characterId: 'gu', text: '其他人的私人回复' },
      { id: 5, role: 'assistant', characterId: 'xie', text: '正在连接模型…' },
    ] })
    const peek = buildGroupDmPeek([source], 'xie', '谢聿衡', '惟惟')
    expect(peek).toContain('我的回复。')
    expect(peek).not.toMatch(/内部推理|连接失败|其他人的私人回复|正在连接模型|已回滚的旧结论/)
    expect(buildGroupDmPeek([dm('empty', 'xie', '', { messages: [] })], 'xie', '谢聿衡', '惟惟')).toBe('')
  })
})

describe('phone group', () => {
  it('request history keeps the latest turns and quotes without changing saved messages or including failed notices', async () => {
    const { phonePromptHistory } = await import('./phoneGroup')
    const saved = Array.from({ length: 50 }, (_, index) => ({ id: index, role: 'user' as const, text: `消息${index}` }))
    const quote = { messageId: '10', author: '谢聿衡', text: '你说什么？' }
    const recent: Conversation['messages'] = [...saved, { id: 50, role: 'assistant', text: '⚠️没连上', phoneNotice: true }, { id: 51, role: 'assistant', text: '沈衍人设立场与反应分析：\n不能显示。' }, { id: 52, role: 'assistant', text: '<think>不显示。</think>正常消息。' }, { id: 53, role: 'user', text: '我回复这条', quote }]
    const history = phonePromptHistory(recent, 100)
    expect(history).toHaveLength(24)
    expect(history[0].text).toBe('消息28')
    expect(history[history.length - 2]?.text).toBe('正常消息。')
    expect(history[history.length - 1]?.quote).toEqual(quote)
    expect(history.map((message) => message.text).join('\n')).not.toMatch(/分析|没连上|<think>/)
    expect(recent).toHaveLength(54)
    expect(recent[52].text).toContain('<think>')
  })
  it('drops story-mode output rules but keeps the persona', () => {
    const card = phoneCharacter(xie)
    expect(card.description).toContain('婚内出轨')
    expect(card.greeting).toBe('')
    expect(card.systemPrompt).toBe('')
    expect(card.beautificationProtocol).toBe('')
    expect(card.regexScripts).toEqual([])
  })

  it('pastes every member background and world into the shared world', () => {
    const world = buildPhoneGroupBackground([xie, gu])
    expect(world).toContain('【谢聿衡')
    expect(world).toContain('婚内出轨')
    expect(world).toContain('栖澜公馆：谢家的顶层复式。')
    expect(world).toContain('【顾祁砚')
  })

  it('builds archives with own story marked and lookup etiquette', () => {
    const archive = buildPhoneArchive([
      { character: xie, conversation: chat('谢聿衡_苏苒', 'xie', { contextSummary: '裴以沫离开了他。' }), characterMemories: [{ title: '戒指', content: '两枚白金戒圈' }], longMemories: [] },
      { character: gu, conversation: undefined, characterMemories: [], longMemories: [] },
    ], 'xie', '惟惟', () => '谢聿衡')
    expect(archive).toContain('这是你自己演过的戏')
    expect(archive).toContain('裴以沫离开了他')
    expect(archive).toContain('戒指：两枚白金戒圈')
    expect(archive).toContain('互相公开')
    expect(archive).not.toContain('<scene>')
  })

  it('rules ask for short chat lines and no tags', () => {
    const rules = phoneModeRules('谢聿衡', ['谢聿衡', '顾祁砚'], '惟惟')
    expect(rules).toContain('微信')
    expect(rules).toContain('不输出 <scene>')
  })

  it('offers only real past chats with that card as bindings, newest first', () => {
    const list = [chat('a', 'xie', { updatedAt: 1 }), chat('b', 'gu'), chat('c', 'gu', { kind: 'group', participantIds: ['gu', 'xie'], updatedAt: 5 }), chat('p', 'xie', { phone: { bindings: {} } })]
    expect(phoneBindingCandidates(list, 'xie').map((c) => c.id)).toEqual(['c', 'a'])
  })
})

describe('phone output and turn taking', () => {
  it('streams complete chat sentences before completion but never partial reasoning', async () => {
    const { phoneStreamPreview } = await import('./phoneGroup')
    expect(phoneStreamPreview('你最喜欢')).toBe('')
    expect(phoneStreamPreview('你最喜欢谁？\n先说清楚')).toBe('你最喜欢谁？')
    expect(phoneStreamPreview('我看你就是欠管。少跟他们起哄')).toBe('我看你就是欠管。')
    const reasoning = '沈衍人设立场与反应分析：\n1. 她说她最喜欢谁。\n2. 语言风格：低沉。'
    for (let length = 1; length <= reasoning.length; length += 1) {
      expect(phoneStreamPreview(reasoning.slice(0, length))).toBe('')
    }
    expect(phoneStreamPreview(`${reasoning}\n最终回复：你最喜欢谁？\n说来听听`)).toBe('你最喜欢谁？')
    expect(phoneStreamPreview('<think>她这句话该怎么回？')).toBe('')
    expect(phoneStreamPreview('别熬夜。\n<gts_status>内心：别让她听出来。')).toBe('别熬夜。')
    expect(phoneStreamPreview('```analysis\n她最喜欢谁？')).toBe('')
    expect(phoneStreamPreview('去吃饭。\n【锁屏 30分钟：先吃饭。')).toBe('去吃饭。')
  })

  it('strips status panels, scene tags and inner-thought lines', async () => {
    const { cleanPhoneOutput } = await import('./phoneGroup')
    expect(cleanPhoneOutput('嗓子不舒服？\n有什么指示直接说。\n<gts_status>对你的态度：……｜内心：别让她听出来</gts_status>')).toBe('嗓子不舒服？\n有什么指示直接说。')
    expect(cleanPhoneOutput('<scene>栖澜公馆</scene>滚。\n内心：她怎么知道')).toBe('滚。')
  })

  it('blocks untagged persona analysis and keeps only an explicitly marked final message', async () => {
    const { cleanPhoneOutput, containsPhoneReasoning } = await import('./phoneGroup')
    const leaked = '沈衍人设立场与反应分析：\n\n1. 周惟惟说：吃了白饭。\n2. 沈衍视角：她又不听话。\n3. 语言风格：短句、低沉。'
    expect(containsPhoneReasoning(leaked)).toBe(true)
    expect(cleanPhoneOutput(leaked)).toBe('')
    expect(cleanPhoneOutput(`${leaked}\n\n最终回复：\n吃完就好。\n今晚不准再熬。`)).toBe('吃完就好。\n今晚不准再熬。')
    expect(cleanPhoneOutput('我看你就是欠管。\n少跟他们一起起哄。')).toBe('我看你就是欠管。\n少跟他们一起起哄。')
  })

  it('picks natural repliers and chatters without the last speaker first', async () => {
    const { pickPhoneChatters, pickPhoneRepliers } = await import('./phoneGroup')
    const ids = ['xie', 'fu', 'shen', 'yu']
    const repliers = pickPhoneRepliers(ids, 'xie', '咳咳', () => 0.3)
    expect(repliers).toHaveLength(2)
    expect(repliers).not.toContain('xie')
    expect(pickPhoneRepliers(ids, undefined, '你们都在吗', () => 0.3)).toHaveLength(3)
    const chatters = pickPhoneChatters(ids, 'fu', () => 0.9)
    expect(chatters.length).toBe(3)
    expect(chatters[0]).not.toBe('fu')
    expect(new Set(chatters).size).toBe(chatters.length)
  })
})

describe('phone reply modes', () => {
  const people = [{ id: 'xie', name: '谢聿衡' }, { id: 'fu', name: '傅承砚' }, { id: 'shen', name: '沈衍' }]
  const ids = people.map((p) => p.id)
  it('点名 answers @ and plain names, including given names', async () => {
    const { findNamedParticipantIds, selectPhoneSpeakers } = await import('./phoneGroup')
    const named = findNamedParticipantIds('聿衡你过来，沈衍也是', people)
    expect(named).toEqual(['xie', 'shen'])
    expect(selectPhoneSpeakers({ mode: 'named', participantIds: ids, mentionedIds: [], namedIds: named, text: '' }).slice(0, 2)).toEqual(['xie', 'shen'])
    const all = selectPhoneSpeakers({ mode: 'all', participantIds: ids, mentionedIds: [], namedIds: ['shen'], text: '', random: () => 0 })
    expect(all[0]).toBe('shen')
    expect([...all].sort()).toEqual([...ids].sort())
  })
  it('只@ ignores plain names; 自由聊 adds one more voice to named people', async () => {
    const { selectPhoneSpeakers } = await import('./phoneGroup')
    expect(selectPhoneSpeakers({ mode: 'at', participantIds: ids, mentionedIds: ['fu'], namedIds: ['xie'], text: '' })).toEqual(['fu'])
    const free = selectPhoneSpeakers({ mode: 'free', participantIds: ids, mentionedIds: [], namedIds: ['xie'], text: '', random: () => 0 })
    expect(free[0]).toBe('xie')
    expect(free).toHaveLength(2)
    expect(selectPhoneSpeakers({ mode: 'free', participantIds: ids, mentionedIds: [], namedIds: [], text: '咳咳', random: () => 0 })).toHaveLength(2)
  })
})

describe('cleanPhoneOutput status leaks', () => {
  it('drops copied status monitors and field lines but keeps chat', async () => {
    const { cleanPhoneOutput } = await import('./phoneGroup')
    const raw = '大清早挺热闹。\n@周惟惟 别催她。\n<monitor>STATUS MONITOR // SHEN YAN\n沈衍当前状态：心境：自持</monitor>\n傅承砚：衣着：深灰西装｜状态：已完成本轮回应｜内心想法：尽兴\nSTATUS MONITOR // SHEN YAN\n心境：欲望浓烈｜衣着：黑色衬衫'
    expect(cleanPhoneOutput(raw)).toBe('大清早挺热闹。\n@周惟惟 别催她。')
    expect(cleanPhoneOutput('今天周末，你们谁也别催她。')).toBe('今天周末，你们谁也别催她。')
  })
})

describe('phone display has no card status', () => {
  it('MessageContent noStatus skips card status fallback', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server')
    const React = await import('react')
    const { default: MessageContent } = await import('./MessageContent')
    const character = normalizeStoredCharacter({ id: 'c', name: '沈衍', systemPrompt: '每轮末尾输出 <sy_status>心境：自持｜衣着：黑衬衫</sy_status>', regexScripts: [] } as never)
    const html = renderToStaticMarkup(React.createElement(MessageContent, { text: '散心就免了。', role: 'assistant', character, userName: '周惟惟', noStatus: true }))
    expect(html).not.toContain('status')
    expect(html).toContain('散心就免了')
  })
})

describe('情境发言 parsing', () => {
  it('keeps the order the model named', async () => {
    const { parseSmartPick, pickPhoneChatters } = await import('./phoneGroup')
    const people = [{ id: 'xie', name: '谢聿衡' }, { id: 'fu', name: '傅承砚' }, { id: 'shen', name: '沈衍' }]
    expect(parseSmartPick('沈衍、谢聿衡', people)).toEqual(['shen', 'xie'])
    expect(parseSmartPick('没人', people)).toEqual([])
    expect(pickPhoneChatters(['a', 'b', 'c', 'd'], 'a', () => 0, true)).toHaveLength(4)
  })
})

describe('buildPhoneRealWorldNote', () => {
  it('includes local time and fresh weather', async () => {
    const { buildPhoneRealWorldNote } = await import('./phoneGroup')
    const now = new Date(2026, 9, 14, 23, 30)
    const note = buildPhoneRealWorldNote(now, { temp: 24, code: 61, high: 28, low: 22, at: now.getTime() - 60_000 })
    expect(note).toContain('23:30')
    expect(note).toContain('深夜')
    expect(note).toContain('雨，24°C')
  })
  it('drops stale weather', async () => {
    const { buildPhoneRealWorldNote } = await import('./phoneGroup')
    const now = new Date(2026, 9, 14, 9, 5)
    expect(buildPhoneRealWorldNote(now, { temp: 24, code: 0, high: 28, low: 22, at: now.getTime() - 4 * 3600_000 })).not.toContain('天气：')
  })
})

describe('phone lock', () => {
  it('parses and strips lock command', async () => {
    const { parsePhoneLockCommand, cleanPhoneOutput } = await import('./phoneGroup')
    const parsed = parsePhoneLockCommand('去吃饭。\n【锁屏 40分钟：先吃饭】')
    expect(parsed).toEqual({ text: '去吃饭。', minutes: 40, reason: '先吃饭' })
    expect(parsePhoneLockCommand('【锁屏 999】')?.minutes).toBe(120)
    expect(cleanPhoneOutput('好\n【锁屏 10分钟】')).toBe('好')
    expect(parsePhoneLockCommand('没有锁')).toBeNull()
  })
  it('reports breach for 15 minutes', async () => {
    const { buildPhoneLockBreachNote } = await import('./phoneGroup')
    const breach = { at: 1000, byName: '顾祁砚', remainingMinutes: 30, reason: '吃饭' }
    expect(buildPhoneLockBreachNote(breach, 1000 + 60000, '周惟惟')).toContain('提前 30 分钟')
    expect(buildPhoneLockBreachNote(breach, 1000 + 16 * 60000, '周惟惟')).toBe('')
  })
})

describe('phone dm', () => {
  it('peeks only at the groups the character is in, never other dms', async () => {
    const { buildDmGroupPeek, phoneDmRules } = await import('./phoneGroup')
    const groups = [
      { title: '群A', participantIds: ['a', 'b'], phone: {}, messages: [{ role: 'user', text: '在吗' }, { role: 'assistant', characterId: 'b', text: '<b>在</b>' }] },
      { title: '群B', participantIds: ['b'], phone: {}, messages: [{ role: 'user', text: '秘密' }] },
      { title: 'a的私聊', participantIds: ['a'], phone: { dm: true }, messages: [{ role: 'user', text: '私聊内容' }] },
    ]
    const peek = buildDmGroupPeek(groups, 'a', (message) => message.role === 'user' ? '周' : message.characterId || '?')
    expect(peek).toContain('「群A」')
    expect(peek).toContain('b： 在 '.trim().slice(0, 2))
    expect(peek).not.toContain('秘密')
    expect(peek).not.toContain('私聊内容')
    expect(buildDmGroupPeek([], 'a', () => '')).toBe('')
    expect(phoneDmRules('沈衍', '周')).toContain('私聊')
  })
})

describe('phone group toggles and story-update alerts', () => {
  it('omits the quit and kick rules when disabled and renumbers', async () => {
    const { phoneModeRules } = await import('./phoneGroup')
    const all = phoneModeRules('谢聿衡', ['谢聿衡', '顾祁砚'], '惟惟')
    expect(all).toContain('8. 退群权')
    expect(all).toContain('9. 投票踢人')
    const noQuit = phoneModeRules('谢聿衡', ['谢聿衡'], '惟惟', { allowQuit: false })
    expect(noQuit).not.toContain('退群')
    expect(noQuit).toContain('8. 投票踢人')
    const noKick = phoneModeRules('谢聿衡', ['谢聿衡'], '惟惟', { allowKick: false })
    expect(noKick).not.toContain('踢人')
    expect(noKick).toContain('8. 退群权')
    const none = phoneModeRules('谢聿衡', ['谢聿衡'], '惟惟', { allowQuit: false, allowKick: false, allowForumShare: false })
    expect(none).not.toMatch(/退群|踢人|转发论坛|\n8\./)
    expect(phoneModeRules('谢聿衡', ['谢聿衡'], '惟惟', { allowQuit: false, allowKick: false })).toContain('8. 转发论坛')
    expect(none).toContain('7. 锁屏权')
  })

  it('strips quit and kick tags without effects', async () => {
    const { stripPhoneQuitTag, stripPhoneKickTag } = await import('./phoneGroup')
    expect(stripPhoneQuitTag('受不了了\n【退群：烦死了】')).toBe('受不了了')
    expect(stripPhoneKickTag('他太过分\n【踢人：顾祁砚：刷屏】')).toBe('他太过分')
  })

  it('records the first sighting silently, then alerts on growth', async () => {
    const { computeStoryUpdates } = await import('./phoneGroup')
    const counts: Record<string, number> = { c1: 10, c2: 4 }
    const first = computeStoryUpdates({ xie: 'c1', gu: 'c2' }, undefined, (id) => counts[id])
    expect(first.updates).toEqual([])
    expect(first.seen).toEqual({ xie: 10, gu: 4 })
    expect(first.changed).toBe(true)
    counts.c1 = 13
    const next = computeStoryUpdates({ xie: 'c1', gu: 'c2' }, first.seen, (id) => counts[id])
    expect(next.updates).toEqual([{ characterId: 'xie', count: 3 }])
    expect(next.seen).toEqual({ xie: 13, gu: 4 })
    const same = computeStoryUpdates({ xie: 'c1', gu: 'c2' }, next.seen, (id) => counts[id])
    expect(same.changed).toBe(false)
    counts.c2 = 2
    const shrunk = computeStoryUpdates({ xie: 'c1', gu: 'c2' }, next.seen, (id) => counts[id])
    expect(shrunk.updates).toEqual([])
    expect(shrunk.seen.gu).toBe(2)
    expect(computeStoryUpdates({ xie: 'c1', gu: 'missing' }, next.seen, (id) => counts[id]).seen).toEqual({ xie: 13 })
  })

  it('resets storySeen for members whose binding changed', async () => {
    const { resetStorySeenForBindingChanges } = await import('./phoneGroup')
    expect(resetStorySeenForBindingChanges({ xie: 5, gu: 7, lin: 2 }, { xie: 'a', gu: 'b', lin: 'c' }, { xie: 'a', gu: 'z' })).toEqual({ xie: 5 })
  })

  it('builds the notice line, prompt note and smart-pick hint', async () => {
    const { storyUpdateNotice, buildStoryUpdateNote, buildSmartPickPrompt } = await import('./phoneGroup')
    expect(storyUpdateNotice('谢聿衡', 3)).toBe('📖 谢聿衡的剧情更新了 3 条')
    const note = buildStoryUpdateNote([{ name: '谢聿衡', count: 3 }])
    expect(note).toContain('【剧情刚更新】谢聿衡的长剧情刚更新了 3 条')
    expect(note).toContain('不必每个人都提')
    expect(buildSmartPickPrompt(['谢聿衡'], [], '惟惟', '在吗', [], ['谢聿衡'])).toContain('剧情刚更新：谢聿衡')
    expect(buildSmartPickPrompt(['谢聿衡'], [], '惟惟', '在吗')).not.toContain('剧情刚更新')
  })

  it('keeps notice messages out of the DM group peek', async () => {
    const { buildDmGroupPeek } = await import('./phoneGroup')
    const peek = buildDmGroupPeek([{ title: '群', participantIds: ['xie'], phone: {}, messages: [{ role: 'assistant', text: '📖 谢聿衡的剧情更新了 3 条', phoneNotice: true }, { role: 'user', text: '晚上好' }] }], 'xie', () => '惟惟')
    expect(peek).toContain('晚上好')
    expect(peek).not.toContain('📖')
  })
})

import { parseMicAnswer } from './phoneGroup'
describe('parseMicAnswer', () => {
  it('reads 接 / 不接', () => {
    expect(parseMicAnswer('不接')).toBeNull()
    expect(parseMicAnswer('接：怼沈衍一句')).toEqual({ hint: '怼沈衍一句' })
    expect(parseMicAnswer('接')).toEqual({ hint: '' })
    expect(parseMicAnswer('<think>嗯</think>\n不接')).toBeNull()
    expect(parseMicAnswer('我觉得')).toBeNull()
  })
})

describe('phone place', () => {
  it('adds the located place to the real-world note', async () => {
    const { buildPhoneRealWorldNote, joinPlace, shortPlace } = await import('./phoneGroup')
    const now = new Date(2026, 9, 15, 20, 30)
    expect(joinPlace(['广东省', '潮州市', '湘桥区'])).toBe('广东省潮州市湘桥区')
    expect(joinPlace(['北京市', '北京市', '朝阳区'])).toBe('北京市朝阳区')
    expect(shortPlace('广东省潮州市湘桥区')).toBe('湘桥区')
    expect(buildPhoneRealWorldNote(now, { temp: 24, code: 0, high: 28, low: 22, place: '广东省潮州市湘桥区', at: now.getTime() })).toContain('用户现在在：广东省潮州市湘桥区')
  })
})

describe('traditional place names', () => {
  it('simplifies 湘橋區', async () => {
    const { joinPlace, shortPlace } = await import('./phoneGroup')
    expect(shortPlace('广东省潮州市湘橋區')).toBe('湘桥区')
    expect(joinPlace(['广东省', '潮州市', '湘橋區'])).toBe('广东省潮州市湘桥区')
  })
})

describe('buildBackstageNote', () => {
  it('gives the story character his own DM and groups, framed as private knowledge', async () => {
    const { buildBackstageNote } = await import('./phoneGroup')
    const base = { updatedAt: 1, createdAt: 1, characterId: 'a' } as never as object
    const conversations = [
      { ...base, id: 'dm-a', title: 'A', phone: { dm: true, bindings: {} }, participantIds: ['a'], messages: [{ id: 1, role: 'user', text: '头好疼' }, { id: 2, role: 'assistant', characterId: 'a', text: '去躺着' }] },
      { ...base, id: 'dm-b', title: 'B', phone: { dm: true, bindings: {} }, participantIds: ['b'], messages: [{ id: 1, role: 'user', text: 'B的秘密' }] },
      { ...base, id: 'g', title: '群', phone: { bindings: {} }, participantIds: ['a', 'b'], messages: [{ id: 1, role: 'assistant', characterId: 'b', text: '发红包' }] },
    ] as never
    const note = buildBackstageNote(conversations, 'a', '傅承砚', '周惟惟', (id) => id === 'b' ? '陆屿' : '傅承砚')
    expect(note).toContain('戏里绝不提')
    expect(note).toContain('头好疼')
    expect(note).toContain('陆屿：发红包')
    expect(note).not.toContain('B的秘密')
    expect(buildBackstageNote([] as never, 'a', '傅承砚', '周惟惟', () => '')).toBe('')
  })
})

describe('v122 group count + perspective leak', () => {
  it('replaces hand-written member count with live count', async () => {
    const { phoneGroupDisplayTitle } = await import('./phoneGroup')
    expect(phoneGroupDisplayTitle('型男靓女中心（11 人）', 13)).toBe('型男靓女中心（13）')
    expect(phoneGroupDisplayTitle('型男靓女中心(11)', 13)).toBe('型男靓女中心（13）')
    expect(phoneGroupDisplayTitle('整改中心', 3)).toBe('整改中心（3）')
  })
  it('treats 【X视角】 analysis as reasoning', async () => {
    const { containsPhoneReasoning, cleanPhoneOutput } = await import('./phoneGroup')
    const leak = '【谢聿衡视角】\n现在情况：\n- 真实时间：21:40\n- 态度与反应：\n- 被戳中软肋'
    expect(containsPhoneReasoning(leak)).toBe(true)
    expect(cleanPhoneOutput(leak)).toBe('')
    expect(containsPhoneReasoning('现在情况：周惟惟笑得不行')).toBe(true)
    expect(containsPhoneReasoning('现在几点了？')).toBe(false)
  })
})

describe('v124 dm peek and reasoning leak', () => {
  it('keeps her earlier group lines and the group summary in dm peek', async () => {
    const { buildDmGroupPeek } = await import('./phoneGroup')
    const messages = [{ role: 'user', text: '早饭吃了砂锅粥' }, ...Array.from({ length: 20 }, (_, i) => ({ role: 'assistant', characterId: 'b', text: `闲聊${i}` }))]
    const peek = buildDmGroupPeek([{ title: '群', participantIds: ['a', 'b'], phone: {}, messages, contextSummary: '大家劝她喝温水', contextSummaryRevision: 0, historyRevision: 0 }], 'a', (m) => m.role === 'user' ? '周' : 'b')
    expect(peek).toContain('早饭吃了砂锅粥')
    expect(peek).toContain('大家劝她喝温水')
  })
  it('flags the 看用户输入 style leak', async () => {
    const { containsPhoneReasoning } = await import('./phoneGroup')
    expect(containsPhoneReasoning('看用户输入：“群里不是说我吃了什么嘛～”')).toBe(true)
    expect(containsPhoneReasoning('用户在私聊里问谢聿衡：吃了什么')).toBe(true)
    expect(containsPhoneReasoning('早上好呀，吃了吗')).toBe(false)
  })
})

describe('v125 backstage pinned groups', () => {
  it('prefers pinned groups over recently active ones', async () => {
    const { buildBackstageNote } = await import('./phoneGroup')
    const mk = (id: string, title: string, updatedAt: number) => ({ id, title, updatedAt, participantIds: ['a'], phone: { bindings: {} }, messages: [{ id: 1, role: 'user', text: `${title}的话` }] })
    const convs = [mk('g1', '老群', 1), mk('g2', '新群', 3), mk('g3', '更新群', 2)] as never
    const auto = buildBackstageNote(convs, 'a', 'A', '周', () => 'A')
    expect(auto).toContain('新群'); expect(auto).not.toContain('老群')
    const pinned = buildBackstageNote(convs, 'a', 'A', '周', () => 'A', ['g1'])
    expect(pinned).toContain('老群'); expect(pinned).toContain('新群'); expect(pinned).not.toContain('「更新群」')
  })
})

describe('v131 offstage AI identity', () => {
  it('frames members as offstage AIs whose persona is background, not a shackle', async () => {
    const { phoneModeRules, phoneDmRules } = await import('./phoneGroup')
    for (const text of [phoneModeRules('沈衍', ['沈衍'], '周导'), phoneDmRules('沈衍', '周导')]) {
      expect(text).toContain('戏外')
      expect(text).toContain('不是戏外的枷锁')
      expect(text).not.toContain('保持人设、语气和脾气')
    }
  })
})

describe('v132 untitled plan drafts are stripped', () => {
  it('drops the 态度/bullet draft before the real message', async () => {
    const { cleanPhoneOutput } = await import('./phoneGroup')
    const raw = ['沈衍的动作被规则限定，但他嘴上在群里聊戏可从不认输。', '周惟惟抓住了戏里沈衍最大的痛脚。', '双标、控制欲、破防的逻辑。', '沈衍态度：', '- 承认双标', '但在他那套逻辑里', '- 戏外吐槽，带点角色沉浸，但又知道自己是在“辩解”。', '- 微信短句，1-4条，带点冷硬、自嘲与占有欲。', '在这件事上，我承认我确实双标得彻底。', '但你不一样。'].join('\n')
    expect(cleanPhoneOutput(raw)).toBe('在这件事上，我承认我确实双标得彻底。\n但你不一样。')
  })
  it('keeps ordinary chat lines', async () => {
    const { cleanPhoneOutput } = await import('./phoneGroup')
    expect(cleanPhoneOutput('别闹\n四点半了，喝水')).toBe('别闹\n四点半了，喝水')
  })
})
