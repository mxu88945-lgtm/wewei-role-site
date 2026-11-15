import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MessageContent from './MessageContent'
import { characterCardV3Payload, embedCharacterCardMetadata, normalizeStoredCharacter, readEmbeddedCharacterCard } from './characterCard'
import {
  applyOpeningTemplatePatch, createOpeningTemplate, escapeOpeningHtml, isValidHexColor, normalizeHexColor, normalizeOpeningTemplate,
  normalizeOpeningTheme, openingLines, openingTemplateHtmlFor, parseOpeningTemplateFill, parseOpeningTemplatePatch, renderOpeningTemplate, safeOpeningImage,
  DEFAULT_OPENING_THEME, OPENING_THEME_PRESETS,
} from './openingTemplates'
import { applyWorkshopCopilotPatch, characterFromWorkshopDraft, createEmptyCharacterWorkshopDraft, parseWorkshopCopilotResponse, workshopDraftFromCharacter } from './characterWorkshop'

describe('v244 opening template', () => {
  it('escapes all card / model text', () => {
    const template = createOpeningTemplate()
    template.data.letter = '<img src=x onerror=alert(1)>'
    template.data.posts = [{ time: '"><script>', text: '</style><b>坏</b>', likes: 3, comment: "a'b" }]
    template.data.friendTags = ['<i>']
    const html = renderOpeningTemplate(template, { name: '<顾>', avatar: 'javascript:alert(1)' }, '<u>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('</style><b>')
    expect(html).toContain('&lt;i&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;顾&gt;')
    expect(html).toContain('亲爱的&lt;u&gt;：')
    expect(html).not.toContain('javascript:')
    expect(html.match(/<script>/g)).toHaveLength(1)
    expect(escapeOpeningHtml(`<&"'>`)).toBe('&lt;&amp;&quot;&#39;&gt;')
  })

  it('validates theme hex colors and falls back per key', () => {
    expect(isValidHexColor('#abc')).toBe(true)
    expect(isValidHexColor('#a1b2c3')).toBe(true)
    expect(isValidHexColor('purple')).toBe(false)
    expect(isValidHexColor('#12345')).toBe(false)
    expect(isValidHexColor('#fff;background:url(x)')).toBe(false)
    expect(normalizeHexColor('#ABC')).toBe('#aabbcc')
    const theme = normalizeOpeningTheme({ primary: '#8D7AA6', ink: 'red', bg: '#fff}body{x' })
    expect(theme.primary).toBe('#8d7aa6')
    expect(theme.ink).toBe(DEFAULT_OPENING_THEME.ink)
    expect(theme.bg).toBe(DEFAULT_OPENING_THEME.bg)
    for (const preset of OPENING_THEME_PRESETS) expect(Object.values(preset.theme).every(isValidHexColor)).toBe(true)
  })

  it('renders every color through CSS variables', () => {
    const template = { ...createOpeningTemplate(), theme: { ...OPENING_THEME_PRESETS[1].theme } }
    const html = renderOpeningTemplate(template, { name: '顾屿' }, '惟惟')
    for (const key of ['primary', 'secondary', 'accent', 'paper', 'ink', 'bg']) {
      expect(html).toContain(`--op-${key}:${template.theme[key as keyof typeof template.theme]}`)
      expect(html).toContain(`var(--op-${key})`)
    }
    // 除了变量声明，样式里不再出现主题色的字面量
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'))
    expect(css.split(template.theme.primary)).toHaveLength(2)
    expect(html).toContain('prefers-reduced-motion')
    expect(html).toContain('进入他的QQ空间')
    expect(html).not.toContain('backdrop-filter')
  })

  it('keeps data URL avatars and rejects unsafe ones', () => {
    expect(safeOpeningImage('data:image/jpeg;base64,AAAA')).toBe('data:image/jpeg;base64,AAAA')
    expect(safeOpeningImage('https://example.com/a.png')).toBe('https://example.com/a.png')
    expect(safeOpeningImage('https://x.com/a.png" onload="x')).toBe('')
    expect(safeOpeningImage('blob:abc')).toBe('')
  })

  it('leaves old cards untouched and round-trips through export/import', () => {
    const old = normalizeStoredCharacter({ id: 'o', name: '旧卡' })
    expect(old.openingTemplate).toBeUndefined()
    expect(JSON.stringify(characterCardV3Payload(old))).not.toContain('weijing_opening_template')
    expect(normalizeOpeningTemplate({ id: 'unknown' })).toBeUndefined()

    const template = createOpeningTemplate()
    template.theme.primary = '#6b90b6'
    template.data.letter = '信'
    template.data.songs = [{ title: '晴天', artist: '周杰伦' }]
    const card = normalizeStoredCharacter({ id: 'n', name: '新卡', openingTemplate: template })
    const payload = characterCardV3Payload(card) as { data: { extensions: Record<string, unknown> } }
    expect(payload.data.extensions.weijing_opening_template).toEqual(card.openingTemplate)
    const restored = normalizeStoredCharacter({ name: '新卡', openingTemplate: normalizeOpeningTemplate(JSON.parse(JSON.stringify(payload.data.extensions.weijing_opening_template))) })
    expect(restored.openingTemplate).toEqual(card.openingTemplate)
  })

  it('survives PNG metadata embedding', async () => {
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (value) => value.charCodeAt(0))
    const card = normalizeStoredCharacter({ id: 'p', name: 'PNG卡', openingTemplate: createOpeningTemplate() })
    const embedded = await readEmbeddedCharacterCard(embedCharacterCardMetadata(png, card).buffer as ArrayBuffer) as { data?: { extensions?: Record<string, unknown> } }
    expect(normalizeOpeningTemplate(embedded?.data?.extensions?.weijing_opening_template)).toEqual(card.openingTemplate)
  })

  it('shows only above the opening message and keeps the greeting text', () => {
    const character = normalizeStoredCharacter({ id: 't', name: '顾屿', openingTemplate: createOpeningTemplate() })
    expect(openingTemplateHtmlFor(character, '惟惟', { opening: true, role: 'assistant' })).toContain('亲爱的惟惟：')
    expect(openingTemplateHtmlFor(character, '惟惟', { opening: false, role: 'assistant' })).toBe('')
    expect(openingTemplateHtmlFor(character, '惟惟', { opening: true, role: 'user' })).toBe('')
    const plain = normalizeStoredCharacter({ id: 'p', name: '旧卡' })
    expect(openingTemplateHtmlFor(plain, '惟惟', { opening: true, role: 'assistant' })).toBe('')
    // 没有模板的旧卡 / 非开场消息：渲染与以前完全一样
    const html = renderToStaticMarkup(createElement(MessageContent, { text: '你来了。', role: 'assistant', character: plain, userName: '惟惟', noStatus: true, opening: true }))
    expect(html).not.toContain('message-opening-template')
    expect(html).toContain('你来了。')
    const later = renderToStaticMarkup(createElement(MessageContent, { text: '第二条。', role: 'assistant', character, userName: '惟惟', noStatus: true }))
    expect(later).not.toContain('message-opening-template')
  })

  it('parses copilot color/data patches and drops invalid colors', () => {
    const { patch, invalidColors } = parseOpeningTemplatePatch({ theme: { primary: '#8D7AA6', bg: '紫灰色' }, data: { mood: '想你', friendTags: ['嘴硬', '幼稚'] } })
    expect(patch?.theme).toEqual({ primary: '#8d7aa6' })
    expect(invalidColors).toHaveLength(1)
    expect(patch?.data).toEqual({ mood: '想你', friendTags: ['嘴硬', '幼稚'] })
    const next = applyOpeningTemplatePatch(createOpeningTemplate(), patch!)
    expect(next?.theme.primary).toBe('#8d7aa6')
    expect(next?.theme.bg).toBe(DEFAULT_OPENING_THEME.bg)
    expect(next?.data.mood).toBe('想你')
    expect(applyOpeningTemplatePatch(next, { id: 'none' })).toBeUndefined()

    const response = parseWorkshopCopilotResponse(JSON.stringify({ reply: '换好了', patch: { summary: '紫灰', openingTemplate: { theme: { primary: '#8d7aa6', ink: 'nope' } } } }))
    expect(response.patch?.openingTemplate?.theme).toEqual({ primary: '#8d7aa6' })
    expect(response.reply).toContain('已忽略')
    const draft = { ...createEmptyCharacterWorkshopDraft(), name: '顾', description: 'd', greeting: 'g', openingTemplate: createOpeningTemplate() }
    const applied = applyWorkshopCopilotPatch(draft, response.patch!)
    expect(applied.openingTemplate?.theme.primary).toBe('#8d7aa6')
    expect(applied.openingTemplate?.theme.ink).toBe(DEFAULT_OPENING_THEME.ink)
    const removed = applyWorkshopCopilotPatch(applied, { summary: '移除', openingTemplate: { id: 'none' } })
    expect(removed.openingTemplate).toBeUndefined()
  })

  it('carries the template through the workshop draft', () => {
    const card = normalizeStoredCharacter({ id: 'w', name: '顾', openingTemplate: createOpeningTemplate() })
    const draft = workshopDraftFromCharacter(card)
    expect(draft.openingTemplate).toEqual(card.openingTemplate)
    expect(characterFromWorkshopDraft({ ...draft, description: 'd' }).openingTemplate).toEqual(card.openingTemplate)
  })

  it('parses AI fill JSON and line editors', () => {
    const data = parseOpeningTemplateFill('```json\n{"letter":"给{{user}}","posts":[{"time":"08.16","text":"今天","likes":"12","comment":"阿哲：嗯"}],"songs":["晴天"],"chats":[{"time":"20:06","text":"在吗"},{"text":"x"},{"text":"y"}]}\n```')
    expect(data.letter).toBe('给{{user}}')
    expect(data.posts[0].likes).toBe(12)
    expect(data.songs[0]).toEqual({ title: '晴天', artist: '' })
    expect(data.chats).toHaveLength(2)
    expect(() => parseOpeningTemplateFill('不是 JSON')).toThrow()
    expect(openingLines.posts.parse('08.16｜今天的月亮｜12｜阿哲：嗯')).toEqual([{ time: '08.16', text: '今天的月亮', likes: 12, comment: '阿哲：嗯' }])
    expect(openingLines.songs.parse('晴天 | 周杰伦\n七里香')).toEqual([{ title: '晴天', artist: '周杰伦' }, { title: '七里香', artist: '' }])
    expect(openingLines.tags.parse('嘴硬，幼稚、神秘')).toEqual(['嘴硬', '幼稚', '神秘'])
  })
})
