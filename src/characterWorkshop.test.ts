import { describe, expect, it } from 'vitest'
import {
  applyWorkshopCopilotPatch, buildCharacterWorkshopPrompt, buildWorkshopCopilotPrompt,
  characterFromWorkshopDraft, parseCharacterWorkshopDraft, parseWorkshopCopilotResponse,
} from './characterWorkshop'
import { embedCharacterCardMetadata, readEmbeddedCharacterCard } from './characterCard'

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

  it('writes a complete V3 card into PNG metadata and reads it back', async () => {
    const draft = parseCharacterWorkshopDraft('{"name":"沈砚","description":"调查员","greeting":"你来了。","systemPrompt":"不代演用户","worldbook":[{"title":"旧案","keywords":["旧案"],"content":"三年前未结案。"}]}')
    const character = characterFromWorkshopDraft(draft)
    const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const source = Uint8Array.from(atob(base64Png), (value) => value.charCodeAt(0))
    const embedded = embedCharacterCardMetadata(source, character)
    const raw = await readEmbeddedCharacterCard(embedded.buffer as ArrayBuffer)

    expect(raw.spec).toBe('chara_card_v3')
    expect(raw.data?.name).toBe('沈砚')
    expect(raw.data?.system_prompt).toBe('不代演用户')
    expect(raw.data?.character_book?.entries[0].content).toBe('三年前未结案。')
    const bytes = new TextDecoder('latin1').decode(embedded)
    expect(bytes).toContain('chara\0')
    expect(bytes).toContain('ccv3\0')
  })

  it('parses a copilot proposal and only changes requested workshop areas', () => {
    const draft = parseCharacterWorkshopDraft('{"name":"陆景澄","description":"珠宝设计师","personality":"主动","scenario":"海外旧识","greeting":"姐姐。","worldbook":[{"title":"关系阶段","keywords":["阶段"],"content":"暧昧试探。"}]}')
    draft.regexScripts = [{
      id: 'status-1', scriptName: '旧状态栏', findRegex: '/<status>([\\s\\S]*?)<\\/status>/gi', replaceString: '<div>$1</div>',
      trimStrings: [], placement: [1, 2], disabled: false, markdownOnly: true, promptOnly: false, runOnEdit: true,
      substituteRegex: 0, minDepth: null, maxDepth: null,
    }]
    const response = parseWorkshopCopilotResponse(JSON.stringify({
      reply: '我把状态栏改成冷灰玻璃感，其他栏目不动。',
      patch: {
        summary: '更新状态栏美化',
        regexScripts: { upsert: [{ id: 'status-1', scriptName: '冷灰状态栏', replaceString: '<div class="glass">$1</div>' }] },
      },
    }))
    expect(response.patch).not.toBeNull()
    const next = applyWorkshopCopilotPatch(draft, response.patch!)
    expect(next.regexScripts[0].scriptName).toBe('冷灰状态栏')
    expect(next.regexScripts[0].findRegex).toBe(draft.regexScripts[0].findRegex)
    expect(next.greeting).toBe('姐姐。')
    expect(next.worldbook).toEqual(draft.worldbook)
  })

  it('gives the copilot compressed memory, recent chat and the current draft', () => {
    const draft = parseCharacterWorkshopDraft('{"name":"陆景澄","description":"珠宝设计师","greeting":"姐姐。"}')
    const prompt = buildWorkshopCopilotPrompt({
      draft,
      request: '气泡再冷一点',
      memory: '用户偏爱冷灰玻璃感。',
      messages: [{ id: '1', role: 'assistant', content: '上一版用了暖金色。', images: [{ id: 'shot', name: '效果图.jpg', dataUrl: 'data:image/jpeg;base64,thumb' }] }],
      pendingPatch: null,
    })
    expect(prompt).toContain('用户偏爱冷灰玻璃感')
    expect(prompt).toContain('上一版用了暖金色')
    expect(prompt).toContain('本轮附有 1 张截图')
    expect(prompt).toContain('气泡再冷一点')
    expect(prompt).toContain('陆景澄')
  })
})
