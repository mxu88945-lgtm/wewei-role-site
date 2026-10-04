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
  it('accepts only body evidence, not a scene header, status-only mention or fabricated quote', () => {
    expect(parseTemporaryPlotReview('{"status":"applied","evidence":"来电显示：苏念念"}', input.reply).status).toBe('applied')
    for (const evidence of ['', '16:00｜主卧', '当前外部事件：苏念念来电', '沈衍接起了电话']) expect(parseTemporaryPlotReview(JSON.stringify({ status: 'applied', evidence }), input.reply).status).toBe('unknown')
    expect(parseTemporaryPlotReview('```json\n{"status":"ignored","evidence":""}\n```', ignored).status).toBe('ignored')
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
  it('does not treat an ignored, blocked or unknown verdict as completion or loop indefinitely', async () => {
    for (const status of ['ignored', 'blocked', 'unknown'] as const) {
      const review = vi.fn(async () => ({ status }))
      const repair = vi.fn(async () => ignored)
      const result = await checkAndRepairTemporaryPlot(ignored, review, repair)
      expect(result.applied).toBe(false)
      expect(result.verdict.status).toBe(status)
      expect(repair).toHaveBeenCalledTimes(status === 'ignored' ? 1 : 0)
      expect(review).toHaveBeenCalledTimes(status === 'ignored' ? 2 : 1)
    }
  })
  it('uses a private non-streaming bounded request and preserves directions when the check fails', async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body.stream).toBe(false)
      expect(body.max_tokens).toBe(256)
      expect(body.temperature).toBe(0)
      expect(body.messages).toHaveLength(2)
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"status":"applied","evidence":"来电显示：苏念念"}' } }] }), { headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    expect((await reviewTemporaryPlotReply({ ...input, api, signal: new AbortController().signal })).status).toBe('applied')
    fetchMock.mockResolvedValueOnce(new Response('{"error":{"message":"review unavailable"}}', { status: 400, headers: { 'content-type': 'application/json' } }))
    expect((await reviewTemporaryPlotReply({ ...input, api, signal: new AbortController().signal })).status).toBe('unknown')
  })
  it('never consumes a truncated verdict and propagates stop', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{"status":"applied","evidence":"来电显示：苏念念"}' } }] }), { headers: { 'content-type': 'application/json' } })))
    expect((await reviewTemporaryPlotReply({ ...input, api, signal: new AbortController().signal })).status).toBe('unknown')
    const controller = new AbortController()
    controller.abort()
    await expect(reviewTemporaryPlotReply({ ...input, api, signal: controller.signal })).rejects.toBeDefined()
  })
})
