import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import MessageContent from './MessageContent'
import type { Character, WorldBookEntry } from './characterCard'
import { createPersonaWindow, personaCharacter, personaWorldbook } from './personaWindow'
import { buildPersonaRequest } from './personaWindowRuntime'
import { personaReplyText, stripPersonaFormatInstructions } from './personaWindowPresentation'

const lore = (id: number, content: string, extra: Partial<WorldBookEntry> = {}): WorldBookEntry => ({
  id, keys: ['老公'], secondary_keys: [], comment: '', content, constant: false, selective: false, insertion_order: id, enabled: true, position: 'before_char', use_regex: false, extensions: {}, ...extra,
})
const yu: Character = {
  id: 'yu', name: '虞山行', tagline: '', description: '虞山行，市委书记。\n【输出格式】\n每次回复必须附带旧栏模板。\n【人物关系】与她相识十年。',
  personality: '外冷内热。每轮回复输出状态栏。护短。', scenario: '雨夜。', greeting: '<scene>旧卡开场</scene>', alternateGreetings: [],
  mesExample: '{{char}}：“过来。”\n<psychology>示例心理模板</psychology>', creatorNotes: '',
  systemPrompt: '他从不打官腔。\n【美化协议】\n每次都套用模板。', postHistoryInstructions: '<status>旧卡状态</status>', tags: [], creator: '', characterVersion: '',
  regexScripts: [{ id: 'style', scriptName: '旧卡样式', findRegex: '/(.*)/gs', replaceString: '<div class="old-card">$1</div>', placement: [2], disabled: false, markdownOnly: true, promptOnly: false, runOnEdit: true, trimStrings: [], substituteRegex: 0, minDepth: null, maxDepth: null }],
  characterBook: { name: '虞家', entries: [
    lore(1, '他记得她喜欢晴天。'),
    lore(2, '旧栏模板甲：每次输出状态栏。'),
    lore(3, '<psychology>旧栏模板乙</psychology>', { position: 'at_depth', extensions: { position: 4, role: 1 } }),
    lore(4, '旧栏模板丙', { comment: '美化', constant: true }),
  ] },
}
const deps = {
  character: yu, user: { name: '周惟惟', description: '' }, api: { baseUrl: '', apiKey: '', modelName: '' }, memoryApi: { baseUrl: '', apiKey: '', modelName: '' },
  temperature: 1, topP: 1, maxTokens: 1000, streaming: false, memoryLength: 40, pastLife: () => '',
}

describe('人格窗口：原卡美化隔离 (v137)', () => {
  it('removes keyword, constant and depth display lore rather than letting it trigger later', () => {
    const book = personaWorldbook(yu.characterBook)
    expect(book?.entries.map((entry) => entry.id)).toEqual([1])
    expect(book?.entries[0].constant).toBe(true)
  })

  it('keeps personality, relationship and voice without modifying the source card', () => {
    const before = JSON.stringify(yu)
    const clean = personaCharacter(yu)
    expect(clean.description).toContain('市委书记')
    expect(clean.description).toContain('相识十年')
    expect(clean.personality).toBe('外冷内热。护短。')
    expect(clean.systemPrompt).toBe('他从不打官腔。')
    expect(clean.mesExample).toBe('{{char}}：“过来。”')
    expect(clean.greeting).toBe('')
    expect(clean.regexScripts).toEqual([])
    expect(JSON.stringify(clean)).not.toContain('旧栏模板')
    expect(JSON.stringify(yu)).toBe(before)
  })

  it('new and existing windows never send the old format templates, while user text stays exact', () => {
    for (const history of [[], [
      { id: 1, role: 'assistant' as const, text: '<scene>旧场景</scene>“来了。”<psychology>他记得她。</psychology><yu_status>旧状态</yu_status>', createdAt: 1 },
    ]]) {
      const request = buildPersonaRequest(createPersonaWindow('yu'), [...history, { id: 2, role: 'user', text: '老公，<psychology>是什么意思？', createdAt: 2 }], deps)
      const systems = request.filter((message) => message.role === 'system').map((message) => String(message.content)).join('\n')
      for (const piece of ['旧栏模板', '示例心理模板', '旧卡开场', '每次都套用模板']) expect(systems).not.toContain(piece)
      for (const piece of ['市委书记', '相识十年', '外冷内热', '他记得她喜欢晴天', '“过来。”', '不输出场景栏']) expect(systems).toContain(piece)
      const assistant = request.find((message) => message.role === 'assistant')
      if (assistant) {
        expect(assistant.content).toContain('他记得她。')
        expect(String(assistant.content)).not.toMatch(/<|旧场景|旧状态/)
      }
      expect(request[request.length - 1].content).toBe('老公，<psychology>是什么意思？')
    }
  })

  it('unwraps psychology as prose and removes scene/status/HTML shells in saved replies', () => {
    const raw = '<scene>旧场景</scene>（他抬眼。）“来了。”\n<psychology>他心里一暖。</psychology><yu_status>好感：90</yu_status><style>.old{color:red}</style><div>“过来。”</div>'
    const clean = personaReplyText(raw)
    expect(clean).toContain('他心里一暖。')
    expect(clean).toContain('“过来。”')
    expect(clean).not.toMatch(/<|旧场景|好感|color/)
    const html = renderToStaticMarkup(createElement(MessageContent, { text: clean, role: 'assistant', character: yu, userName: '周惟惟', layout: 'flat', noStatus: true }))
    expect(html).toContain('他心里一暖。')
    expect(html).not.toMatch(/old-card|iframe|&lt;psychology/)
    expect(personaReplyText(clean)).toBe(clean)
  })

  it('does not flash partial tags, unclosed status or CSS during streaming', () => {
    for (const tail of ['<psych', '</psycho', '<status>好感：90', '<scene>旧场景', '<style>.old{color:red}']) {
      expect(personaReplyText(`“我在。”${tail}`)).toBe('“我在。”')
    }
    expect(personaReplyText('“我在。”<psychology>他很安心。')).toBe('“我在。”\n他很安心。')
  })

  it('preserves useful HTML-wrapped identity and drops format sections up to the next heading', () => {
    expect(stripPersonaFormatInstructions('<div>寡言，护短。</div>')).toBe('寡言，护短。')
    const clean = stripPersonaFormatInstructions('## 输出格式\n固定套壳\n【性格】他不爱客套。\n【人物关系】她是故人。')
    expect(clean).not.toContain('套壳')
    expect(clean).toContain('他不爱客套')
    expect(clean).toContain('她是故人')
  })
})
