import { describe, expect, it } from 'vitest'
import type { PastLifeBlock, PersonaMessage } from './personaWindow'
import { chunkPastLife, pastLifeBlocksFromText, pastLifeChunksFrom, recallPastLife, withPastLifeRecall, PAST_LIFE_CHUNK_MAX, PAST_LIFE_RECALL_BUDGET } from './personaPastLifeRecall'
import type { PersonaMemoryContext } from './personaWindowMemory'

const block = (title: string, kind: string, lines: string[], extra: Partial<PastLifeBlock> = {}): PastLifeBlock => ({ conversationId: title, title, kind, source: 'memory', bound: false, text: `〔${extra.bound ? '绑定的剧本｜' : ''}${kind}｜${title}〕\n${lines.join('\n')}`, ...extra })
const filler = (seed: string, n: number) => Array.from({ length: n }, (_, index) => `· ${seed}第${index}件事：那天傍晚他们沿着河堤散步，说了很多零碎的话，风很大，路灯一盏一盏亮起来。`)
const user = (text: string, id = 1): PersonaMessage => ({ id, role: 'user', text, createdAt: id })

const pool = () => chunkPastLife([
  block('雨夜长剧情', '长剧情', ['他记得的事：', ...filler('雨夜', 14), '经过：', '顾祁砚在书房等她到凌晨，两人第一次说开了心事，他答应再也不瞒她。'], { bound: true, names: ['沈砚'] }),
  block('奶茶小分队', '小手机群聊', ['他记得的事：', '· 顾祁砚答应周末请大家喝奶茶。', '最后聊到的：', '林晚：周六三点老地方见', '周惟惟：我要芋泥波波', ...filler('群里', 8)]),
  block('幕后手记与戏外私聊', '幕后手记', ['她护着别人，我吃醋。', '你吃醋啦？才没有。']),
])

describe('v226 前世记忆按需召回 · 切块', () => {
  it('splits each source into ~300–600 char chunks that keep their source label', () => {
    const chunks = pool()
    expect(chunks.length).toBeGreaterThanOrEqual(4)
    for (const chunk of chunks) {
      expect(chunk.text.startsWith(`〔`)).toBe(true)
      expect(chunk.text.length).toBeLessThanOrEqual(PAST_LIFE_CHUNK_MAX + 200)
      expect(chunk.label).toMatch(/长剧情｜雨夜长剧情|小手机群聊｜奶茶小分队|幕后手记｜幕后手记与戏外私聊/)
    }
    const rain = chunks.filter((chunk) => chunk.title === '雨夜长剧情')
    expect(rain.length).toBeGreaterThan(1)
    expect(rain.slice(0, -1).every((chunk) => chunk.text.length >= 300)).toBe(true)
    // A continued section keeps its sub-heading.
    expect(rain.every((chunk) => /他记得的事：|经过：/.test(chunk.text))).toBe(true)
    expect(rain.every((chunk) => chunk.bound)).toBe(true)
    expect(new Set(chunks.map((chunk) => chunk.key)).size).toBe(chunks.length)
  })

  it('parses the plain-text form back into labelled blocks, and wraps headerless text as one block', () => {
    const blocks = pastLifeBlocksFromText('【X的前世记忆】说明\n\n〔绑定的剧本｜长剧情｜雨夜〕\n经过：\n一些事\n\n〔小手机群聊｜奶茶〕\n· 喝奶茶')
    expect(blocks.map((item) => [item.kind, item.title, item.bound])).toEqual([['长剧情', '雨夜', true], ['小手机群聊', '奶茶', false]])
    expect(pastLifeChunksFrom('旧缘：雨夜')).toHaveLength(1)
    expect(pastLifeChunksFrom('')).toEqual([])
  })

  it('cuts a single huge line on a sentence boundary', () => {
    const chunks = chunkPastLife([block('长文', '长剧情', ['经过：', '他走了很远的路。'.repeat(200)])])
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    expect(chunks.every((chunk) => chunk.text.length <= PAST_LIFE_CHUNK_MAX + 40)).toBe(true)
  })
})

describe('v226 前世记忆按需召回 · 打分', () => {
  it('sends nothing when the conversation does not touch the past life', () => {
    for (const text of ['早上好', '今天工作好累啊，想吃火锅', '嗯嗯', '好的']) {
      const recall = recallPastLife(pool(), { history: [user(text)], charName: '顾祁砚', userName: '周惟惟' })
      expect(recall.text).toBe('')
      expect(recall.chunks).toEqual([])
    }
  })

  it('recalls when she names a bound story / group title', () => {
    const recall = recallPastLife(pool(), { history: [user('奶茶小分队最近怎么样')] })
    expect(recall.chunks.length).toBeGreaterThan(0)
    expect(recall.chunks.every((chunk) => chunk.title === '奶茶小分队')).toBe(true)
    expect(recall.text.startsWith('【前世记忆·按需召回｜只读】')).toBe(true)
  })

  it('recalls on a character name from those stories, but not on his own or her name', () => {
    expect(recallPastLife(pool(), { history: [user('林晚最近还好吗')] }).chunks[0]?.title).toBe('奶茶小分队')
    expect(recallPastLife(pool(), { history: [user('顾祁砚你在干嘛')], charName: '顾祁砚', userName: '周惟惟' }).chunks).toEqual([])
  })

  it('recall cues (以前/还记得/那次) plus a topical word find the right chunk; bound stories rank first on ties', () => {
    const recall = recallPastLife(pool(), { history: [user('还记得那次你在书房等我到凌晨吗')] })
    expect(recall.chunks[0].text).toContain('书房等她到凌晨')
  })

  it('uses 关键词与别名 aliases', () => {
    const chunks = chunkPastLife([block('小鸟', '小手机私聊', ['· 他给玄凤起名叫布丁，每天早上喂小米。'])])
    expect(recallPastLife(chunks, { history: [user('以前那只小鸟你还记得吗')], aliases: '小鸟|玄凤|布丁' }).chunks).toHaveLength(1)
  })

  it('stays within ~1800 chars and at most 4 chunks', () => {
    const many = chunkPastLife(Array.from({ length: 6 }, (_, index) => block(`雨夜${index}`, '长剧情', filler('雨夜书房', 12))))
    const recall = recallPastLife(many, { history: [user('还记得雨夜书房的事吗')] })
    expect(recall.chunks.length).toBeGreaterThan(0)
    expect(recall.chunks.length).toBeLessThanOrEqual(4)
    expect(recall.text.length).toBeLessThanOrEqual(PAST_LIFE_RECALL_BUDGET)
  })

  it('cools a chunk down for a few turns unless she explicitly asks again', () => {
    const chunks = pool()
    const first = recallPastLife(chunks, { history: [user('奶茶小分队最近怎么样')], turn: 5 })
    const ledger = Object.fromEntries(first.keys.map((key) => [key, 5]))
    const again = recallPastLife(chunks, { history: [user('奶茶小分队最近怎么样')], turn: 6, ledger })
    expect(again.chunks).toEqual([])
    expect(again.suppressed).toBeGreaterThan(0)
    expect(recallPastLife(chunks, { history: [user('奶茶小分队你还记得吗')], turn: 6, ledger }).chunks.length).toBeGreaterThan(0)
    expect(recallPastLife(chunks, { history: [user('奶茶小分队最近怎么样')], turn: 9, ledger }).chunks.length).toBeGreaterThan(0)
  })

  it('records the lane: N 字 when recalled, 未带入 otherwise', () => {
    const base: PersonaMemoryContext = { text: '', stableText: '', dynamicText: '近期', audit: { query: '', budget: 6400, used: 0, lanes: [], sources: [] }, keys: [], turn: 1 }
    const hit = withPastLifeRecall(base, recallPastLife(pool(), { history: [user('奶茶小分队最近怎么样')] }))
    expect(hit.dynamicText.startsWith('近期\n\n【前世记忆·按需召回｜只读】')).toBe(true)
    expect(hit.audit.lanes[0]).toMatchObject({ key: 'past-life', label: '前世记忆 · 按需召回' })
    expect(hit.audit.pastLife!.chars).toBeGreaterThan(0)
    const miss = withPastLifeRecall(base, recallPastLife(pool(), { history: [user('早上好')] }))
    expect(miss.dynamicText).toBe('近期')
    expect(miss.audit.lanes[0].chars).toBe(0)
    expect(miss.audit.lanes[0].preview).toContain('本轮未召回')
    expect(withPastLifeRecall(base, null).audit.pastLife!.enabled).toBe(false)
  })
})
