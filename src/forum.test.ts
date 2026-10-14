import { describe, expect, it } from 'vitest'
import { floorNumber, floorsText, parseFloors, parseThreadDraft, pickForumReaders, sortThreads, threadsFromMoments, type ForumThread } from './forum'

const thread = (over: Partial<ForumThread> = {}): ForumThread => ({ id: 't', board: '日常', title: '标题', authorId: 'a', body: '正文', createdAt: 0, updatedAt: 0, floors: [], likes: [], ...over })

describe('forum', () => {
  it('parses thread drafts', () => {
    expect(parseThreadDraft('```json\n{"board":"吐槽","title":"有人管管","body":"真受不了","anonymous":true}\n```')).toEqual({ board: '吐槽', title: '有人管管', body: '真受不了', anonymous: true })
    expect(parseThreadDraft('{"board":"乱写","title":"x","body":"y"}')?.board).toBeUndefined()
    expect(parseThreadDraft('没有 json')).toBeNull()
  })
  it('parses floors and clamps reply targets', () => {
    const parsed = parseFloors('{"likes":["沈衍"],"floors":[{"author":"沈衍","reply_to_floor":1,"text":"沙发"},{"author":"傅承砚","reply_to_floor":99,"text":"x"},{"author":"","text":"y"}]}', 5)
    expect(parsed.likes).toEqual(['沈衍'])
    expect(parsed.floors).toHaveLength(2)
    expect(parsed.floors[1].replyToFloor).toBe(0)
  })
  it('numbers floors from 2 and renders text', () => {
    expect(floorNumber(0)).toBe(2)
    const text = floorsText(thread({ floors: [{ id: '1', authorId: 'b', text: '哈', createdAt: 1 }, { id: '2', authorId: 'a', text: '滚', replyToFloor: 2, anonymous: true, createdAt: 2 }] }), (id) => id.toUpperCase())
    expect(text).toContain('2楼 B：哈')
    expect(text).toContain('3楼 匿名 回复2楼：滚')
  })
  it('keeps pinned first and sorts by recency', () => {
    const sorted = sortThreads([thread({ id: 'old', updatedAt: 1 }), thread({ id: 'new', updatedAt: 5 }), thread({ id: 'pin', pinned: true, updatedAt: 0 })], 'new')
    expect(sorted.map((item) => item.id)).toEqual(['pin', 'new', 'old'])
  })
  it('prioritises op and mentioned readers', () => {
    const readers = pickForumReaders(['a', 'b', 'c', 'd'], thread({ authorId: 'c' }), ['d'], 2, () => .3)
    expect(readers).toEqual(['c', 'd'])
  })
  it('migrates moments', () => {
    const [migrated] = threadsFromMoments([{ id: 'm', authorId: 'a', text: '今天好累。想睡', createdAt: 1, visibility: { kind: 'all' }, likes: ['b'], comments: [{ id: 'c', authorId: 'b', text: '睡', createdAt: 2 }] }])
    expect(migrated.title).toBe('今天好累')
    expect(migrated.floors).toHaveLength(1)
    expect(migrated.updatedAt).toBe(2)
  })
})
