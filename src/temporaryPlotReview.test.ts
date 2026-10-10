import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildTemporaryPlotReviewMessages, checkAndRepairTemporaryPlot, parseTemporaryPlotReview, reviewTemporaryPlotReply } from './temporaryPlotReview'
import { captureTemporaryPlot, consumeTemporaryPlot } from './temporaryPlot'
import { runStoryScript, type StoryScript } from './storyScripts'
import type { Conversation } from './conversationLifecycle'

const input = { direction: '让苏念念给沈衍打电话，想约他见面。', speakerName: '共演厅·旁白导演', director: true, recentHistory: '老宅专线已被物理断电。', reply: '<scene>16:00｜主卧</scene>手机屏幕亮起，来电显示：苏念念。铃声打破室内的安静。<director_status>当前外部事件：苏念念来电</director_status>' }
const ignored = '<scene>16:00｜主卧</scene>室内仍一片安静，落地钟继续走动。<director_status>当前外部事件：老宅专线已被物理断电</director_status>'
const api = { baseUrl: 'https://relay.example/v1', apiKey: 'test', modelName: 'model' }
afterEach(() => vi.unstubAllGlobals())

describe('backstage arrangement review', () => {
  it('parses verdicts from fenced, chatty or differently-cased checker output', () => {
    expect(parseTemporaryPlotReview('{"status":"applied","evidence":"来电显示：苏念念"}', input.reply).status).toBe('applied')
    // An explicit "applied" verdict is trusted even when its quote is paraphrased or missing.
    for (const evidence of ['', '16:00｜主卧', '当前外部事件：苏念念来电', '沈衍接起了电话']) expect(parseTemporaryPlotReview(JSON.stringify({ status: 'applied', evidence }), input.reply).status).toBe('applied')
    expect(parseTemporaryPlotReview('{"status":"Applied","evidence":"找到了 Born To Die 的黑胶"}', '姐姐，我找到了一张 Lana Del Rey《Born to Die》的黑胶。').status).toBe('applied')
    expect(parseTemporaryPlotReview('```json\n{"status":"ignored","evidence":""}\n```', ignored).status).toBe('ignored')
    // Re-quoted with other quote marks, spacing or an ellipsis still matches the body.
    expect(parseTemporaryPlotReview('{"status":"applied","evidence":"来电显示: 苏念念"}', input.reply).status).toBe('applied')
    expect(parseTemporaryPlotReview('{"status":"applied","evidence":"手机屏幕亮起……铃声打破室内的安静"}', input.reply).status).toBe('applied')
    expect(parseTemporaryPlotReview('<think>看一下</think>判定如下：{"status":"applied","evidence":"“手机屏幕亮起”"}', input.reply).status).toBe('applied')
    for (const verdict of ['invalid', 'null', 'true', '{"status":"successful"}']) expect(parseTemporaryPlotReview(verdict, input.reply).status).toBe('unknown')
  })
  it('isolates the review from roleplay and excludes status metadata from its evidence', () => {
    const messages = buildTemporaryPlotReviewMessages(input)
    const data = JSON.parse(String(messages[1].content))
    expect(data.direction).toBe(input.direction)
    expect(data.body).toContain('手机屏幕亮起')
    expect(data.body).not.toContain('当前外部事件')
    expect(data.body).not.toContain('16:00')
    expect(messages[0].content).toContain('只续写旧剧情')
    expect(messages[0].content).toContain('不要求主角接听')
  })
  it('re-asks an unclear check once before giving up', async () => {
    const review = vi.fn().mockResolvedValueOnce({ status: 'unknown' }).mockResolvedValueOnce({ status: 'applied' })
    const repair = vi.fn(async () => input.reply)
    expect((await checkAndRepairTemporaryPlot(input.reply, review, repair)).applied).toBe(true)
    expect(review).toHaveBeenCalledTimes(2)
    expect(repair).not.toHaveBeenCalled()
  })
  it('reviews once and does not regenerate an applied reply', async () => {
    const review = vi.fn(async () => ({ status: 'applied' as const }))
    const repair = vi.fn(async () => input.reply)
    expect((await checkAndRepairTemporaryPlot(input.reply, review, repair)).applied).toBe(true)
    expect(review).toHaveBeenCalledOnce()
    expect(repair).not.toHaveBeenCalled()
  })
  it('repairs a missed phone event once and only consumes the pending script after confirmation', async () => {
    const script: StoryScript = { id: 'phone', name: '配角来电', prompt: input.direction, writes: [], mode: 'once', runOnce: true, recipientIds: ['director'] }
    const source: Conversation = { id: 'group', kind: 'group', characterId: 'actor', directorCharacterId: 'director', participantIds: ['actor', 'director'], title: '共演厅', messages: [], createdAt: 1, updatedAt: 1, storyScripts: [script] }
    const queued = runStoryScript(source, 'phone', 2, 'pending').conversation
    const review = vi.fn().mockResolvedValueOnce({ status: 'ignored' }).mockResolvedValueOnce({ status: 'applied' })
    const repair = vi.fn(async () => input.reply)
    const result = await checkAndRepairTemporaryPlot(ignored, review, repair)
    expect(result.reply).toBe(input.reply)
    expect(repair).toHaveBeenCalledOnce()
    expect(review).toHaveBeenLastCalledWith(input.reply)
    const captured = captureTemporaryPlot(queued, true, 'director')
    expect(captureTemporaryPlot(queued, true, 'actor')).toBeUndefined()
    expect((result.applied ? consumeTemporaryPlot(queued, captured, 0) : queued).temporaryPlot).toBeUndefined()
    expect(source.messages).toEqual([])
  })
  it('consumes a fulfilled once-plot when the checker errors or cannot decide (stuck "待使用" bug)', async () => {
    const group: Conversation = { id: 'group', kind: 'group', characterId: 'gu', participantIds: ['gu', 'director'], title: '群聊', messages: [], createdAt: 1, updatedAt: 1, historyRevision: 3, temporaryPlot: { id: 'vinyl', text: '顾星辞告诉姐姐他找到了一张 Lana Del Rey 的 Born to Die 黑胶', mode: 'once' } }
    const reply = '顾星辞把唱片举到你面前：“姐姐，我找到了 Lana Del Rey 的《Born to Die》黑胶。”'
    // Relay hiccup / reasoning-only answer / unparsable JSON → unknown twice.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"busy"}}', { status: 400, headers: { 'content-type': 'application/json' } })))
    const review = (text: string) => reviewTemporaryPlotReply({ ...input, direction: group.temporaryPlot!.text, reply: text, api, signal: new AbortController().signal })
    const repair = vi.fn(async () => reply)
    const result = await checkAndRepairTemporaryPlot(reply, review, repair)
    expect(result.verdict.status).toBe('unknown')
    expect(result.applied).toBe(true)
    expect(repair).not.toHaveBeenCalled()
    const captured = captureTemporaryPlot(group, true, 'gu')
    expect(consumeTemporaryPlot(group, captured, 3).temporaryPlot).toBeUndefined()
    const counted: Conversation = { ...group, temporaryPlot: { ...group.temporaryPlot!, mode: 'counted', remainingUses: 2 } }
    expect(consumeTemporaryPlot(counted, captureTemporaryPlot(counted, true, 'gu'), 3).temporaryPlot?.remainingUses).toBe(1)
  })
  it('keeps the direction pending only for a definite ignored/blocked verdict and never loops', async () => {
    for (const status of ['ignored', 'blocked'] as const) {
      const review = vi.fn(async () => ({ status }))
      const repair = vi.fn(async () => ignored)
      const result = await checkAndRepairTemporaryPlot(ignored, review, repair)
      expect(result.applied).toBe(false)
      expect(result.verdict.status).toBe(status)
      expect(repair).toHaveBeenCalledTimes(status === 'ignored' ? 1 : 0)
      expect(review).toHaveBeenCalledTimes(status === 'blocked' ? 1 : 2)
    }
  })
  it('uses a private non-streaming bounded request and preserves directions when the check fails', async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.stream).toBe(false)
      expect(body.max_tokens).toBe(2000)
      expect(body.temperature).toBe(0)
      expect(body.messages).toHaveLength(2)
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"status":"applied","evidence":"来电显示：苏念念"}' } }] }), { headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    expect((await reviewTemporaryPlotReply({ ...input, api, signal: new AbortController().signal })).status).toBe('applied')
    fetchMock.mockResolvedValueOnce(new Response('{"error":{"message":"review unavailable"}}', { status: 400, headers: { 'content-type': 'application/json' } }))
    expect((await reviewTemporaryPlotReply({ ...input, api, signal: new AbortController().signal })).status).toBe('unknown')
  })
  it('never consumes a partial verdict and propagates stop', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{"status":"applied","evidence":"来电显' } }] }), { headers: { 'content-type': 'application/json' } })))
    expect((await reviewTemporaryPlotReply({ ...input, api, signal: new AbortController().signal })).status).toBe('unknown')
    const controller = new AbortController()
    controller.abort()
    await expect(reviewTemporaryPlotReply({ ...input, api, signal: controller.signal })).rejects.toBeDefined()
  })
})
