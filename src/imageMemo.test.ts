import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatApiMessage } from './chatApi'
import type { ChatImage } from './chatImages'
import { prepareChatImage, CHAT_IMAGE_PREPARE_TIMEOUT_MS } from './chatImages'
import {
  ARCHIVED_IMAGE_FALLBACK, IMAGE_MEMO_PROMPT, archivedImageText, clipImageMemo, currentImageTurn, extractImageMemo,
  findRecallImage, planImageWire, stripImageMemo, withImageMemo,
} from './imageMemo'
import { buildChatPrompt } from './promptBuilder'
import { foldPromptForRelay } from './promptTail'
import { sanitizeAssistantOutput } from './outputSanitizer'
import { personaReplyText } from './personaWindowPresentation'
import { planPersonaRequest } from './personaWindowRuntime'
import { activeThread, type PersonaMessage } from './personaWindow'
import { FIXTURE_NOW, fixtureDeps, fixtureHistory, fixturePersona } from './personaPromptFixture'

const pic = (id: string, memo?: string): ChatImage => ({ id, dataUrl: `data:image/jpeg;base64,PIXELS_${id}`, width: 1280, height: 960, ...(memo ? { memo } : {}) })
const wire = (messages: ChatApiMessage[]) => JSON.stringify(messages)
const pixelCount = (messages: ChatApiMessage[]) => (wire(messages).match(/data:image\/jpeg;base64,PIXELS_/g) || []).length
const historyTexts = (messages: ChatApiMessage[]) => messages.filter((message) => message.role !== 'system').map((message) => typeof message.content === 'string' ? message.content : message.content.filter((part) => part.type === 'text').map((part) => part.type === 'text' ? part.text : '').join('|'))

describe('图记 pure helpers (v250)', () => {
  it('clips memos to 40 chars and archives with fallback', () => {
    expect(Array.from(clipImageMemo('图'.repeat(60))).length).toBe(40)
    expect(archivedImageText([pic('a', '一只玄凤站在键盘上')])).toBe('【此前发过的图片：一只玄凤站在键盘上】')
    expect(archivedImageText([pic('a')])).toBe(ARCHIVED_IMAGE_FALLBACK)
    expect(archivedImageText([{ ...pic('v'), fromVideo: true }])).toBe('【此前发过的一段视频】')
  })

  it('current image turn = trailing run of user messages, ignoring replies after it', () => {
    const rows = [{ role: 'user' }, { role: 'assistant' }, { role: 'user' }, { role: 'user' }, { role: 'assistant' }]
    expect(currentImageTurn(rows)).toEqual([2, 3])
    expect(currentImageTurn([{ role: 'assistant' }])).toEqual([])
    // group chat: another member's reply sent as user-side text is not her turn
    expect(currentImageTurn([{ role: 'user' }, { role: 'assistant', promptRole: 'user' }])).toEqual([0])
  })

  it('strips [图记:…] in final text and a half-written tail while streaming', () => {
    expect(stripImageMemo('嗯，好看。\n[图记:窗台上的玄凤在晒太阳]')).toBe('嗯，好看。')
    expect(stripImageMemo('嗯。【图记：猫】后面')).toBe('嗯。后面')
    for (const partial of ['好看。[', '好看。[图', '好看。[图记', '好看。【图记：窗台上']) expect(stripImageMemo(partial)).toBe(partial.endsWith('[') ? partial : '好看。')
    expect(sanitizeAssistantOutput('好看。\n[图记:窗台上的玄凤]')).toBe('好看。')
    expect(personaReplyText('好看。\n[图记:窗台上的玄凤]')).toBe('好看。')
    expect(personaReplyText('好看。\n[图记:窗台')).toBe('好看。')
    expect(extractImageMemo('好看。\n[图记:窗台上的玄凤在晒太阳]')).toBe('窗台上的玄凤在晒太阳')
    expect(extractImageMemo('没有标记')).toBe('')
  })

  it('stores the memo once on the first picture of the turn', () => {
    const rows = [{ id: 1, role: 'user', images: [pic('a'), pic('b')] }, { id: 2, role: 'assistant' }]
    const next = withImageMemo(rows, (message) => message.id === 1, '窗台上的玄凤')
    expect(next[0].images?.[0].memo).toBe('窗台上的玄凤')
    expect(next[0].images?.[1].memo).toBeUndefined()
    expect(withImageMemo(next, (message) => message.id === 1, '别的')).toBe(next)
    expect(withImageMemo(rows, () => false, '别的')).toBe(rows)
  })

  it('recall: phrase → newest picture; memo words → that picture; nothing else → none; max one', () => {
    const all = [
      { role: 'user', text: '', images: [pic('old', '海边落日和小狗')] },
      { role: 'assistant', text: '嗯' },
      { role: 'user', text: '', images: [pic('new', '书桌上的咖啡和电脑')] },
      { role: 'assistant', text: '嗯' },
    ]
    expect(findRecallImage(all, '那张图你再看看')?.id).toBe('new')
    expect(findRecallImage(all, '还记得海边落日吗')?.id).toBe('old')
    expect(findRecallImage(all, '今天好累')).toBeNull()
    const named = [{ role: 'user', images: [{ id: 'shot', dataUrl: 'data:,', memo: '谢聿衡的小天地设置截图' }] }] as never
    expect(findRecallImage(named, '好个谢聿衡，哈哈', ['谢聿衡', '周惟惟'])).toBeNull()
    expect(findRecallImage(named, '小天地设置那页', ['谢聿衡'])?.id).toBe('shot')
    const plan = planImageWire([...all, { role: 'user', text: '刚才的照片里是什么' }])
    expect(plan.live.size).toBe(0)
    expect(plan.recall).toMatchObject({ index: 4, image: { id: 'new' } })
    expect(plan.wantsMemo).toBe(false)
  })
})

const character = { id: 'c', name: '顾荒', tagline: '', description: '设定', personality: '', scenario: '', greeting: '', alternateGreetings: [], mesExample: '', creatorNotes: '', systemPrompt: '', postHistoryInstructions: '', beautificationProtocol: '', tags: [], creator: '', characterVersion: '', regexScripts: [], characterBook: { name: '', entries: [] } } as unknown as Parameters<typeof buildChatPrompt>[0]['character']
type Row = { id: number; role: 'user' | 'assistant'; text: string; images?: ChatImage[] }
const base = (count: number): Row[] => Array.from({ length: count }, (_, index) => ({ id: index + 1, role: index % 2 ? 'assistant' : 'user', text: `第${index + 1}条` }))
const story = (messages: Row[], extra: Partial<Parameters<typeof buildChatPrompt>[0]> = {}) => foldPromptForRelay(buildChatPrompt({ character, user: { name: '惟惟', description: '' }, messages, preset: '', globalWorldbook: '', memory: { entries: [], injectPosition: 'after-main-prompt', injectPrompt: '' }, memoryLength: 20, cacheLayout: true, ...extra }))

describe('main chat image wire (v250)', () => {
  it('image turn: real pixels once + one-line memo prompt in the turn tail; regenerate still sends it', () => {
    const rows: Row[] = [...base(10), { id: 11, role: 'user', text: '看我家小鸡', images: [pic('a')] }]
    const request = story(rows)
    expect(pixelCount(request)).toBe(1)
    const last = request[request.length - 1]
    expect(last.role).toBe('user')
    expect(wire([last])).toContain('图记')
    expect(wire(request.slice(0, 1))).not.toContain('图记')
    // 重新生成：历史仍以这条带图的用户消息结尾
    expect(pixelCount(story(rows))).toBe(1)
  })

  it('next turn: only the memo line, no pixels, no prompt; nothing accumulates over turns', () => {
    const rows: Row[] = [...base(10), { id: 11, role: 'user', text: '看我家小鸡', images: [pic('a', '九只玄凤挤在笼子顶上')] }, { id: 12, role: 'assistant', text: '好多。' }]
    let all = [...rows, { id: 13, role: 'user' as const, text: '今天好累' }]
    let request = story(all)
    expect(pixelCount(request)).toBe(0)
    expect(wire(request)).toContain('【此前发过的图片：九只玄凤挤在笼子顶上】')
    expect(wire(request)).not.toContain('应用提示')
    for (let turn = 0; turn < 4; turn++) {
      all = [...all, { id: 14 + turn * 2, role: 'assistant', text: '嗯。' }, { id: 15 + turn * 2, role: 'user', text: '嗯' }]
      request = story(all)
      expect(pixelCount(request)).toBe(0)
      expect((wire(request).match(/此前发过的图片/g) || []).length).toBe(1)
      expect(wire(request)).not.toContain('应用提示')
    }
  })

  it('recall: a turn that refers back re-attaches that one original for that turn only', () => {
    const rows: Row[] = [...base(10), { id: 11, role: 'user', text: '', images: [pic('a', '九只玄凤挤在笼子顶上')] }, { id: 12, role: 'assistant', text: '好多。' }]
    const asked = story([...rows, { id: 13, role: 'user', text: '你再看看那张图' }])
    expect(pixelCount(asked)).toBe(1)
    expect(wire(asked.slice(-1))).toContain('PIXELS_a')
    const byMemo = story([...rows, { id: 13, role: 'user', text: '笼子顶上那几只最闹' }])
    expect(pixelCount(byMemo)).toBe(1)
    const later = story([...rows, { id: 13, role: 'user', text: '你再看看那张图' }, { id: 14, role: 'assistant', text: '看了。' }, { id: 15, role: 'user', text: '晚安' }])
    expect(pixelCount(later)).toBe(0)
  })

  it('image turns never evict normal history', () => {
    const plain: Row[] = [...base(30), { id: 31, role: 'user', text: '看' }]
    const withImage: Row[] = plain.map((row) => row.id === 31 ? { ...row, images: [pic('a'), pic('b'), pic('c'), pic('d')] } : row)
    const a = story(plain), b = story(withImage)
    expect(a.length).toBe(b.length)
    expect(historyTexts(a).slice(0, -1)).toEqual(historyTexts(b).slice(0, -1))
  })

  it('continue-without-user rounds do not resend the picture', () => {
    const rows: Row[] = [...base(4), { id: 5, role: 'user', text: '看', images: [pic('a')] }, { id: 6, role: 'assistant', text: '嗯' }]
    expect(pixelCount(story(rows, { noLiveImages: true }))).toBe(0)
    expect(wire(story(rows, { noLiveImages: true }))).not.toContain('应用提示')
  })
})

describe('人格窗口 image wire (v250)', () => {
  afterEach(() => { vi.useRealTimers() })
  const plan = (history: PersonaMessage[], options: Parameters<typeof planPersonaRequest>[4] = {}) => {
    const persona = fixturePersona()
    return planPersonaRequest(persona, history, fixtureDeps({ memoryLength: 40 }), { ...activeThread(persona), messages: history }, options)
  }
  const withLast = (images: ChatImage[] | undefined, text = '看我家小鸡') => { const rows = fixtureHistory(text); const last = rows[rows.length - 1]; return [...rows.slice(0, -1), { ...last, ...(images ? { images } : {}) }] }

  it('sends the picture natively only on its turn, with the 图记 line in the per-turn tail only', () => {
    vi.useFakeTimers(); vi.setSystemTime(FIXTURE_NOW)
    const result = plan(withLast([pic('a')]))
    expect(pixelCount(result.messages)).toBe(1)
    expect(result.parts.find((part) => part.key === 'image-memo')?.where).toBe('turn')
    expect(wire(result.messages.slice(0, 1))).not.toContain(IMAGE_MEMO_PROMPT)
    expect(wire(result.messages.slice(-1))).toContain(IMAGE_MEMO_PROMPT)
  })

  it('archives on the next turn, recalls on demand, keeps the system prefix and history unchanged', () => {
    vi.useFakeTimers(); vi.setSystemTime(FIXTURE_NOW)
    const imageTurn = withLast([pic('a', '九只玄凤挤在笼子顶上')])
    const next = [...imageTurn, { id: 900, role: 'assistant' as const, text: '好多。', createdAt: FIXTURE_NOW }, { id: 901, role: 'user' as const, text: '今天好累', createdAt: FIXTURE_NOW }]
    const archived = plan(next)
    expect(pixelCount(archived.messages)).toBe(0)
    expect(wire(archived.messages)).toContain('【此前发过的图片：九只玄凤挤在笼子顶上】')
    expect(archived.parts.some((part) => part.key === 'image-memo')).toBe(false)
    const recall = plan([...next.slice(0, -1), { id: 901, role: 'user', text: '刚才那张照片你看清了吗', createdAt: FIXTURE_NOW }])
    expect(pixelCount(recall.messages)).toBe(1)
    // 同样的历史、不带图：除最后一条外逐条一样，第一条 system 字节不变
    const plain = plan(next.map((row) => ({ ...row, images: undefined })))
    expect(wire(plain.messages.slice(0, 1))).toBe(wire(archived.messages.slice(0, 1)))
    expect(plain.messages.length).toBe(archived.messages.length)
  })

  it('an app event turn (task done) does not resend the picture', () => {
    vi.useFakeTimers(); vi.setSystemTime(FIXTURE_NOW)
    expect(pixelCount(plan(withLast([pic('a')]), { event: '【应用事件】任务完成' }).messages)).toBe(0)
  })
})

describe('send never hangs on a picture that will not decode (v250)', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  it('prepareChatImage gives up after the cap with a readable error', async () => {
    vi.useFakeTimers()
    class StuckImage { onload: null | (() => void) = null; onerror: null | (() => void) = null; src = '' }
    vi.stubGlobal('Image', StuckImage)
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined })
    const pending = prepareChatImage({ name: 'IMG_1.HEIC', type: 'image/heic', size: 1000 } as File)
    const caught = pending.catch((error: Error) => error.message)
    await vi.advanceTimersByTimeAsync(CHAT_IMAGE_PREPARE_TIMEOUT_MS + 10)
    expect(await caught).toMatch(/超时/)
  })
})
